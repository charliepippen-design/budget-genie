import { beforeEach, describe, expect, it } from 'vitest';
import { useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { computePlanSnapshot, isFixedCostChannel } from '@/lib/media-plan/plan-snapshot';
import type { ChannelWithMetrics } from '@/lib/media-plan/types';
import { generatePlan } from '@/lib/plan-generator';
import { computePlanHealth } from '@/lib/plan-health';
import { computeRoasPair } from '@/lib/roas-pair';
import { buildPlanScenarios, DEFAULT_CHURN_RATE } from '@/lib/ltv-model';
import {
  buildRoasTrendData,
  buildScenarioEnvelope,
  getEfficiencyAlerts,
  getMetricIntegrityIssues,
} from '@/lib/planning-insights';
import { buildCsvContent, buildCsvFromResult } from '@/lib/export-service';
import { summarizePlan } from '@/lib/planner-agent';
import { narratorPlanFigures } from '@/lib/report-narrator';
import { computePlanResult } from '@/engine';
import type { EngineSource } from '@/engine/input';

// Each field pins the formula an export, the AI context or a report page computed inline before
// it moved into the engine.

type Industry = 'ecommerce' | 'igaming';
type Store = ReturnType<typeof useMediaPlanStore.getState>;

const loadPlan = (industry: Industry, monthlyBudget: number) => {
  useMediaPlanStore.getState().applyGeneratedPlan(generatePlan({ industry, monthlyBudget, markets: ['DE'] }));
  return useMediaPlanStore.getState();
};

/**
 * A saturated channel, one priced 1000x too high, one switched off and one turned into a flat fee,
 * so alerts are not empty and budget shares differ from spend shares.
 */
const withStressedChannels = (state: Store): Store => {
  const spenders = computePlanSnapshot(state).channels.filter(
    (c) => c.isActive && c.metrics.spend > 0 && !isFixedCostChannel(c)
  );
  const [saturated, loser, idle, fee] = spenders;
  return {
    ...state,
    channels: state.channels.map((c) => {
      if (c.id === saturated.id) {
        const ceiling = saturated.metrics.spend * 0.95;
        return { ...c, typeConfig: { ...c.typeConfig, baselineMetrics: { ...c.typeConfig.baselineMetrics, saturationCeiling: ceiling } } };
      }
      if (c.id === loser.id) return { ...c, typeConfig: { ...c.typeConfig, price: c.typeConfig.price * 1000 } };
      if (c.id === idle?.id) return { ...c, isActive: false };
      if (c.id === fee?.id) return { ...c, buyingModel: 'FLAT_FEE' as const, typeConfig: { ...c.typeConfig, price: 1234.56 } };
      return c;
    }),
  };
};

// The inline formulas, copied from the consumers before the move.
const round = (n: number | null | undefined, d = 0) => (n == null || !isFinite(n) ? null : Number(n.toFixed(d)));
const oldActive = (channels: ChannelWithMetrics[]) => channels.filter((c) => c.isActive && c.metrics.spend > 0);
const oldPlannerShare = (c: ChannelWithMetrics, state: EngineSource) =>
  round((c.metrics.spend / (state.totalBudget || 1)) * 100, 1);

const options = { currencySymbol: '$', formatCurrency: (value: number) => `$${value.toFixed(2)}` };

beforeEach(() => localStorage.clear());

describe.each<[Industry, number]>([
  ['igaming', 60000],
  ['ecommerce', 40000],
])('engine export and AI fields (%s)', (industry, budget) => {
  const cases = () => {
    const base = loadPlan(industry, budget);
    return [base, withStressedChannels(base), { ...base, totalBudget: 0 }];
  };

  it('planner-agent: share of budget per channel, total row and fixed fees as % of budget', () => {
    for (const state of cases()) {
      const result = computePlanResult(state);
      const { channels } = computePlanSnapshot(state);
      channels.forEach((c) => {
        expect(result.channelInsights[c.id].budgetSharePct).toBe((c.metrics.spend / (state.totalBudget || 1)) * 100);
      });

      // PlannerChat's total row: the listed rows' rounded shares, added up and rounded again.
      const listed = channels.filter((c) => c.isActive !== false && (round(c.metrics.spend) ?? 0) > 0);
      const oldTotalShare = Math.round(listed.reduce((t, c) => t + (oldPlannerShare(c, state) ?? 0), 0) * 10) / 10;
      expect(result.totals.budgetShareTotalPct).toBe(oldTotalShare);

      // setChannelShare's fixed share.
      const oldFixedPct = state.channels
        .filter((c) => c.isActive !== false && isFixedCostChannel(c))
        .reduce((s, c) => s + ((c.typeConfig?.price || 0) / (state.totalBudget || 1)) * 100, 0);
      expect(result.totals.fixedBudgetSharePct).toBe(oldFixedPct);
    }
  });

  it('planner-agent: summarizePlan reports the same numbers as before', () => {
    for (const state of cases()) {
      const { channels, blended: b } = computePlanSnapshot(state);
      const health = computePlanHealth(b, state.onboardingVertical, state.globalMultipliers);
      const plan = summarizePlan(state);
      expect(plan.channels.map((c) => [c.id, c.spend, c.sharePct, c.conversions, c.cpa, c.roas])).toEqual(
        channels.map((c) => [
          c.id,
          round(c.metrics.spend),
          oldPlannerShare(c, state),
          round(c.metrics.conversions, 1),
          round(c.metrics.cpa),
          round(c.metrics.roas, 2),
        ])
      );
      expect(plan.blended).toEqual({
        spend: round(b.totalSpend),
        conversions: round(b.totalConversions, 1),
        costPerConversion: round(b.blendedCpa),
        grossValue: round(b.projectedRevenue),
        roas: round(b.blendedRoas, 2),
        sharePct: computePlanResult(state).totals.budgetShareTotalPct,
      });
      expect(plan.profitability).toMatchObject({
        losesMoney: health.losesMoney,
        monthlyContribution: round(health.monthlyContribution) ?? 0,
        breakEvenCpa: round(health.breakEvenCpa),
        blendedCpa: round(health.blendedCpa),
      });
    }
  });

  it('Report / Output: return trend (churn 0.042), strongest channel, alerts over active channels, bar width', () => {
    for (const state of cases()) {
      const result = computePlanResult(state);
      const { channels, blended } = computePlanSnapshot(state);
      const active = oldActive(channels);

      expect(result.groups.reportReturnTrend).toEqual(
        buildRoasTrendData(active, { churnRate: 0.042, cpaMultiplier: 1, roasMultiplier: 1 }, 6)
      );
      expect(result.strongestChannelId).toBe([...active].sort((a, b) => b.metrics.roas - a.metrics.roas)[0]?.id ?? null);
      expect(result.alerts.efficiencyActive).toEqual(getEfficiencyAlerts(active));

      const oldWidth = blended.totalSpend > 0 ? Math.min(100, (blended.projectedRevenue / blended.totalSpend) * 50) : 0;
      expect(Math.min(100, result.totals.blendedRoas * 50)).toBe(oldWidth);
    }
  });

  it('alerts over active channels differ from the dashboard list when idle channels pull the average down', () => {
    const base = loadPlan(industry, budget);
    const spenders = computePlanSnapshot(base).channels.filter((c) => c.metrics.spend > 0 && !isFixedCostChannel(c));
    const smallest = [...spenders].sort((a, b) => a.metrics.spend - b.metrics.spend)[0];
    const idle = Array.from({ length: 500 }, (_, i) => ({ ...base.channels[0], id: `idle-${i}`, isActive: false }));
    const result = computePlanResult({
      ...base,
      channels: [
        ...base.channels.map((c) =>
          c.id === smallest.id ? { ...c, typeConfig: { ...c.typeConfig, price: c.typeConfig.price * 1000 } } : c
        ),
        ...idle,
      ],
    });
    // Below the average of spending channels, above the average once 500 idle channels count too.
    const medium = (list: typeof result.alerts.efficiency) => list.filter((a) => a.severity === 'medium').map((a) => a.channelId);
    expect(medium(result.alerts.efficiency)).toContain(smallest.id);
    expect(medium(result.alerts.efficiencyActive)).not.toContain(smallest.id);
    expect(result.groups.reportReturnTrend).not.toEqual(result.groups.returnTrend);
  });

  it('report narrative: the prompt figures match what the pages passed', () => {
    for (const state of cases()) {
      const result = computePlanResult(state);
      const { channels, blended } = computePlanSnapshot(state);
      const active = oldActive(channels);
      const top = [...active].sort((a, b) => b.metrics.roas - a.metrics.roas)[0];
      const weakest = active.find((c) => c.metrics.roas < 1) ?? null;
      expect(narratorPlanFigures(result)).toEqual({
        totalSpend: blended.totalSpend,
        projectedRevenue: blended.projectedRevenue,
        projectedFtds: blended.totalConversions,
        blendedCpa: blended.blendedCpa,
        blendedRoas: blended.blendedRoas,
        month1Roas: computeRoasPair(blended, state.onboardingVertical, state.globalMultipliers).month1,
        paybackMonths: result.customerValue.paybackMonth,
        topChannel: top?.name ?? 'Unknown',
        weakestChannel: weakest?.name ?? null,
        scenarioBase: result.scenarios[1],
        alertCount: getEfficiencyAlerts(active).length,
      });
    }
  });

  it('exports: CSV, scenarios, alerts and Excel shares are the ones the dashboard passed in', () => {
    for (const state of cases()) {
      const result = computePlanResult(state);
      const { channels, blended } = computePlanSnapshot(state);

      // What BudgetGenieAI built by hand before the exports took the engine result.
      const oldScenarios = buildPlanScenarios(blended, {
        playerValue: state.globalMultipliers.playerValue,
        blendedRoas: blended.blendedRoas,
        churnRate: DEFAULT_CHURN_RATE,
        observedLtv: state.observedLtv,
      });
      const oldAlerts = [
        ...getEfficiencyAlerts(channels).map((a) => ({ channelName: a.channelName, reason: a.reason, severity: a.severity })),
        ...getMetricIntegrityIssues(channels).map((i) => ({ channelName: i.channelName, reason: i.issue, severity: 'medium' as const })),
      ];
      const oldBlended = {
        ...blended,
        month1Roas: computeRoasPair(blended, state.onboardingVertical, state.globalMultipliers).month1,
      };
      expect(buildCsvFromResult(result, state.totalBudget, options)).toBe(
        buildCsvContent(channels, state.totalBudget, oldBlended, options, oldScenarios, oldAlerts)
      );

      // Excel "Allocation %": spend / total spend.
      const allocSpend = channels.reduce((sum, ch) => sum + ch.metrics.spend, 0);
      channels.forEach((ch) => {
        const old = allocSpend > 0 ? ch.metrics.spend / allocSpend : 0;
        expect(result.channelInsights[ch.id].spendSharePct / 100).toBeCloseTo(old, 12);
      });
    }
  });

  it('exports: the removed scenario fallback equals the engine scenarios without observed value', () => {
    const state = loadPlan(industry, budget);
    const { blended } = computePlanSnapshot(state);
    const oldFallback = buildScenarioEnvelope({
      baseLtvPerUser: blended.blendedCpa ? blended.blendedCpa * blended.blendedRoas : 0,
      conversions: blended.totalConversions,
      cpa: blended.blendedCpa ?? 0,
      assumptions: { churnRate: DEFAULT_CHURN_RATE, cpaMultiplier: 1, roasMultiplier: 1 },
    });
    expect(computePlanResult(state).scenarios).toEqual(oldFallback);
    // With observed value the engine calibrates and the old fallback did not (it was never reached).
    const calibrated = computePlanResult({ ...state, observedLtv: { m1: 5, m3: 9, m6: 12 } });
    expect(calibrated.scenarios).not.toEqual(oldFallback);
  });
});
