import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, mount } from '@/test/mount';
import { useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { useMultiMonthStore } from '@/hooks/use-multi-month-store';
import { normalizeIgamingRevenueInputs } from '@/lib/igaming-revenue-model';
import { computePlanSnapshot } from '@/lib/media-plan/plan-snapshot';
import {
  calculateDistribution,
  calculatePlanMetrics,
  channelsFromPlanSnapshot,
} from '@/lib/multi-month/calc';
import type { MultiMonthState } from '@/lib/multi-month/state';
import type { OptimizationGoal, OptimizationResult, ProgressionPattern } from '@/lib/multi-month/types';
import { generatePlan } from '@/lib/plan-generator';
import {
  computeTimelineResult,
  placeholderEngine,
  selectEngineInput,
  selectTimelineInput,
  setEngine,
  useTimelineResult,
  type PlanEngine,
  type TimelineResult,
} from '@/engine';

// Each expectation pins the formula the multi-month screens and store computed before the port.

type Industry = 'ecommerce' | 'igaming';

const loadPlan = (industry: Industry, monthlyBudget: number) =>
  useMediaPlanStore.getState().applyGeneratedPlan(generatePlan({ industry, monthlyBudget, markets: ['DE'] }));

const mm = () => useMultiMonthStore.getState();

/** The revenue model the old useMultiMonthMetrics hook passed to calculatePlanMetrics. */
const oldRevenueModel = () => {
  const { onboardingVertical, globalMultipliers } = useMediaPlanStore.getState();
  return onboardingVertical === 'igaming'
    ? normalizeIgamingRevenueInputs(globalMultipliers, globalMultipliers.playerValue)
    : undefined;
};

/** runOptimization's scoring loop, copied from the store before the move. */
const oldOptimise = (state: MultiMonthState): OptimizationResult[] => {
  const patterns: ProgressionPattern[] = ['linear', 'exponential', 'aggressive-launch', 'flat', 'step'];
  const results: OptimizationResult[] = [];
  const baseTotal = state.globalSettings.baseMonthlyBudget * state.months.length;
  for (const pattern of patterns) {
    const budgets = calculateDistribution(pattern, baseTotal, state.months.length, {
      growthRate: state.globalSettings.growthRate,
    });
    const testMonths = state.months.map((m, idx) => ({ ...m, budget: budgets[idx] }));
    const metrics = calculatePlanMetrics(testMonths, state.globalSettings);
    let score = 0;
    switch (state.optimizationGoal) {
      case 'maximize-roas':
        score = metrics.totals.avgRoas * 100;
        break;
      case 'minimize-cac':
        score = metrics.totals.avgCpa ? 100 / metrics.totals.avgCpa : 0;
        break;
      case 'maximize-revenue':
        score = metrics.totals.totalRevenue / 10000;
        break;
      case 'maximize-profit':
        score = metrics.totals.netProfit / 1000;
        break;
      case 'breakeven-fastest':
        score = metrics.totals.breakEvenMonth !== null ? (12 - metrics.totals.breakEvenMonth) * 10 : 0;
        break;
      default:
        score = metrics.totals.avgRoas * 20 + metrics.totals.netProfit / 5000;
    }
    results.push({
      scenario: { progressionPattern: pattern },
      score,
      metrics: {
        totalAllocatedBudget: metrics.totals.totalAllocatedBudget,
        totalSpend: metrics.totals.totalSpend,
        totalRevenue: metrics.totals.totalRevenue,
        netProfit: metrics.totals.netProfit,
        avgRoas: metrics.totals.avgRoas,
        avgCac: metrics.totals.avgCpa || 0,
        breakEvenMonth: metrics.totals.breakEvenMonth,
      },
      reasoning: `${pattern.replace('-', ' ')} pattern achieves ${metrics.totals.avgRoas.toFixed(2)}x ROAS`,
      confidence: Math.min(95, 60 + score / 10),
    });
  }
  results.sort((a, b) => b.score - a.score);
  return results;
};

/** ScenarioComparison's inline diff, copied from the component before the move. */
const oldCompare = (aVal: number, bVal: number, higherIsBetter: boolean) => {
  const diff = aVal - bVal;
  const diffPct = bVal !== 0 ? (diff / Math.abs(bVal)) * 100 : 0;
  let winner: 'A' | 'B' | 'tie' = 'tie';
  if (Math.abs(diff) > 0.01) {
    winner = higherIsBetter ? (diff > 0 ? 'A' : 'B') : diff < 0 ? 'A' : 'B';
  }
  return { diff, diffPct, winner };
};

/** Timeline settings to run the parity checks under. */
const SETTINGS: Array<{ name: string; apply: () => void }> = [
  { name: 'defaults (6 months + soft launch, linear)', apply: () => {} },
  {
    name: '12 months, exponential, per-month overrides',
    apply: () => {
      useMultiMonthStore.setState({
        planningMonths: 12,
        includeSoftLaunch: false,
        progressionPattern: 'exponential',
        patternParams: { growthRate: 25 },
        optimizationGoal: 'maximize-profit',
      });
      mm().generateMonths();
      mm().setGlobalSettings({ spendMultiplier: 0.9, ctrBump: 0.3 });
      const [first, second, third] = mm().months;
      mm().updateMonth(first.id, { budgetMultiplier: 1.5, spendMultiplier: 0.8 });
      mm().updateMonth(second.id, { ctrBump: 0.5, budget: second.budget * 2 });
      mm().updateMonthChannel(third.id, third.channels[0].channelId, {
        allocationPct: third.channels[0].allocationPct / 2,
      });
    },
  },
  {
    name: '3 months, aggressive launch, tiny budgets (never breaks even)',
    apply: () => {
      useMultiMonthStore.setState({
        planningMonths: 3,
        includeSoftLaunch: true,
        progressionPattern: 'aggressive-launch',
        optimizationGoal: 'breakeven-fastest',
      });
      mm().generateMonths(900);
    },
  },
];

beforeEach(() => {
  localStorage.clear();
  setEngine(placeholderEngine);
  useMultiMonthStore.setState({ scenarios: [], comparisonScenarioId: null, optimizationResults: [] });
});

afterEach(async () => {
  await cleanup();
  setEngine(placeholderEngine);
});

describe.each<[Industry, number]>([
  ['igaming', 60000],
  ['ecommerce', 40000],
])('placeholder timeline behind the port (%s)', (industry, budget) => {
  beforeEach(() => {
    loadPlan(industry, budget);
    mm().resetPlan();
    // resetPlan zeroes the base budget, which would make every optimiser candidate identical.
    useMultiMonthStore.setState((state) => ({
      optimizationGoal: 'maximize-roas',
      globalSettings: { ...state.globalSettings, baseMonthlyBudget: budget },
    }));
  });

  describe.each(SETTINGS)('$name', ({ apply }) => {
    beforeEach(() => apply());

    it('months and totals equal calculatePlanMetrics', () => {
      const port = computeTimelineResult(useMediaPlanStore.getState(), mm()).plan;
      const old = calculatePlanMetrics(mm().months, mm().globalSettings, oldRevenueModel());

      expect(port.months).toHaveLength(old.months.length);
      expect(port.months.length).toBeGreaterThan(0);
      port.months.forEach((row, i) => {
        const m = old.months[i];
        expect(row.id).toBe(m.id);
        expect(row.label).toBe(m.label);
        expect(row.budget).toBe(m.budget);
        expect(row.spend).toBe(m.totalSpend);
        expect(row.conversions).toBe(m.totalConversions);
        expect(row.revenue).toBe(m.revenue);
        expect(row.operatingCosts).toBe(m.operatingCosts);
        expect(row.netProfit).toBe(m.netProfit);
        expect(row.cumulativeProfit).toBe(m.cumulativeProfit);
        expect(row.revenueModel?.registrations).toBe(m.registrations);
        expect(row.revenueModel?.activePlayers).toBe(m.activePlayers);
        expect(row.revenueModel?.ggr).toBe(m.ggr);
        expect(row.revenueModel?.bonus).toBe(m.bonus);
        expect(row.revenueModel?.ngr).toBe(m.ngr);
        expect(row.revenueModel?.grossContribution).toBe(m.grossContribution);
        // MultiMonthCharts' inline channel spend.
        expect(row.channelSpend).toEqual(
          m.channels.map((ch) => ({
            channelId: ch.channelId,
            name: ch.name,
            spend: (ch.allocationPct / 100) * (m.totalSpend || m.budget),
          }))
        );
        // ChartSection's inline plan-health delta.
        expect(row.contributionDelta).toBe((m.grossContribution || 0) - (m.totalSpend || 0));
      });
      expect(port.months.some((row) => row.revenueModel !== null)).toBe(industry === 'igaming');

      expect(port.totals).toEqual({
        allocatedBudget: old.totals.totalAllocatedBudget,
        spend: old.totals.totalSpend,
        conversions: old.totals.totalConversions,
        revenue: old.totals.totalRevenue,
        netRevenue: old.totals.totalNgr,
        grossContribution: old.totals.totalGrossContribution,
        operatingCosts: old.totals.operatingCosts,
        netProfit: old.totals.netProfit,
        avgMonthlyBudget: old.totals.avgMonthlyBudget,
        cpa: old.totals.avgCpa,
        roas: old.totals.avgRoas,
        breakEvenMonth: old.totals.breakEvenMonth,
        endingCumulativeProfit: old.totals.endingCumulativeProfit,
      });
    });

    it('scenario comparison equals the old inline diff and overlay', () => {
      mm().saveScenario('Saved');
      const saved = mm().scenarios[0];
      // Make the active plan differ from the saved one.
      mm().updateMonth(mm().months[0].id, { budget: mm().months[0].budget * 3 + 1000 });
      mm().setComparisonScenario(saved.id);

      const port = computeTimelineResult(useMediaPlanStore.getState(), mm());
      const current = calculatePlanMetrics(mm().months, mm().globalSettings, oldRevenueModel());
      const comp = calculatePlanMetrics(saved.months, saved.globalSettings, oldRevenueModel());
      const a = current.totals;
      const b = comp.totals;

      expect(port.scenarios[saved.id].totals.netProfit).toBe(b.netProfit);
      expect(port.comparison?.scenarioId).toBe(saved.id);
      expect(port.comparison?.rows).toEqual([
        { metric: 'allocatedBudget', a: a.totalAllocatedBudget, b: b.totalAllocatedBudget, ...oldCompare(a.totalAllocatedBudget, b.totalAllocatedBudget, false) },
        { metric: 'revenue', a: a.totalRevenue, b: b.totalRevenue, ...oldCompare(a.totalRevenue, b.totalRevenue, true) },
        { metric: 'netProfit', a: a.netProfit, b: b.netProfit, ...oldCompare(a.netProfit, b.netProfit, true) },
        { metric: 'roas', a: a.avgRoas, b: b.avgRoas, ...oldCompare(a.avgRoas, b.avgRoas, true) },
        { metric: 'cpa', a: a.avgCpa || 0, b: b.avgCpa || 0, ...oldCompare(a.avgCpa || 0, b.avgCpa || 0, false) },
        {
          metric: 'breakEvenMonth',
          a: a.breakEvenMonth,
          b: b.breakEvenMonth,
          diff: (a.breakEvenMonth ?? 99) - (b.breakEvenMonth ?? 99),
          diffPct: 0,
          winner:
            a.breakEvenMonth !== null && b.breakEvenMonth !== null
              ? a.breakEvenMonth < b.breakEvenMonth
                ? 'A'
                : a.breakEvenMonth > b.breakEvenMonth
                  ? 'B'
                  : 'tie'
              : a.breakEvenMonth !== null
                ? 'A'
                : b.breakEvenMonth !== null
                  ? 'B'
                  : 'tie',
        },
      ]);
      expect(port.comparison?.overlay).toEqual(
        current.months.map((m, i) => ({
          aRevenue: m.revenue || 0,
          aCumulativeProfit: m.cumulativeProfit || 0,
          bRevenue: comp.months[i]?.revenue || 0,
          bCumulativeProfit: comp.months[i]?.cumulativeProfit || 0,
        }))
      );
    });

    it.each<OptimizationGoal>([
      'maximize-roas',
      'minimize-cac',
      'maximize-revenue',
      'maximize-profit',
      'breakeven-fastest',
      'balanced',
    ])('optimisation scores equal the old runOptimization loop (%s)', async (goal) => {
      mm().setOptimizationGoal(goal);
      const old = oldOptimise(mm());

      const port = computeTimelineResult(useMediaPlanStore.getState(), mm()).optimisation;
      expect(port.map((c) => c.pattern)).toEqual(old.map((r) => r.scenario.progressionPattern));
      port.forEach((candidate, i) => {
        expect(candidate.score).toBe(old[i].score);
        expect(candidate.confidence).toBe(old[i].confidence);
        expect(candidate.totals.netProfit).toBe(old[i].metrics.netProfit);
      });

      await mm().runOptimization();
      expect(mm().optimizationResults).toEqual(old.slice(0, 3));
    });

    it('pattern budgets and base channels equal calculateDistribution and channelsFromPlanSnapshot', () => {
      const state = mm();
      const plan = useMediaPlanStore.getState();
      const params = { ...state.patternParams, growthRate: state.globalSettings.growthRate };
      const currentTotal = state.months.reduce((sum, m) => sum + m.budget, 0);

      const port = computeTimelineResult(plan, state);
      expect(port.patternBudgets).toEqual(
        calculateDistribution(state.progressionPattern, currentTotal, state.months.length, params)
      );
      expect(port.baseChannels).toEqual(channelsFromPlanSnapshot(computePlanSnapshot(plan).channels));

      const redistributed = computeTimelineResult(plan, state, { totalBudget: 123456, monthCount: 9 });
      expect(redistributed.patternBudgets).toEqual(
        calculateDistribution(state.progressionPattern, 123456, 9, params)
      );
    });
  });

  it('store actions fill months with the budgets and channels they computed before the port', () => {
    useMultiMonthStore.setState({ planningMonths: 5, includeSoftLaunch: true, progressionPattern: 'step' });
    mm().generateMonths();
    const plan = useMediaPlanStore.getState();
    const params = { ...mm().patternParams, growthRate: mm().globalSettings.growthRate };
    const channels = channelsFromPlanSnapshot(computePlanSnapshot(plan).channels);

    expect(mm().months.map((m) => m.budget)).toEqual(
      calculateDistribution('step', plan.totalBudget * 6, 6, params)
    );
    mm().months.forEach((m) => expect(m.channels).toEqual(channels));

    // applyPattern re-spreads the current total.
    mm().updateMonth(mm().months[2].id, { budget: 1 });
    const total = mm().months.reduce((sum, m) => sum + m.budget, 0);
    mm().setProgressionPattern('seasonal');
    mm().applyPattern();
    expect(mm().months.map((m) => m.budget)).toEqual(calculateDistribution('seasonal', total, 6, params));

    // setGlobalSettings re-spreads base budget x months.
    mm().setGlobalSettings({ baseMonthlyBudget: 7000, growthRate: 20 });
    expect(mm().months.map((m) => m.budget)).toEqual(
      calculateDistribution('seasonal', 7000 * 6, 6, { ...mm().patternParams, growthRate: 20 })
    );

    // resetMonthToGlobal restores the plan's channel mix.
    const edited = mm().months[1];
    mm().updateMonthChannel(edited.id, edited.channels[0].channelId, { allocationPct: 1 });
    mm().resetMonthToGlobal(edited.id);
    expect(mm().months[1].channels).toEqual(channels);
  });

  it('is a pure function of its inputs: it never reads the live stores and never mutates them', () => {
    mm().saveScenario('Saved');
    mm().setComparisonScenario(mm().scenarios[0].id);
    const input = selectEngineInput(useMediaPlanStore.getState());
    const timeline = selectTimelineInput(mm());
    const frozenInput = JSON.stringify(input);
    const frozenTimeline = JSON.stringify(timeline);

    const first = placeholderEngine.computeTimeline(input, timeline);
    loadPlan(industry === 'igaming' ? 'ecommerce' : 'igaming', 250000);
    useMultiMonthStore.setState({ planningMonths: 12, progressionPattern: 'flat' });
    mm().generateMonths();

    expect(placeholderEngine.computeTimeline(input, timeline)).toEqual(first);
    expect(JSON.stringify(input)).toBe(frozenInput);
    expect(JSON.stringify(timeline)).toBe(frozenTimeline);
  });
});

describe('swapping the engine (timeline)', () => {
  beforeEach(() => {
    loadPlan('igaming', 60000);
    mm().resetPlan();
  });

  it('useTimelineResult and the store actions follow the swapped engine', async () => {
    let seen: TimelineResult | null = null;
    function Probe() {
      seen = useTimelineResult();
      return null;
    }
    await mount(<Probe />);
    expect(seen!.engine.id).toBe('placeholder');
    const placeholderSpend = seen!.plan.totals.spend;
    expect(placeholderSpend).toBeGreaterThan(0);

    const stub: PlanEngine = {
      ...placeholderEngine,
      id: 'stub',
      version: '1.0.0',
      computeTimeline: (input, timeline) => {
        const base = placeholderEngine.computeTimeline(input, timeline);
        return {
          ...base,
          engine: { id: 'stub', version: '1.0.0' },
          plan: { ...base.plan, totals: { ...base.plan.totals, spend: 424242, netProfit: -7 } },
          patternBudgets: base.patternBudgets.map(() => 11),
        };
      },
    };
    await act(async () => setEngine(stub));
    expect(seen!.engine.id).toBe('stub');
    expect(seen!.plan.totals.spend).toBe(424242);
    expect(seen!.plan.totals.netProfit).toBe(-7);

    // Store actions take month budgets from the engine too.
    await act(async () => mm().applyPattern());
    expect(mm().months.every((m) => m.budget === 11)).toBe(true);
  });
});
