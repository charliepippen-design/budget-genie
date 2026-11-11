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

## Plugging in the real engine

1. Implement `PlanEngine` (`compute` must be pure: no store, storage or network reads).
2. Call `setEngine(realEngine)` once at startup.
3. Run `src/engine/engine-port.test.tsx` against it (shape and purity tests apply to any engine).

## Rules for screens

- Read numbers with `usePlanResult()` (or `computePlanResult` in exports and AI context).
- Do not add formulas in components: if a screen needs a new number, add it to `EngineResult` and compute it in the engine.
- Formatting (currency, %, rounding for display) stays in the UI.
