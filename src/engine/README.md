# Engine port

The UI never computes plan numbers. It reads them from one `EngineResult`, produced by whichever `PlanEngine` is active.

```
store ──selectEngineInput──▶ EngineInput ──engine.compute──▶ EngineResult ──usePlanResult──▶ widgets
```

| File | Role |
|---|---|
| `contract.ts` | `EngineInput`, `EngineResult`, `PlanEngine`. The contract the real engine must meet. |
| `placeholder-engine.ts` | Today's heuristics (`computePlanSnapshot`, `plan-economics`, `ltv-model`, `planning-insights`) wrapped to the contract. Numbers are illustrative. |
| `registry.ts` | `getEngine` / `setEngine`: the single switch. |
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

## Plugging in the real engine

1. Implement `PlanEngine` (`compute`, `computeTimeline` and `computeWhatIf` must be pure: no store, storage or network reads).
2. Call `setEngine(realEngine)` once at startup.
3. Run `src/engine/engine-port.test.tsx`, `timeline-port.test.tsx` and `what-if-port.test.tsx` against it (shape and purity tests apply to any engine; the parity tests pin the placeholder).

## Rules for screens

- Read numbers with `usePlanResult()`, `useTimelineResult()` or `useWhatIfResult()` (or the `compute*Result` helpers in exports, store actions and AI context).
- Do not add formulas in components: if a screen needs a new number, add it to the result type and compute it in the engine.
- Formatting (currency, %, rounding for display, labels, colours, sentences built from engine numbers) stays in the UI.
