import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, mount } from '@/test/mount';
import { useBlendedMetrics, useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { computePlanSnapshot } from '@/lib/media-plan/plan-snapshot';
import { generatePlan } from '@/lib/plan-generator';
import {
  computePlanResult,
  getEngine,
  placeholderEngine,
  selectEngineInput,
  setEngine,
  usePlanResult,
  type EngineResult,
  type PlanEngine,
} from '@/engine';
import { usePlanEconomics } from '@/hooks/use-plan-economics';
import { computePlanEconomics } from '@/lib/plan-economics';
import { roasPairFromEconomics } from '@/lib/roas-pair';
import { buildLtvCurve, buildPlanScenarios, DEFAULT_CHURN_RATE } from '@/lib/ltv-model';

const loadPlan = (industry: 'ecommerce' | 'igaming', monthlyBudget: number) =>
  useMediaPlanStore.getState().applyGeneratedPlan(generatePlan({ industry, monthlyBudget, markets: ['DE'] }));

beforeEach(() => {
  localStorage.clear();
  setEngine(placeholderEngine);
  loadPlan('ecommerce', 40000);
});

afterEach(async () => {
  await cleanup();
  setEngine(placeholderEngine);
});

describe('placeholder engine behind the port', () => {
  it('channels and totals match the existing snapshot exactly', () => {
    const state = useMediaPlanStore.getState();
    const result = computePlanResult(state);
    const snapshot = computePlanSnapshot(state);
    expect(result.channels).toEqual(snapshot.channels);
    expect(result.totals).toMatchObject(snapshot.blended);
    expect(result.totals.fixedSpend).toBe(snapshot.fixedSpend);
    expect(result.totals.overBudget).toBe(snapshot.overBudget);
    expect(result.engine).toEqual({ id: 'placeholder', version: placeholderEngine.version });
  });

  it('economics, ROAS pair, payback and scenarios match the pre-port /report and /output maths', () => {
    loadPlan('igaming', 60000);
    const state = useMediaPlanStore.getState();
    const port = computePlanResult(state);

    // The calculation usePlanEconomics did before the port, inlined.
    const active = computePlanSnapshot(state).channels.filter((c) => c.isActive && c.metrics.spend > 0);
    const totalSpend = active.reduce((s, c) => s + c.metrics.spend, 0);
    const projectedRevenue = active.reduce((s, c) => s + c.metrics.revenue, 0);
    const conversions = active.reduce((s, c) => s + c.metrics.conversions, 0);
    const blendedCpa = conversions > 0 ? totalSpend / conversions : null;
    const blendedRoas = totalSpend > 0 ? projectedRevenue / totalSpend : 0;
    const plan = { totalSpend, totalConversions: conversions, blendedCpa, blendedRoas };
    const model = { playerValue: state.globalMultipliers.playerValue, blendedRoas, churnRate: DEFAULT_CHURN_RATE, observedLtv: state.observedLtv };
    const economics = computePlanEconomics({ totalSpend, totalConversions: conversions, projectedRevenue }, state.onboardingVertical, state.globalMultipliers);
    const curve = buildLtvCurve(plan, model);

    expect(port.economics.netValuePerMonth).toBeCloseTo(economics.netValuePerMonth, 6);
    expect(port.economics.netValueCohort).toBeCloseTo(economics.netValueCohort, 6);
    expect(port.economics.breakEvenCpa ?? 0).toBeCloseTo(economics.breakEvenCpa ?? 0, 6);
    expect(port.roas.lifetime).toBeCloseTo(roasPairFromEconomics(economics, blendedRoas).lifetime, 9);
    expect(port.customerValue.paybackMonth).toBe(curve.paybackMonth);
    expect(port.customerValue.valuePerCustomer12m).toBeCloseTo(curve.points[11].cumulativeLtvPerUser, 6);
    const scenarios = buildPlanScenarios(plan, model);
    port.scenarios.forEach((sc, i) => expect(sc.projectedCohortValue).toBeCloseTo(scenarios[i].projectedCohortValue, 4));
  });

  it('the dashboard and report hooks read the engine result', async () => {
    let economicsHook: ReturnType<typeof usePlanEconomics> | null = null;
    let port: EngineResult | null = null;
    function Probe() {
      economicsHook = usePlanEconomics();
      port = usePlanResult();
      return null;
    }
    await mount(<Probe />);
    expect(economicsHook!.economics).toEqual(port!.economics);
    expect(economicsHook!.scenarioEnvelope).toEqual(port!.scenarios);
  });

  it('is a pure function of its input: it never reads the live store', () => {
    const input = selectEngineInput(useMediaPlanStore.getState());
    const first = placeholderEngine.compute(input);
    loadPlan('igaming', 200000);
    expect(placeholderEngine.compute(input)).toEqual(first);
  });

  it('unallocated budget is what fixed fees and channels leave unspent, never negative', () => {
    const result = computePlanResult({ ...useMediaPlanStore.getState(), totalBudget: 100 });
    expect(result.totals.unallocated).toBe(0);
    expect(result.totals.overBudget).toBe(true);
  });
});

describe('swapping the engine', () => {
  it('every screen reading usePlanResult switches to the new engine without other changes', async () => {
    const seen: string[] = [];
    function Probe() {
      seen.push(usePlanResult().engine.id);
      return null;
    }
    await mount(<Probe />);
    expect(seen.at(-1)).toBe('placeholder');

    const stub: PlanEngine = {
      id: 'stub',
      version: '1.0.0',
      compute: (input) => ({ ...placeholderEngine.compute(input), engine: { id: 'stub', version: '1.0.0' } }),
    };
    await act(async () => setEngine(stub));
    expect(getEngine()).toBe(stub);
    expect(seen.at(-1)).toBe('stub');
  });

  it('dashboard totals and report economics follow the swapped engine', async () => {
    let revenue = -1;
    let netPnl = -1;
    function Probe() {
      revenue = useBlendedMetrics().projectedRevenue;
      netPnl = usePlanEconomics().netPnl;
      return null;
    }
    await mount(<Probe />);
    const fixed: PlanEngine = {
      id: 'fixed',
      version: '1.0.0',
      compute: (input) => {
        const base = placeholderEngine.compute(input);
        return {
          ...base,
          engine: { id: 'fixed', version: '1.0.0' },
          totals: { ...base.totals, projectedRevenue: 123456 },
          economics: { ...base.economics, netValuePerMonth: 777 },
        };
      },
    };
    await act(async () => setEngine(fixed));
    expect(revenue).toBe(123456);
    expect(netPnl).toBe(777);
  });
});
