import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, mount } from '@/test/mount';
import { useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { useSandboxStore } from '@/store/useSandboxStore';
import {
  applyObservedCalibration,
  baselineLtvCurve,
  buildLtvCurve,
  clamp,
} from '@/lib/ltv-model';
import { computePlanSnapshot } from '@/lib/media-plan/plan-snapshot';
import { buildScenarioEnvelope } from '@/lib/planning-insights';
import { generatePlan } from '@/lib/plan-generator';
import { buildExportSnapshot, withSummaryText } from '@/lib/what-if/export-snapshot';
import {
  aggregateMetrics,
  buildSandboxSummary,
  computeSandboxChannelMetrics,
  formatSandboxSummary,
  groupSpendImpact,
  toBaselineAggregate,
  weightedChurnDeltaPct,
} from '@/lib/what-if/sandbox-math';
import {
  compareBaseScenario,
  formatBaseScenarioComparison,
  scenarioRoiData,
} from '@/lib/what-if/scenario-math';
import type { ScenarioPoint } from '@/lib/what-if/types';
import {
  computeWhatIfResult,
  placeholderEngine,
  selectEngineInput,
  selectWhatIfInput,
  setEngine,
  useWhatIfResult,
  type PlanEngine,
  type WhatIfControls,
  type WhatIfResult,
} from '@/engine';
import type { EngineSource } from '@/engine/input';
import type { WhatIfSandboxSource } from '@/engine/what-if-input';

// Each expectation pins what LtvForecastPanel computed inline before the port.

type Industry = 'ecommerce' | 'igaming';

const loadPlan = (industry: Industry, monthlyBudget: number) =>
  useMediaPlanStore.getState().applyGeneratedPlan(generatePlan({ industry, monthlyBudget, markets: ['DE'] }));

const DEFAULT_CONTROLS: WhatIfControls = {
  churnRatePct: 4.2,
  cpaShockPct: 0,
  roasLiftPct: 0,
  decayCurve: 'standard-linear',
};

const NO_SANDBOX: WhatIfSandboxSource = {
  sandboxEnabled: false,
  selectedChannelIds: [],
  channelAdjustments: {},
  groupAdjustments: { organic: 0, paid: 0, affiliate: 0, influencer: 0 },
};

/** The panel's chain of useMemo blocks, copied from LtvForecastPanel before the move. */
function oldPanelMaths(plan: EngineSource, controls: WhatIfControls, sandbox: WhatIfSandboxSource) {
  const { churnRatePct, cpaShockPct, roasLiftPct, decayCurve } = controls;
  const { sandboxEnabled, selectedChannelIds, channelAdjustments, groupAdjustments } = sandbox;
  const snapshot = computePlanSnapshot(plan);
  const blended = snapshot.blended;
  const channels = snapshot.channels;
  const playerValue = plan.globalMultipliers.playerValue;
  const observedLtv = plan.observedLtv;

  const baselineMetrics = toBaselineAggregate(blended);
  const selectedSet = new Set(selectedChannelIds);
  const sandboxChannelMetrics = computeSandboxChannelMetrics(channels, selectedSet, channelAdjustments, groupAdjustments);
  const weightedSandboxChurnDeltaPct = weightedChurnDeltaPct(sandboxChannelMetrics, selectedSet);
  const sandboxMetrics = aggregateMetrics(sandboxChannelMetrics);
  const activeMetrics = sandboxEnabled ? sandboxMetrics : baselineMetrics;

  const assumptions = {
    churnRate: clamp((churnRatePct + (sandboxEnabled ? weightedSandboxChurnDeltaPct : 0)) / 100, 0.01, 0.2),
    cpaMultiplier: 1 + cpaShockPct / 100,
    roasMultiplier: 1 + roasLiftPct / 100,
  };

  const computeBaselineCumulative = (blendedRoas: number) =>
    baselineLtvCurve({ playerValue, blendedRoas, churnRate: assumptions.churnRate, roasLiftPct, decayCurve }).cumulative;
  const baselineCal = applyObservedCalibration(
    computeBaselineCumulative(Math.max(0, baselineMetrics.blendedRoas)),
    observedLtv
  );
  const activeCal = applyObservedCalibration(
    computeBaselineCumulative(Math.max(0, activeMetrics.blendedRoas)),
    observedLtv
  );

  const baselineScenarioData = buildScenarioEnvelope({
    baseLtvPerUser:
      (baselineMetrics.blendedCpa ?? 0) * Math.max(0, baselineMetrics.blendedRoas) * baselineCal.multiplier,
    conversions: baselineMetrics.totalConversions,
    cpa: baselineMetrics.blendedCpa ?? 0,
    assumptions,
  }) as ScenarioPoint[];
  const scenarioData = buildScenarioEnvelope({
    baseLtvPerUser:
      (activeMetrics.blendedCpa ?? 0) * Math.max(0, activeMetrics.blendedRoas) * activeCal.multiplier,
    conversions: activeMetrics.totalConversions,
    cpa: activeMetrics.blendedCpa ?? 0,
    assumptions,
  }) as ScenarioPoint[];

  const activeSummaryText = buildSandboxSummary(
    baselineMetrics.roi,
    sandboxMetrics.roi,
    sandboxChannelMetrics,
    weightedSandboxChurnDeltaPct
  );
  const baselineScenarioRoiData = scenarioRoiData(baselineScenarioData, baselineMetrics.totalSpend);
  const adjustedScenarioRoiData = scenarioRoiData(scenarioData, sandboxMetrics.totalSpend);
  const scenarioComparisonSummary = compareBaseScenario(baselineScenarioRoiData, adjustedScenarioRoiData);

  const curve = buildLtvCurve(activeMetrics, {
    playerValue,
    blendedRoas: activeMetrics.blendedRoas,
    churnRate: assumptions.churnRate,
    roasLiftPct,
    decayCurve,
    cpaShockPct,
    observedLtv,
  });

  return {
    baselineMetrics,
    sandboxMetrics,
    activeMetrics,
    sandboxChannelMetrics,
    weightedSandboxChurnDeltaPct,
    assumptions,
    isCalibrated: baselineCal.isCalibrated,
    baselineScenarioData,
    scenarioData,
    activeSummaryText,
    groupImpact: groupSpendImpact(sandboxChannelMetrics),
    baselineScenarioRoiData,
    adjustedScenarioRoiData,
    scenarioComparisonSummary,
    curve,
    exportSnapshot: buildExportSnapshot({
      sandboxEnabled,
      activeSummaryText,
      baselineMetrics,
      sandboxMetrics,
      sandboxChannelMetrics,
      baselineScenarioData,
      scenarioData,
    }),
  };
}

/** A sandbox that selects the first three spending channels and moves every lever. */
const busySandbox = (plan: EngineSource, enabled: boolean): WhatIfSandboxSource => {
  const [a, b, c] = computePlanSnapshot(plan).channels.filter((ch) => ch.metrics.spend > 0);
  return {
    sandboxEnabled: enabled,
    selectedChannelIds: [a.id, b.id, c.id],
    channelAdjustments: {
      [a.id]: { spendPct: 60, cpaPct: -20, roasPct: 15, churnPct: 12 },
      [b.id]: { spendPct: -50, cpaPct: 40, roasPct: -30, churnPct: -5 },
      // Out of range on purpose: the clamps must still apply.
      [c.id]: { spendPct: 999, cpaPct: -999, roasPct: 999, churnPct: 999 },
    },
    groupAdjustments: { organic: -20, paid: 35, affiliate: 10, influencer: 0 },
  };
};

const CASES: Array<{
  name: string;
  controls: WhatIfControls;
  sandbox: (plan: EngineSource) => WhatIfSandboxSource;
  observed?: { m1: number | null; m3: number | null; m6: number | null };
}> = [
  { name: 'defaults', controls: DEFAULT_CONTROLS, sandbox: () => NO_SANDBOX },
  {
    name: 'stressed sliders, front-loaded decay',
    controls: { churnRatePct: 6, cpaShockPct: 20, roasLiftPct: 10, decayCurve: 'front-loaded-dropoff' },
    sandbox: () => NO_SANDBOX,
  },
  {
    name: 'sandbox enabled with channel and group adjustments',
    controls: { churnRatePct: 3.1, cpaShockPct: 5, roasLiftPct: -15, decayCurve: 'stable-long-term-retention' },
    sandbox: (plan) => busySandbox(plan, true),
  },
  {
    name: 'sandbox adjusted but disabled, observed value at M1/M3/M6',
    controls: { churnRatePct: 9.5, cpaShockPct: 35, roasLiftPct: 25, decayCurve: 'standard-linear' },
    sandbox: (plan) => busySandbox(plan, false),
    observed: { m1: 40, m3: 95, m6: 160 },
  },
];

beforeEach(() => {
  localStorage.clear();
  setEngine(placeholderEngine);
  useSandboxStore.getState().resetSandbox();
  useSandboxStore.getState().setSandboxEnabled(false);
  useMediaPlanStore.getState().clearObservedLtv();
});

afterEach(async () => {
  await cleanup();
  setEngine(placeholderEngine);
});

describe.each<[Industry, number]>([
  ['igaming', 60000],
  ['ecommerce', 40000],
])('placeholder what-if behind the port (%s)', (industry, budget) => {
  describe.each(CASES)('$name', ({ controls, sandbox, observed }) => {
    const setup = () => {
      loadPlan(industry, budget);
      const base = useMediaPlanStore.getState();
      const plan: EngineSource = observed ? { ...base, observedLtv: observed } : base;
      return { plan, sandboxSource: sandbox(plan) };
    };

    it('every number the lab shows equals the panel maths before the port', () => {
      const { plan, sandboxSource } = setup();
      const port = computeWhatIfResult(plan, controls, sandboxSource);
      const old = oldPanelMaths(plan, controls, sandboxSource);

      expect(old.baselineMetrics.totalConversions).toBeGreaterThan(0);
      expect(port.baseline).toEqual(old.baselineMetrics);
      expect(port.adjusted).toEqual(old.sandboxMetrics);
      expect(port.active).toEqual(old.activeMetrics);
      expect(port.channels).toEqual(old.sandboxChannelMetrics);
      expect(port.groups).toEqual(old.groupImpact);
      expect(port.churnDeltaPct).toBe(old.weightedSandboxChurnDeltaPct);
      expect(port.assumptions).toEqual(old.assumptions);

      expect(port.customerValue.curve).toEqual(old.curve.points);
      expect(port.customerValue.paybackMonth).toBe(old.curve.paybackMonth);
      expect(port.customerValue.monthlyChurn).toBe(old.assumptions.churnRate);
      expect(port.customerValue.monthlyExpansion).toBe(old.curve.monthlyExpansion);
      expect(port.customerValue.isCalibrated).toBe(old.isCalibrated);
      expect(port.customerValue.isCalibrated).toBe(observed !== undefined);

      expect(port.scenarios.baseline).toEqual(old.baselineScenarioData);
      expect(port.scenarios.active).toEqual(old.scenarioData);
      expect(port.scenarios.baselineRoi).toEqual(old.baselineScenarioRoiData);
      expect(port.scenarios.adjustedRoi).toEqual(old.adjustedScenarioRoiData);
    });

    it('the sentences and the export snapshot built from the result are unchanged', () => {
      const { plan, sandboxSource } = setup();
      const port = computeWhatIfResult(plan, controls, sandboxSource);
      const old = oldPanelMaths(plan, controls, sandboxSource);

      const summaryText = formatSandboxSummary(port.summary);
      expect(summaryText).toBe(old.activeSummaryText);
      expect(formatBaseScenarioComparison(port.scenarios.baseRoiDelta)).toBe(old.scenarioComparisonSummary);
      expect(withSummaryText(port.exportSnapshot, summaryText)).toEqual(old.exportSnapshot);
    });

    it('is a pure function of its inputs: it never reads the live stores and never mutates them', () => {
      const { plan, sandboxSource } = setup();
      const input = selectEngineInput(plan);
      const whatIf = selectWhatIfInput(controls, sandboxSource);
      const frozenInput = JSON.stringify(input);
      const frozenWhatIf = JSON.stringify(whatIf);

      const first = placeholderEngine.computeWhatIf(input, whatIf);
      loadPlan(industry === 'igaming' ? 'ecommerce' : 'igaming', 250000);
      useMediaPlanStore.getState().setObservedLtv('m1', 999);
      useSandboxStore.getState().setSandboxEnabled(true);
      useSandboxStore.getState().setGroupAdjustment('paid', 80);

      expect(placeholderEngine.computeWhatIf(input, whatIf)).toEqual(first);
      expect(JSON.stringify(input)).toBe(frozenInput);
      expect(JSON.stringify(whatIf)).toBe(frozenWhatIf);
    });
  });
});

describe('swapping the engine (what-if)', () => {
  it('useWhatIfResult reads the stores and follows the swapped engine', async () => {
    loadPlan('igaming', 60000);
    let seen: WhatIfResult | null = null;
    function Probe() {
      seen = useWhatIfResult(DEFAULT_CONTROLS);
      return null;
    }
    await mount(<Probe />);
    expect(seen!.engine.id).toBe('placeholder');
    expect(seen!).toEqual(computeWhatIfResult(useMediaPlanStore.getState(), DEFAULT_CONTROLS, NO_SANDBOX));

    // The hook builds the sandbox part of the input from the sandbox store.
    const baselineSpend = seen!.baseline.totalSpend;
    await act(async () => {
      useSandboxStore.getState().setSandboxEnabled(true);
      useSandboxStore.getState().setGroupAdjustment('paid', 50);
    });
    expect(seen!.baseline.totalSpend).toBe(baselineSpend);
    expect(seen!.active.totalSpend).toBeGreaterThan(baselineSpend);

    const stub: PlanEngine = {
      ...placeholderEngine,
      id: 'stub',
      version: '1.0.0',
      computeWhatIf: (input, whatIf) => {
        const base = placeholderEngine.computeWhatIf(input, whatIf);
        return {
          ...base,
          engine: { id: 'stub', version: '1.0.0' },
          active: { ...base.active, totalSpend: 31337 },
          customerValue: { ...base.customerValue, paybackMonth: 7 },
        };
      },
    };
    await act(async () => setEngine(stub));
    expect(seen!.engine.id).toBe('stub');
    expect(seen!.active.totalSpend).toBe(31337);
    expect(seen!.customerValue.paybackMonth).toBe(7);
  });
});
