// Port conformance: what every PlanEngine must do, whatever its maths. These are the shape,
// purity and swap expectations of engine-port / timeline-port / what-if-port tests, written
// against an engine passed in, so a new engine runs the same suite as the placeholder.
// (Those three files additionally pin the placeholder's formulas; that part is engine-specific.)

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, mount } from '@/test/mount';
import { useBlendedMetrics, useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { useMultiMonthStore } from '@/hooks/use-multi-month-store';
import { usePlanEconomics } from '@/hooks/use-plan-economics';
import { generatePlan } from '@/lib/plan-generator';
import { useSandboxStore } from '@/store/useSandboxStore';
import type { EngineResult, PlanEngine } from './contract';
import { selectEngineInput } from './input';
import { placeholderEngine } from './placeholder-engine';
import { getEngine, setEngine } from './registry';
import type { TimelineResult } from './timeline';
import { selectTimelineInput } from './timeline-input';
import { computePlanResult, usePlanResult } from './use-plan-result';
import { useTimelineResult } from './use-timeline-result';
import { useWhatIfResult } from './use-what-if-result';
import type { WhatIfResult } from './what-if';
import { selectWhatIfInput, type WhatIfControls, type WhatIfSandboxSource } from './what-if-input';

type Industry = 'ecommerce' | 'igaming';

const loadPlan = (industry: Industry, monthlyBudget: number) =>
  useMediaPlanStore.getState().applyGeneratedPlan(generatePlan({ industry, monthlyBudget, markets: ['DE'] }));

const mm = () => useMultiMonthStore.getState();

const CONTROLS: WhatIfControls = { churnRatePct: 4.2, cpaShockPct: 0, roasLiftPct: 0, decayCurve: 'standard-linear' };

const sandboxSource = (enabled: boolean): WhatIfSandboxSource => {
  const first = useMediaPlanStore.getState().channels[0]?.id;
  return {
    sandboxEnabled: enabled,
    selectedChannelIds: first ? [first] : [],
    channelAdjustments: first ? { [first]: { spendPct: 40, cpaPct: 10, roasPct: -5, churnPct: 4 } } : {},
    groupAdjustments: { organic: 0, paid: 20, affiliate: -10, influencer: 0 },
  };
};

const isNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value);

export function describeEnginePort(engine: PlanEngine): void {
  describe(`engine port conformance: ${engine.id}`, () => {
    beforeEach(() => {
      localStorage.clear();
      setEngine(engine);
      useSandboxStore.getState().setSandboxEnabled(false);
      loadPlan('ecommerce', 40000);
      mm().resetPlan();
    });

    afterEach(async () => {
      await cleanup();
      setEngine(placeholderEngine);
    });

    describe.each<Industry>(['ecommerce', 'igaming'])('%s plan', (industry) => {
      beforeEach(() => {
        loadPlan(industry, 60000);
        mm().resetPlan();
      });

      it('compute returns a complete result that names the engine', () => {
        const state = useMediaPlanStore.getState();
        const input = selectEngineInput(state);
        const result = engine.compute(input);

        expect(result.engine).toEqual({ id: engine.id, version: engine.version });
        // Channels: input order, one per input channel, each with an insight entry.
        expect(result.channels.map((c) => c.id)).toEqual(input.channels.map((c) => c.id));
        input.channels.forEach((c) => {
          const insight = result.channelInsights[c.id];
          expect(insight).toBeDefined();
          expect(isNumber(insight.spendSharePct)).toBe(true);
          expect(isNumber(insight.budgetSharePct)).toBe(true);
        });
        result.channels.forEach((c) => {
          (['spend', 'impressions', 'clicks', 'conversions', 'revenue', 'roas'] as const).forEach((key) => {
            expect(isNumber(c.metrics[key])).toBe(true);
            expect(c.metrics[key]).toBeGreaterThanOrEqual(0);
          });
        });

        expect(result.totals.totalSpend).toBeGreaterThan(0);
        expect(result.totals.totalConversions).toBeGreaterThan(0);
        expect(result.totals.totalSpend).toBeCloseTo(result.channels.reduce((s, c) => s + c.metrics.spend, 0), 6);
        expect(result.totals.spendShareTotalPct).toBeCloseTo(100, 6);
        expect(result.totals.unallocated).toBeGreaterThanOrEqual(0);

        expect(result.economics.computable).toBe(true);
        expect(result.economics.monthlySpend).toBeCloseTo(result.totals.totalSpend, 6);
        expect(result.roas.lifetime).toBeCloseTo(result.totals.blendedRoas, 9);
        expect(result.customerValue.curve).toHaveLength(12);
        expect(result.customerValue.curve.map((p) => p.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
        expect(result.scenarios.map((s) => s.scenario)).toEqual(['Bear', 'Base', 'Bull']);
        expect(result.groups.returnTrend).toHaveLength(6);
        expect(result.groups.reportReturnTrend).toHaveLength(6);
        expect(result.groups.utilization).toHaveLength(4);
        expect(result.revenueModelMonth === null).toBe(industry !== 'igaming');
        expect(result.strongestChannelId === null || input.channels.some((c) => c.id === result.strongestChannelId)).toBe(true);
        expect(Array.isArray(result.alerts.efficiency)).toBe(true);
        expect(Array.isArray(result.alerts.integrity)).toBe(true);
      });

      it('inactive channels are zeroed and stay in the result', () => {
        const input = selectEngineInput(useMediaPlanStore.getState());
        const offId = input.channels[0].id;
        const result = engine.compute({
          ...input,
          channels: input.channels.map((c) => (c.id === offId ? { ...c, isActive: false } : c)),
        });
        const off = result.channels.find((c) => c.id === offId)!;
        expect(off.metrics.spend).toBe(0);
        expect(off.metrics.conversions).toBe(0);
        expect(off.metrics.revenue).toBe(0);
        expect(result.channelInsights[offId].spendSharePct).toBe(0);
      });

      it('compute is a pure function of its input: it never reads the live store and never mutates the input', () => {
        const input = selectEngineInput(useMediaPlanStore.getState());
        const frozen = JSON.stringify(input);
        const first = engine.compute(input);
        loadPlan(industry === 'igaming' ? 'ecommerce' : 'igaming', 200000);
        expect(engine.compute(input)).toEqual(first);
        expect(JSON.stringify(input)).toBe(frozen);
      });

      it('unallocated budget is never negative and fixed fees above the budget are flagged', () => {
        const result = computePlanResult({ ...useMediaPlanStore.getState(), totalBudget: 100 });
        expect(result.totals.unallocated).toBe(0);
        if (result.totals.fixedSpend > 100) {
          expect(result.totals.overBudget).toBe(true);
          expect(result.totals.overBudgetBy).toBeCloseTo(result.totals.fixedSpend - 100, 6);
        }
      });

      it('computeTimeline returns a complete timeline for the months it was given', () => {
        mm().saveScenario('Saved');
        mm().setComparisonScenario(mm().scenarios[0].id);
        const input = selectEngineInput(useMediaPlanStore.getState());
        const timeline = selectTimelineInput(mm());
        const result = engine.computeTimeline(input, timeline);

        expect(result.engine).toEqual({ id: engine.id, version: engine.version });
        expect(result.plan.months.map((m) => m.id)).toEqual(timeline.months.map((m) => m.id));
        expect(result.plan.months.map((m) => m.label)).toEqual(timeline.months.map((m) => m.label));
        let cumulative = 0;
        result.plan.months.forEach((month, idx) => {
          expect(month.budget).toBe(timeline.months[idx].budget);
          expect(month.channelSpend.map((c) => c.channelId)).toEqual(timeline.months[idx].channels.map((c) => c.channelId));
          cumulative += month.netProfit;
          expect(month.cumulativeProfit).toBeCloseTo(cumulative, 4);
          expect(month.revenueModel === null).toBe(industry !== 'igaming');
        });
        const totals = result.plan.totals;
        expect(totals.spend).toBeCloseTo(result.plan.months.reduce((s, m) => s + m.spend, 0), 4);
        expect(totals.conversions).toBeCloseTo(result.plan.months.reduce((s, m) => s + m.conversions, 0), 4);
        expect(totals.netProfit).toBeCloseTo(result.plan.months.reduce((s, m) => s + m.netProfit, 0), 4);
        expect(totals.allocatedBudget).toBe(timeline.months.reduce((s, m) => s + m.budget, 0));
        expect(totals.endingCumulativeProfit).toBeCloseTo(cumulative, 4);

        expect(Object.keys(result.scenarios)).toEqual(timeline.scenarios.map((s) => s.id));
        expect(result.comparison?.scenarioId).toBe(timeline.comparisonScenarioId);
        expect(result.comparison?.rows.map((r) => r.metric)).toEqual([
          'allocatedBudget',
          'revenue',
          'netProfit',
          'roas',
          'cpa',
          'breakEvenMonth',
        ]);
        expect(result.optimisation.length).toBeGreaterThan(0);
        result.optimisation.slice(1).forEach((candidate, idx) => {
          expect(candidate.score).toBeLessThanOrEqual(result.optimisation[idx].score);
        });
        expect(result.patternBudgets).toHaveLength(timeline.months.length);
        expect(result.patternBudgets.reduce((s, b) => s + b, 0)).toBeCloseTo(totals.allocatedBudget, 0);
        expect(result.baseChannels.length).toBeGreaterThan(0);
        expect(result.baseChannels.reduce((s, c) => s + c.allocationPct, 0)).toBeCloseTo(100, 6);
      });

      it('computeTimeline is a pure function of its inputs: it never reads the live stores and never mutates them', () => {
        mm().saveScenario('Saved');
        mm().setComparisonScenario(mm().scenarios[0].id);
        const input = selectEngineInput(useMediaPlanStore.getState());
        const timeline = selectTimelineInput(mm());
        const frozenInput = JSON.stringify(input);
        const frozenTimeline = JSON.stringify(timeline);

        const first = engine.computeTimeline(input, timeline);
        loadPlan(industry === 'igaming' ? 'ecommerce' : 'igaming', 250000);
        useMultiMonthStore.setState({ planningMonths: 12, progressionPattern: 'flat' });
        mm().generateMonths();

        expect(engine.computeTimeline(input, timeline)).toEqual(first);
        expect(JSON.stringify(input)).toBe(frozenInput);
        expect(JSON.stringify(timeline)).toBe(frozenTimeline);
      });

      it.each([false, true])('computeWhatIf returns a complete lab result (sandbox enabled: %s)', (enabled) => {
        const input = selectEngineInput(useMediaPlanStore.getState());
        const whatIf = selectWhatIfInput(CONTROLS, sandboxSource(enabled));
        const result = engine.computeWhatIf(input, whatIf);

        expect(result.engine).toEqual({ id: engine.id, version: engine.version });
        expect(result.channels.map((c) => c.channelId)).toEqual(input.channels.map((c) => c.id));
        expect(result.groups.map((g) => g.group)).toEqual(['organic', 'paid', 'affiliate', 'influencer']);
        expect(result.active).toEqual(enabled ? result.adjusted : result.baseline);
        expect(result.baseline.totalSpend).toBeCloseTo(engine.compute(input).totals.totalSpend, 6);
        expect(result.baseline.totalConversions).toBeCloseTo(engine.compute(input).totals.totalConversions, 6);
        // The adjusted channel spends more: +40% on the channel and its group's shift.
        const adjustedChannel = result.channels[0];
        expect(adjustedChannel.adjustedSpend).toBeGreaterThan(adjustedChannel.baselineSpend);
        expect(result.customerValue.curve).toHaveLength(12);
        expect(result.customerValue.isCalibrated).toBe(false);
        expect(result.customerValue.monthlyChurn).toBeGreaterThan(0);
        (['baseline', 'active'] as const).forEach((key) =>
          expect(result.scenarios[key].map((s) => s.scenario)).toEqual(['Bear', 'Base', 'Bull'])
        );
        expect(result.scenarios.baselineRoi).toHaveLength(3);
        expect(result.scenarios.adjustedRoi).toHaveLength(3);
        expect(isNumber(result.summary.roiDeltaPct)).toBe(true);
        expect(result.exportSnapshot.enabled).toBe(enabled);
        expect(result.exportSnapshot.channelComparisons).toHaveLength(input.channels.length);
        expect(result.exportSnapshot.scenarioComparisons).toHaveLength(3);
      });

      it('computeWhatIf is a pure function of its inputs: it never reads the live stores and never mutates them', () => {
        const input = selectEngineInput(useMediaPlanStore.getState());
        const whatIf = selectWhatIfInput(CONTROLS, sandboxSource(true));
        const frozenInput = JSON.stringify(input);
        const frozenWhatIf = JSON.stringify(whatIf);

        const first = engine.computeWhatIf(input, whatIf);
        loadPlan(industry === 'igaming' ? 'ecommerce' : 'igaming', 250000);
        useMediaPlanStore.getState().setObservedLtv('m1', 999);
        useSandboxStore.getState().setSandboxEnabled(true);
        useSandboxStore.getState().setGroupAdjustment('paid', 80);

        expect(engine.computeWhatIf(input, whatIf)).toEqual(first);
        expect(JSON.stringify(input)).toBe(frozenInput);
        expect(JSON.stringify(whatIf)).toBe(frozenWhatIf);

        useMediaPlanStore.getState().clearObservedLtv();
        useSandboxStore.getState().setSandboxEnabled(false);
        useSandboxStore.getState().setGroupAdjustment('paid', 0);
      });
    });

    describe('selecting the engine', () => {
      it('every screen hook reads this engine once it is selected, and follows a swap away from it', async () => {
        loadPlan('igaming', 60000);
        mm().resetPlan();
        let plan: EngineResult | null = null;
        let timeline: TimelineResult | null = null;
        let whatIf: WhatIfResult | null = null;
        let revenue = -1;
        let netPnl = 0;
        function Probe() {
          plan = usePlanResult();
          timeline = useTimelineResult();
          whatIf = useWhatIfResult(CONTROLS);
          revenue = useBlendedMetrics().projectedRevenue;
          netPnl = usePlanEconomics().netPnl;
          return null;
        }
        await mount(<Probe />);
        expect(getEngine()).toBe(engine);
        expect(plan!.engine.id).toBe(engine.id);
        expect(timeline!.engine.id).toBe(engine.id);
        expect(whatIf!.engine.id).toBe(engine.id);

        // The dashboard and report hooks show this engine's numbers.
        const direct = engine.compute(selectEngineInput(useMediaPlanStore.getState()));
        expect(plan!).toEqual(direct);
        expect(revenue).toBe(direct.totals.projectedRevenue);
        expect(netPnl).toBe(direct.economics.netValuePerMonth);

        // Store actions take month budgets from this engine.
        const budgets = timeline!.patternBudgets;
        await act(async () => mm().applyPattern());
        expect(mm().months.map((m) => m.budget)).toEqual(budgets);

        const stub: PlanEngine = {
          ...engine,
          id: 'stub',
          version: '9.9.9',
          compute: (input) => ({ ...engine.compute(input), engine: { id: 'stub', version: '9.9.9' } }),
          computeTimeline: (input, t) => ({ ...engine.computeTimeline(input, t), engine: { id: 'stub', version: '9.9.9' } }),
          computeWhatIf: (input, w) => ({ ...engine.computeWhatIf(input, w), engine: { id: 'stub', version: '9.9.9' } }),
        };
        await act(async () => setEngine(stub));
        expect(plan!.engine.id).toBe('stub');
        expect(timeline!.engine.id).toBe('stub');
        expect(whatIf!.engine.id).toBe('stub');
      });
    });
  });
}
