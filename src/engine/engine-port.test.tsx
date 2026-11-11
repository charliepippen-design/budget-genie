import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, mount } from '@/test/mount';
import { useMediaPlanStore } from '@/hooks/use-media-plan-store';
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

  it('economics, ROAS pair, payback and scenarios match what /report and /output show today', async () => {
    loadPlan('igaming', 60000);
    let economicsHook: ReturnType<typeof usePlanEconomics> | null = null;
    let port: EngineResult | null = null;
    function Probe() {
      economicsHook = usePlanEconomics();
      port = usePlanResult();
      return null;
    }
    await mount(<Probe />);
    expect(port!.economics).toEqual(economicsHook!.economics);
    expect(port!.roas).toEqual(economicsHook!.roasPair);
    expect(port!.customerValue.paybackMonth).toBe(economicsHook!.paybackMonths);
    expect(port!.customerValue.valuePerCustomer12m).toBeCloseTo(economicsHook!.paybackLtvPerUser, 9);
    expect(port!.scenarios).toEqual(economicsHook!.scenarioEnvelope);
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
});
