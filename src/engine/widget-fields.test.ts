import { beforeEach, describe, expect, it } from 'vitest';
import { useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { computePlanSnapshot, getSpendSharePct } from '@/lib/media-plan/plan-snapshot';
import type { ChannelWithMetrics } from '@/lib/media-plan/types';
import { generatePlan } from '@/lib/plan-generator';
import { computeRoasPair } from '@/lib/roas-pair';
import { calculateIgamingRevenueMonth, normalizeIgamingRevenueInputs } from '@/lib/igaming-revenue-model';
import { buildBudgetUtilization, buildGroupSpendTotals, buildRoasTrendData } from '@/lib/planning-insights';
import { computePlanResult, getEngine, selectEngineInput } from '@/engine';
import type { EngineSource } from '@/engine/input';

// Each field pins the formula the widget computed inline before it moved into the engine.

type Industry = 'ecommerce' | 'igaming';

const loadPlan = (industry: Industry, monthlyBudget: number) => {
  useMediaPlanStore.getState().applyGeneratedPlan(generatePlan({ industry, monthlyBudget, markets: ['DE'] }));
  return useMediaPlanStore.getState();
};

/** One channel past 90% of a tight saturation ceiling and one priced 1000x too high, so the lists are not empty. */
const withStressedChannels = (state: EngineSource): EngineSource => {
  const channels = computePlanSnapshot(state).channels;
  const spenders = channels.filter((c) => c.isActive && c.metrics.spend > 0);
  const [saturated, loser] = spenders;
  return {
    ...state,
    channels: state.channels.map((c) => {
      if (c.id === saturated.id) {
        const ceiling = saturated.metrics.spend * 0.95;
        return { ...c, typeConfig: { ...c.typeConfig, baselineMetrics: { ...c.typeConfig.baselineMetrics, saturationCeiling: ceiling } } };
      }
      if (c.id === loser.id) {
        return { ...c, typeConfig: { ...c.typeConfig, price: c.typeConfig.price * 1000 } };
      }
      return c;
    }),
  };
};

// The inline formulas, copied from the widgets before the move.
const oldPayback = (channel: ChannelWithMetrics, g: EngineSource['globalMultipliers']) => {
  const ngrPerPlayer = g.playerValue * g.turnoverRate * g.margin * (1 - g.bonusRate);
  if (!channel.metrics.cpa || channel.metrics.cpa <= 0 || ngrPerPlayer <= 0 || g.retentionRate <= 0) return null;
  return channel.metrics.cpa / (ngrPerPlayer * g.retentionRate);
};
const oldNearSaturation = (c: ChannelWithMetrics) => {
  const ceiling = c.typeConfig.baselineMetrics.saturationCeiling ?? 0;
  return c.isActive && ceiling > 0 && c.metrics.spend > ceiling * 0.9;
};

beforeEach(() => localStorage.clear());

describe.each<[Industry, number]>([
  ['igaming', 60000],
  ['ecommerce', 40000],
])('engine widget fields (%s)', (industry, budget) => {
  const cases = () => {
    const base = loadPlan(industry, budget);
    return [base, withStressedChannels(base)];
  };

  it('ChannelTable: payback, spend shares, unallocated, ROAS pair and ghost revenue', () => {
    for (const state of cases()) {
      const result = computePlanResult(state);
      const { channels, blended } = computePlanSnapshot(state);
      channels.forEach((c) => {
        const insight = result.channelInsights[c.id];
        expect(insight.paybackMonths).toBe(oldPayback(c, state.globalMultipliers));
        expect(insight.spendSharePct).toBe(getSpendSharePct(c, blended));
      });
      expect(result.totals.spendShareTotalPct).toBe(channels.reduce((s, c) => s + getSpendSharePct(c, blended), 0));
      expect(result.totals.unallocated).toBe(Math.max(0, state.totalBudget - blended.totalSpend));
      expect(result.roas).toEqual(computeRoasPair(blended, state.onboardingVertical, state.globalMultipliers));
      expect(getEngine().compute(selectEngineInput(state)).totals.projectedRevenue).toBe(blended.projectedRevenue);
    }
  });

  it('EfficiencyAlertBanner / StrategicInsightsPanel / Report / Output: break-even, wasted spend, saturation, weakest', () => {
    const [base, stressed] = cases();
    for (const state of [base, stressed]) {
      const result = computePlanResult(state);
      const channels = computePlanSnapshot(state).channels;
      const under = channels.filter((c) => c.isActive && c.metrics.roas < 1 && c.metrics.spend > 0);
      const saturated = channels.filter(oldNearSaturation);
      const active = channels.filter((c) => c.isActive && c.metrics.spend > 0);

      expect(result.alerts.belowBreakEven).toEqual(under.map((c) => c.id));
      expect(result.alerts.wastedSpend).toBe(under.reduce((s, c) => s + c.metrics.spend, 0));
      expect(result.alerts.nearSaturation).toEqual(saturated.map((c) => c.id));
      expect(result.alerts.weakestChannelId).toBe(active.find((c) => c.metrics.roas < 1)?.id ?? null);
      saturated.forEach((top) => {
        const pct = Math.min(100, Math.round((top.metrics.spend / (top.typeConfig.baselineMetrics.saturationCeiling ?? top.metrics.spend)) * 100));
        expect(result.channelInsights[top.id].saturationPct).toBe(pct);
      });
    }
    const stressedResult = computePlanResult(stressed);
    expect(stressedResult.alerts.nearSaturation.length).toBeGreaterThan(0);
    expect(stressedResult.alerts.belowBreakEven.length).toBeGreaterThan(0);
    expect(stressedResult.alerts.wastedSpend).toBeGreaterThan(0);
  });

  it('BudgetHero: fixed-tier spend is the sum of active fixed-tier prices', () => {
    for (const state of cases()) {
      const old = state.channels
        .filter((c) => c.isActive !== false && c.tier === 'fixed')
        .reduce((sum, c) => sum + (c.typeConfig.price || 0), 0);
      expect(computePlanResult(state).totals.fixedTierSpend).toBe(old);
    }
  });

  it('ChartSection: group spend, utilisation and return trend (churn 0.04)', () => {
    for (const state of cases()) {
      const result = computePlanResult(state);
      const channels = computePlanSnapshot(state).channels;
      expect(result.groups.spend).toEqual(buildGroupSpendTotals(channels));
      expect(result.groups.utilization).toEqual(buildBudgetUtilization(channels, state.totalBudget));
      expect(result.groups.returnTrend).toEqual(
        buildRoasTrendData(channels, { churnRate: 0.04, cpaMultiplier: 1, roasMultiplier: 1 })
      );
    }
  });

  it('SettingsConsole: revenue-model month, only for iGaming', () => {
    for (const state of cases()) {
      const result = computePlanResult(state);
      if (industry !== 'igaming') {
        expect(result.revenueModelMonth).toBeNull();
        continue;
      }
      const channels = computePlanSnapshot(state).channels;
      const g = state.globalMultipliers;
      const old = calculateIgamingRevenueMonth(
        {
          ftds: channels.reduce((s, c) => s + c.metrics.conversions, 0),
          marketingCost: channels.reduce((s, c) => s + c.metrics.spend, 0),
        },
        0,
        normalizeIgamingRevenueInputs(g, g.playerValue)
      );
      expect(result.revenueModelMonth).toEqual(old);
    }
  });
});

describe('fixed-tier spend vs fixedSpend', () => {
  it('differs when a flat-fee channel sits outside the fixed tier (kept as-is: the slider floor ignores it)', () => {
    const state = loadPlan('ecommerce', 40000);
    const target = state.channels.find((c) => c.tier !== 'fixed' && c.isActive !== false)!;
    const channels = state.channels.map((c) =>
      c.id === target.id ? { ...c, buyingModel: 'FLAT_FEE' as const, typeConfig: { ...c.typeConfig, price: 1234 } } : c
    );
    const result = computePlanResult({ ...state, channels });
    expect(result.totals.fixedSpend - result.totals.fixedTierSpend).toBe(1234);
  });
});
