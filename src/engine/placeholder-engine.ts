// Placeholder engine: today's heuristics behind the engine port. The numbers are illustrative
// planning estimates, not a statistical model; the real engine replaces this through setEngine().

import { computePlanSnapshot, getSpendSharePct } from '@/lib/media-plan/plan-snapshot';
import type { BlendedMetrics, ChannelWithMetrics, GlobalMultipliers } from '@/lib/media-plan/types';
import { calculateIgamingRevenueMonth, normalizeIgamingRevenueInputs } from '@/lib/igaming-revenue-model';
import { computePlanEconomics } from '@/lib/plan-economics';
import { roasPairFromEconomics } from '@/lib/roas-pair';
import { buildLtvCurve, buildPlanScenarios, DEFAULT_CHURN_RATE } from '@/lib/ltv-model';
import {
  buildBudgetUtilization,
  buildGroupSpendTotals,
  buildRoasTrendData,
  getEfficiencyAlerts,
  getMetricIntegrityIssues,
} from '@/lib/planning-insights';
import type { EngineChannelInsight, EngineInput, EngineResult, PlanEngine } from './contract';

/** Churn used by the dashboard's return-by-group trend (the value model uses DEFAULT_CHURN_RATE). */
const RETURN_TREND_CHURN = 0.04;

function paybackMonths(channel: ChannelWithMetrics, a: GlobalMultipliers): number | null {
  const netValuePerCustomer = a.playerValue * a.turnoverRate * a.margin * (1 - a.bonusRate);
  if (!channel.metrics.cpa || channel.metrics.cpa <= 0 || netValuePerCustomer <= 0 || a.retentionRate <= 0) {
    return null;
  }
  return channel.metrics.cpa / (netValuePerCustomer * a.retentionRate);
}

function channelInsight(
  channel: ChannelWithMetrics,
  blended: BlendedMetrics,
  assumptions: GlobalMultipliers
): EngineChannelInsight {
  const ceiling = channel.typeConfig.baselineMetrics.saturationCeiling ?? 0;
  return {
    spendSharePct: getSpendSharePct(channel, blended),
    paybackMonths: paybackMonths(channel, assumptions),
    nearSaturation: channel.isActive && ceiling > 0 && channel.metrics.spend > ceiling * 0.9,
    saturationPct: ceiling > 0 ? Math.min(100, Math.round((channel.metrics.spend / ceiling) * 100)) : null,
  };
}

function compute(input: EngineInput): EngineResult {
  const snapshot = computePlanSnapshot({
    totalBudget: input.budget,
    channels: input.channels,
    globalMultipliers: input.assumptions,
    activeTiers: input.markets.tiers,
    activeGeos: input.markets.geos,
    geoOverrides: input.markets.overrides,
  });
  const { blended } = snapshot;

  const economics = computePlanEconomics(blended, input.industry, input.assumptions);

  const aggregate = {
    totalSpend: blended.totalSpend,
    totalConversions: blended.totalConversions,
    blendedCpa: blended.blendedCpa,
    blendedRoas: blended.blendedRoas,
  };
  const valueModel = {
    playerValue: input.assumptions.playerValue,
    blendedRoas: blended.blendedRoas,
    churnRate: DEFAULT_CHURN_RATE,
    observedLtv: input.observedValue,
  };
  const curve = buildLtvCurve(aggregate, valueModel);
  const month12 = curve.points[11];

  const channels = snapshot.channels;
  const channelInsights: Record<string, EngineChannelInsight> = {};
  channels.forEach((c) => {
    channelInsights[c.id] = channelInsight(c, blended, input.assumptions);
  });
  const belowBreakEven = channels.filter((c) => c.isActive && c.metrics.roas < 1 && c.metrics.spend > 0);
  const fixedTierSpend = input.channels
    .filter((c) => c.isActive !== false && c.tier === 'fixed')
    .reduce((sum, c) => sum + (c.typeConfig.price || 0), 0);

  return {
    engine: { id: placeholderEngine.id, version: placeholderEngine.version },
    channels,
    totals: {
      ...blended,
      fixedSpend: snapshot.fixedSpend,
      overBudget: snapshot.overBudget,
      overBudgetBy: snapshot.overBudgetBy,
      unallocated: Math.max(0, input.budget - blended.totalSpend),
      fixedTierSpend,
      spendShareTotalPct: channels.reduce((sum, c) => sum + channelInsights[c.id].spendSharePct, 0),
    },
    economics,
    roas: roasPairFromEconomics(economics, blended.blendedRoas),
    customerValue: {
      curve: curve.points,
      paybackMonth: curve.paybackMonth,
      valuePerCustomer12m: month12?.cumulativeLtvPerUser ?? 0,
      ltvToCac12m: month12?.ltvToCac ?? null,
    },
    scenarios: buildPlanScenarios(aggregate, valueModel),
    alerts: {
      efficiency: getEfficiencyAlerts(channels),
      integrity: getMetricIntegrityIssues(channels),
      belowBreakEven: belowBreakEven.map((c) => c.id),
      wastedSpend: belowBreakEven.reduce((sum, c) => sum + c.metrics.spend, 0),
      weakestChannelId: belowBreakEven[0]?.id ?? null,
      nearSaturation: channels.filter((c) => channelInsights[c.id].nearSaturation).map((c) => c.id),
    },
    channelInsights,
    groups: {
      spend: buildGroupSpendTotals(channels),
      utilization: buildBudgetUtilization(channels, input.budget),
      returnTrend: buildRoasTrendData(channels, {
        churnRate: RETURN_TREND_CHURN,
        cpaMultiplier: 1,
        roasMultiplier: 1,
      }),
    },
    revenueModelMonth:
      input.industry === 'igaming'
        ? calculateIgamingRevenueMonth(
            {
              ftds: channels.reduce((sum, c) => sum + c.metrics.conversions, 0),
              marketingCost: channels.reduce((sum, c) => sum + c.metrics.spend, 0),
            },
            0,
            normalizeIgamingRevenueInputs(input.assumptions, input.assumptions.playerValue)
          )
        : null,
  };
}

export const placeholderEngine: PlanEngine = {
  id: 'placeholder',
  version: '0.1.0',
  compute,
};
