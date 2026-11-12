# Response-curve engine (v1)

`id: 'response-curve'`, `version: '1.0.0'`. A second `PlanEngine` behind the engine port. It is **not the default**: customers still see `placeholderEngine`. Select it for QA with `localStorage['mediaplan-engine'] = 'response-curve'` and a reload.

**This is a prior-based model, not a fitted one.** No customer data exists yet. Every number that does not come from the plan itself is a stated assumption in `./priors`. The engine turns those assumptions into ranges. It does not know whether they are right.

## The model in plain English

**What it assumes**

1. **Each channel has diminishing returns.** The first euro buys the most; every further euro buys a little less. How fast returns fall is set by the channel's own saturation ceiling. The starting efficiency is set by the channel's buying model, price and funnel rates. Edit any of them and the curve moves.
2. **The plan's inputs are the middle of the range, not the truth.** For each channel the engine asks "how wrong could this efficiency be?" The answer depends on how much of the funnel the price covers (pay-per-conversion is near-certain on cost per conversion; CPM and fixed fees are widest) and on how proven the channel is (the industry packs' `proven` / `experimental` / `restricted` tags).
3. **Channels are wrong together, partly.** If the landing page converts worse than planned, every channel suffers. So channel errors are correlated: 0.6 inside a channel family, 0.3 across families. This is why the plan's range does not shrink to nothing when you add channels.
4. **A customer's value arrives over time.** The lifetime value you state is spread over 36 months by a retention curve for your industry. Month 1 earns only its share. Payback is the month in which the value earned so far covers the cost of winning the customer.
5. **Demand is seasonal and some channels take time.** On the timeline, each calendar month has a demand index for the industry (iGaming follows the sports calendar, e-commerce peaks in Q4, B2B SaaS dips in summer), and slow channels (SEO, PR, influencers, and to a lesser degree affiliates and CRM) ramp up from the first month.

**What the ranges mean**

P10 / P50 / P90: *if the assumptions hold*, the engine puts a 10% / 50% / 90% chance on the real figure being below that value. P50 is the headline number every screen already shows. A wide range means "the plan depends on things nobody has measured yet", not "the engine is broken".

The ranges are only as good as the spreads in `./priors`. They are judgement, not statistics. Treat them as a structured way of saying "roughly this, give or take that much".

**What it cannot know without data**

- Whether a channel's stated price and rates are achievable for this advertiser. They are taken as the median.
- The true shape of any response curve. The saturation ceiling is a planning estimate in the packs.
- True retention. Until you enter observed value, the curve is an industry guess.
- Interactions between channels (brand spend lifting search, retargeting depending on traffic). Channels are modelled as independent in their *effect* and correlated only in their *error*.
- This year's calendar. The iGaming index does not know about a World Cup summer.
- Whether a channel is already running. Ramp-up is counted from the first month of the timeline.

**How it differs from the placeholder today**

For a single month the P50 conversions and lifetime value are **the same as the placeholder's**. The placeholder already applied the same saturating curve with the same inputs, and this engine keeps that as its median so headline numbers do not jump when the engine is switched. What changes: every figure has a range; value is earned over time on one coherent curve (month-1 return, payback and the timeline P&L all read it); the timeline has seasonality and ramp-up and applies diminishing returns when a month's budget changes; the lab's sandbox moves channels along their curves; and there is an optimiser.

## The maths

### 1. Channel response curve (`response-curve.ts`)

Conversions of a channel as a function of its monthly spend `s`:

```
c(s) = e · s / (1 + s / K)            (Michaelis–Menten; a Hill curve with exponent 1)
c'(s) = e / (1 + s / K)²  > 0,   c''(s) < 0,   c(0) = 0,   c(s) → e·K as s → ∞
```

`K` is the channel's `saturationCeiling`: the spend at which average efficiency has halved. A channel without one (created by the user) gets the median ceiling the packs give its family, scaled by the market cost index.

`e` is conversions per unit of spend at zero spend, from the buying model (`p` price after market cost index and CPM override, `ctr` after the plan's CTR bump, `cr` click → conversion rate, `v` value per conversion, `q` revenue-share %):

| Buying model | `e` |
|---|---|
| CPM | `(1000 / p) · ctr · cr` |
| CPC | `cr / p` |
| CPA | `1 / p` |
| Rev share | `1 / (v · q)` |
| Hybrid | `1 / (p + v · q)` |
| Flat fee / retainer | `traffic · cr / fee` |

Why exponent 1: any exponent above 1 gives an S-shaped curve, which is not concave, and the optimiser's optimality proof needs concavity. An exponent below 1 would be one more unmeasured parameter. Exponent 1 is also the curve the product's inputs already describe (`saturationCeiling` is documented as the half-efficiency point).

**Fixed-fee channels** keep their fee semantics: the spend is the fee, whatever the budget, and they are the first claim on it. Their curve passes through the point "fee buys `trafficPerUnit` visits" before saturation. **Inactive channels** are zero everywhere. **Spend** follows the plan's existing rules (`computePoolAwareSpend`): fixed fees first, the rest split by share across active variable channels, times the spend multiplier.

For pay-per-conversion deals the contract price is the *floor* of cost per conversion. Saturation there models partners running out of volume at that price, so budget allocated beyond it buys less. This is an assumption.

Value of a channel: `revenue = c(s) · v · f`, where `v` is the channel's value per conversion (or the plan-wide one) times the market value index, and `f` is the calibration factor (1 without observed value).

### 2. Uncertainty (`evidence.ts`, `model.ts`, `stats.ts`)

Each channel's conversions are `c_i · exp(σ_i · Z_i)` with `Z_i` standard normal: log-normal around the plan figure, so the plan figure is the median and the error is multiplicative.

```
σ_i = spread(buying model) × multiplier(evidence level)
      CPA 0.05 · Hybrid 0.10 · RevShare 0.15 · CPC 0.25 · CPM 0.40 · fee 0.45
      proven ×0.75 · untagged ×1 · restricted ×1.15 · experimental ×1.5
corr(Z_i, Z_j) = 0.6 same family, 0.3 otherwise
```

Value per customer is one plan-wide unknown, independent of the channels: `exp(σ_v · Z_v)`, `σ_v` by industry (0.30 – 0.45).

Propagation is analytic, first order in log space (delta method). With `w_i = c_i / Σc`:

```
σ_plan²    = Σ_i Σ_j  w_i w_j ρ_ij σ_i σ_j
σ_revenue² = (same with revenue weights) + σ_v²
P10 = median · exp(−1.2816 σ),   P50 = median,   P90 = median · exp(+1.2816 σ)
cost per conversion = spend / conversions   (spend is certain, so the ends swap)
ROAS = revenue / spend
```

This keeps P50 equal to the sum of the channels' P50, needs no sampling, and costs `O(n²)` multiplications. `uncertainty.test.ts` checks it against a seeded 60,000-draw simulation of the same assumptions: P10 / P50 / P90 agree within 1.4 – 4.4% on the three reference plans. The approximation worsens as spreads grow; at the current priors it is well inside the uncertainty of the priors themselves.

Bear / Base / Bull on every screen are now the P10 / P50 / P90 of the cohort's lifetime value.

### 3. Value over time (`value-curve.ts`)

```
S(t) = r ^ (t ^ k)                                   share still active t months after converting
share(m) = u·[m = 1] + (1 − u) · S(m − 1) / Σ_{j<36} S(j)     share of lifetime value earned in month m
V(m) = L · f · Σ_{j ≤ m} share(j)                    cumulative value per customer
```

`r` first-month retention, `k ≤ 1` how fast churn slows among survivors (`k = 1` is constant churn; lower means the customers who stay become stickier), `u` share earned at conversion. All three are priors by industry. For iGaming `r` is the plan's own retention-rate setting.

`h(t) = 1 − S(t)/S(t−1)` is the monthly hazard; it decreases with `t` when `k < 1`.

**Payback** is the first month with `V(m) ≥ cost per conversion`. The ratio value / cost is log-normal with `σ_revenue`, so the early end (P10) is the payback at the ratio's P90 and the late end at its P10. `null` means "not within 36 months". (`customerValue.paybackMonth` keeps the contract's 12-month limit.)

**Calibration to observed value.** The user can enter value per customer at months 1, 3 and 6. Model, in logs:

```
log y_k = log( L · Σ_{j ≤ t_k} share(j; r) ) + a + ε_k
a ~ N(0, σ_v²)                 level: how far the stated lifetime value is off
logit r ~ N(logit r₀, 0.75²)   retention: how far the timing is off
ε_k ~ N(0, 0.15²)              trust in a typed-in figure
```

For a given `r` the level has a closed-form normal posterior (precision `1/σ_v² + n/0.15²`) and the data a closed-form marginal likelihood, so the posterior of `r` is one-dimensional: a 21-point grid finds the best region, a golden-section search the most probable `r`. The curve uses that `r` and the level's posterior mean there. The remaining spread of lifetime value is the level's posterior variance plus how much the level varies across plausible retentions, capped at the prior. Result: the curve moves most of the way to the points (a typed-in point is trusted far more than the prior), bends when two points disagree with the prior's shape, and the value range narrows.

Limits: one retention parameter cannot reproduce every shape (for some priors value that builds *faster* than expected is absorbed by the level instead). Uncertainty about the shape parameters `k` and `u` is not modelled.

**iGaming waterfall.** Value per conversion is read as net revenue (NGR). Gross revenue is NGR before the plan's bonus rate, registrations follow from the reg → FTD rate, active players from `S(t)`. The plan's `margin` and `turnoverRate` settings describe how NGR arises from wagering and do **not** enter this engine; see "Decisions for the owner".

### 4. Timeline (`timeline.ts`)

Month `m` (0 = first month), calendar month `q`, channel `i`:

```
conversions = c_i(spend) × season[industry][q] × ramp_family(m)
ramp(m) = start + (1 − start) · (1 − exp(−m / τ))
```

Seasonality indices average 1 over the year. Each month's conversions are a cohort; its lifetime value is earned over the following months by `share(·)`. The P&L recognises value **when it is earned**:

```
earned(m) = Σ_{cohorts j ≤ m}  value_j · share(m − j + 1)
profit(m) = earned(m) · (1 − 0.15) − spend(m)
```

So a timeline starts in the red and builds, for every industry. `revenue` in a month row is still the cohort's lifetime value (as before). Period ranges assume a channel's error is the same every month (it is an unknown about the channel, not monthly noise).

### 5. Customer-value lab (`what-if.ts`)

Sandbox spend changes are read off each channel's curve (50% more spend buys less than 50% more conversions), then the user's cost, return and churn adjustments are applied. The churn slider is a stress relative to its default (4.2%): at the default the curve is the industry prior; at twice the default customers leave twice as fast. Faster churn shortens the customer's life with the value of an active month unchanged, so it lowers lifetime value as well as delaying it. A cost shock means the same spend buys fewer conversions.

### 6. Optimiser (`optimiser.ts`)

`optimiseAllocation(input, { goal, constraints })`, also `engine.optimise`. Decision variables: spend `s_i` of the channels it may move (active, share-based, not locked). Fixed fees, locked and inactive channels are pinned.

```
maximise   Σ_i g_i(s_i)        g_i = c_i (conversions) · v_i c_i (value) · v_i c_i − s_i (net)
subject to Σ_i s_i ≤ B,   lo_i ≤ s_i ≤ hi_i,   [ Σ spend ≤ T · Σ conversions ]
```

Each `g_i` is concave and the objective is separable, so the KKT conditions are sufficient: at the optimum every channel not at a bound has the same marginal return `λ` (equal marginal returns). For a given `λ` the best spend has a closed form,

```
w_i · e_i / (1 + s/K_i)² = λ + κ    ⇒    s_i(λ) = clamp( K_i · ( √(w_i e_i / (λ + κ)) − 1 ),  lo_i, hi_i )
```

(`w_i` = 1 or `v_i`; `κ` = 1 for `net`, else 0). `Σ s_i(λ)` is non-increasing in `λ`, so `λ` is found by bisection (water-filling). If the spends fit at `λ = 0` budget is left over: that is `net` saying "the next euro returns less than a euro". The cost ceiling `T` is a convex constraint; it adds a multiplier `μ` (each conversion is worth `μT` more, each unit of spend costs `μ` more) found by an outer bisection.

The result gives new shares, spend per channel, the budget that split needs (`recommendedBudget`, lower than the input when not all of it should be spent), before / after outcomes and the gain. `feasible: false` when minimum shares do not fit (they are scaled back) or the ceiling is out of reach (it is dropped and the best split without it returned).

The optimiser works on P50. It does not trade expected return against risk.

`optimiser.test.ts` proves optimality against exhaustive grid search on 2 – 3 channel plans (with and without constraints), equal marginal returns at the optimum, "never worse than the start", every constraint, and idempotence, over every generated plan (5 industry packs × 5 budgets × 6 market mixes).

## How observed data will replace priors

Every prior is a typed constant in `./priors`, one module per concern, with a comment saying what it represents. Replacing them is designed to be local:

| Prior | Module | Replace with |
|---|---|---|
| Curve slope `e` and half-saturation `K` | plan inputs, `priors/saturation.ts` | Fit `c(s) = e·s/(1 + s/K)` per channel to (spend, conversions) history; with few points, shrink toward the pack value (the pack becomes the prior mean of a Bayesian fit). |
| Efficiency spread `σ_i` | `priors/evidence.ts` | Residual spread of the fit per channel; pool by buying model / evidence level while data is thin. |
| Correlation | `priors/correlation.ts` | Correlation of the channels' fit residuals over time. |
| Retention `r`, `k`, `u`, `σ_v` | `priors/retention.ts` | Cohort tables (customers active and value by month since conversion). The months 1 / 3 / 6 calibration already implemented is the first step; a full cohort import replaces the three points and can fit `k` and `u` too. |
| Seasonality | `priors/seasonality.ts` | Monthly index from the account's own conversions per unit of spend, at least one full year. |
| Ramp-up | `priors/ramp-up.ts` | Efficiency by months since channel launch. |

What is needed first is a data import (channel, month, spend, conversions, value) and a place to store fitted parameters per plan. Then `buildPlanModel` reads fitted parameters when present and priors otherwise; nothing above it changes. `EngineInput` would gain an optional `observations` field, the same way `observedValue` works today.

## Decisions for the owner

- **`margin` and `turnoverRate` do not move this engine's numbers.** The placeholder computes month-1 iGaming revenue as `players × playerValue × turnover × margin`, treating "player value" as wagering volume, while channel revenue treats the same number as lifetime value. The two cannot both be right (it is why the placeholder shows a month-1 return of 0.06 on a plan with a lifetime return of 1.3). This engine reads value per conversion as lifetime net revenue everywhere. If the settings should stay live, the product needs to say which of the two meanings "player value" has.
- **Entering observed value now changes lifetime value and ROAS**, not only the curve. That is the point of calibration, but it is a visible change from the placeholder.
- **The return-by-group trend rises instead of falling**: it shows return earned so far by month, not a return eroded by churn.
- **A sanity band exposed implausible pack figures**: SaaS "Email Nurture" returns ~49× its fee and iGaming CRM ~11× at high budgets. These come from the packs' traffic and value figures, not from this engine (the placeholder shows the same). Worth a look before ranges go on screen.

## Files

| File | Role |
|---|---|
| `priors/*` | Every assumption, typed and commented. |
| `response-curve.ts` | Curve parameters from a channel's inputs; `conversionsAt`, `marginalConversionsAt`. |
| `evidence.ts` | Evidence level and efficiency spread of a channel, from the packs' tags. |
| `value-curve.ts` | Retention curve, calibration, payback. |
| `model.ts` | `buildPlanModel`: spends, curves, medians, spreads. Shared by everything below. |
| `compute.ts`, `timeline.ts`, `what-if.ts` | The three port methods. |
| `optimiser.ts` | `optimiseAllocation`, `applyAllocation`. |
| `testing.ts` | Generated plans for the tests. |

Purity: no `Math.random`, no `Date`, no stores, storage or network anywhere in this folder (the tests use a seeded generator of their own). Measured on a laptop: `compute` 0.11 ms for 15 channels with calibration on, the lab 0.14 ms, the optimiser 0.05 ms.
