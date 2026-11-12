# Engine port

The UI never computes plan numbers. It reads them from one `EngineResult`, produced by whichever `PlanEngine` is active.

```
store ──selectEngineInput──▶ EngineInput ──engine.compute──▶ EngineResult ──usePlanResult──▶ widgets
```

| File | Role |
|---|---|
| `contract.ts` | `EngineInput`, `EngineResult`, `PlanEngine`. The contract the real engine must meet. |
| `placeholder-engine.ts` | Today's heuristics (`computePlanSnapshot`, `plan-economics`, `ltv-model`, `planning-insights`) wrapped to the contract. Numbers are illustrative. |
| `registry.ts` | `getEngine` / `setEngine` / `setEngineById`: the single switch, and the `engines` map (`placeholder`, `response-curve`). |
| `optimise.ts` | `OptimiseOptions` / `OptimiseResult` for the optional `PlanEngine.optimise`. |
| `v1/` | The response-curve engine: prior-based response curves, ranges, value over time, optimiser. Not the default. See `v1/README.md`. |
| `port-conformance.tsx` | `describeEnginePort(engine)`: the shape, purity and swap tests any engine must pass. |
| `optimised-mix.ts` | `computeOptimisedMix(state, options)`: the optimiser's result for the live plan, with the shares to write to the store. |
| `projection-band.ts` | `selectProjectionBand(result)`: the 12-month projection as P10 / P50 / P90 per month. |
| `use-plan-result.ts` | `usePlanResult()` for components, `computePlanResult(state)` outside React, `selectEngineInput` (store → input). |

## Timeline and what-if

Two more methods of `PlanEngine` cover the screens that look at the same plan over time or under stress. Both take the single-month `EngineInput` first, plus their own input:

```
multi-month store ──selectTimelineInput──▶ TimelineInput ──engine.computeTimeline──▶ TimelineResult ──useTimelineResult──▶ multi-month view
lab controls + sandbox store ──selectWhatIfInput──▶ WhatIfInput ──engine.computeWhatIf──▶ WhatIfResult ──useWhatIfResult──▶ customer-value lab
```

| File | Role |
|---|---|
| `timeline.ts` | `TimelineInput` (months with budgets, multipliers and overrides, progression pattern, soft launch, saved scenarios, optimisation goal) and `TimelineResult` (P&L rows, totals, break-even month, cumulative series, per-channel spend, scenario comparison, optimiser candidates, pattern budgets, base channels). |
| `what-if.ts` | `WhatIfInput` (churn, CPA shock, return lift, decay curve, per-channel and per-group sandbox adjustments) and `WhatIfResult` (baseline / adjusted / active totals, per-channel and per-group comparison, value curve, payback, scenarios and their ROI, summary signals, export numbers). |
| `placeholder-timeline.ts` | Today's multi-month maths (`src/lib/multi-month/calc.ts`) wrapped to `computeTimeline`. |
| `placeholder-what-if.ts` | Today's lab maths (`src/lib/what-if`, `ltv-model`) wrapped to `computeWhatIf`. |
| `timeline-input.ts`, `what-if-input.ts` | `selectTimelineInput`, `selectWhatIfInput` (stores → inputs). |
| `use-timeline-result.ts` | `useTimelineResult()` for components, `computeTimelineResult(planState, timelineState)` outside React. |
| `use-what-if-result.ts` | `useWhatIfResult(controls)` for components, `computeWhatIfResult(planState, controls, sandbox)` outside React. |

The multi-month store's actions ask the engine too: `generateMonths` / `applyPattern` / `setGlobalSettings` take month budgets from `TimelineResult.patternBudgets`, new months start from `baseChannels`, and `runOptimization` ranks `optimisation`.

## Engines and how one is selected

`placeholderEngine` is the default and what customers see. `responseCurveEngine` (`v1/`) is registered next to it and selected only on request:

- In code: `setEngineById('response-curve')`.
- For dev / QA, without a build: `localStorage['mediaplan-engine'] = 'response-curve'`, then reload. `App.tsx` calls `selectEngineFromStorage()` once at startup. Remove the key to go back. On the dev server, `/settings` has a "Planning engine" switch that does the same (never rendered in a production build).

## Optional parts of the contract

- `EngineResult.ranges` (and `TimelineResult.ranges`, `WhatIfResult.ranges`): P10 / P50 / P90 around the headline figures, with the assumptions behind them. Engines that give point estimates leave it undefined (the placeholder does).
- `PlanEngine.optimise(input, { goal, constraints })`: a better split of the budget across channels. Optional; the placeholder does not implement it.

Screens degrade to point estimates when either is missing:

- Ranges: `RangeLine` (`src/components/plan`) under the headline figures of the KPI bar, shared plan, `/report` and `/output`; the plan canvas draws the band (`selectProjectionBand`), the payback range and per-channel ranges, and lists `ranges.assumptions`.
- Optimiser: "Optimise mix" on the plan canvas, through `computeOptimisedMix(state, options)` (`optimised-mix.ts`), which previews the result and returns the shares and budget to write.

## Plugging in another engine

1. Implement `PlanEngine` (`compute`, `computeTimeline` and `computeWhatIf` must be pure: no store, storage or network reads).
2. Add it to `engines` in `registry.ts`.
3. Run the conformance suite against it: a test file with `describeEnginePort(yourEngine)` (see `placeholder-conformance.test.tsx`, `v1/conformance.test.tsx`). `engine-port.test.tsx`, `timeline-port.test.tsx` and `what-if-port.test.tsx` additionally pin the placeholder's formulas.

## Rules for screens

- Read numbers with `usePlanResult()`, `useTimelineResult()` or `useWhatIfResult()` (or the `compute*Result` helpers in exports, store actions and AI context).
- Do not add formulas in components: if a screen needs a new number, add it to the result type and compute it in the engine.
- Formatting (currency, %, rounding for display, labels, colours, sentences built from engine numbers) stays in the UI.
