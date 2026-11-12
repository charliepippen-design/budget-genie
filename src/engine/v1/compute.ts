// `compute`: the single-month plan as an EngineResult, from the plan model.

import { normalizeIgamingRevenueInputs, type IgamingRevenueMonthValues } from '@/lib/igaming-revenue-model';
import type { LtvCurvePoint } from '@/lib/ltv-model';
import type { ChannelWithMetrics } from '@/lib/media-plan/types';
import type { PlanEconomics } from '@/lib/plan-economics';
import {
  GROUP_LABELS,
  buildBudgetUtilization,
  buildGroupSpendTotals,
  getChannelGroup,
  getEfficiencyAlerts,
  getMetricIntegrityIssues,
  type ChannelGroup,
  type ScenarioEnvelopePoint,
} from '@/lib/planning-insights';
import type {
  EngineChannelInsight,
  EngineInput,
  EngineRange,
  EngineRanges,
  EngineRangeSet,
  EngineResult,
} from '../contract';
import { CROSS_FAMILY_CORRELATION, SAME_FAMILY_CORRELATION, VALUE_HORIZON_MONTHS } from './priors';
import { buildPlanModel, rangeSet, type PlanModel } from './model';
import { mediaDelivery } from './response-curve';
import { paybackMonth, paybackMonthsExact, paybackRange, type ValueCurve } from './value-curve';

export const ENGINE_ID = 'response-curve';
export const ENGINE_VERSION = '1.0.0';
export const ENGINE_REF = { id: ENGINE_ID, version: ENGINE_VERSION };

/** Rounds to `digits` decimals the way shares are shown in the AI planner (0 when not finite). */
const roundTo = (n: number, digits: number) => (Number.isFinite(n) ? Number(n.toFixed(digits)) : 0);

/** The statements shown next to the ranges. Kept short: the README has the full model. */
export function rangeAssumptions(model: PlanModel): string[] {
  return [
    'Prior-based estimate: no campaign data has been fitted. Ranges come from stated assumptions, not from measurement.',
    'P10 / P50 / P90: the engine puts a 10% / 50% / 90% chance on the real figure being below that value, if its assumptions hold.',
    'Each channel follows a diminishing-returns curve set by its price, funnel rates and saturation ceiling.',
    'A channel is more uncertain the less of its funnel the price covers (pay-per-conversion narrowest, fixed fees and CPM widest) and the less proven it is.',
    `Channels' errors are assumed correlated: ${SAME_FAMILY_CORRELATION} within a channel family, ${CROSS_FAMILY_CORRELATION} across families.`,
    model.value.isCalibrated
      ? 'Value per customer is calibrated to the value you observed; the observed points narrow its range.'
      : 'Value per customer is your stated lifetime value spread over time by an industry retention assumption; enter observed value to calibrate it.',
    `Lifetime value is counted over ${VALUE_HORIZON_MONTHS} months.`,
  ];
}

export function buildChannels(model: PlanModel): ChannelWithMetrics[] {
  const { cpaTarget, roasTarget } = model.assumptions;
  return model.channels.map((c) => {
    if (!c.active) {
      return {
        ...c.channel,
        metrics: {
          spend: 0,
          impressions: 0,
          clicks: 0,
          conversions: 0,
          cpa: 0,
          revenue: 0,
          roas: 0,
          effectivePrice: 0,
          effectiveCtr: 0,
          effectiveCr: 0,
        },
        aboveCpaTarget: false,
        belowRoasTarget: !!(roasTarget && 0 < roasTarget),
      };
    }
    const delivery = mediaDelivery(c.channel, c.economics, c.spend, c.conversions);
    const cpa = c.conversions > 0 ? c.spend / c.conversions : null;
    const roas = c.spend > 0 ? c.revenue / c.spend : 0;
    return {
      ...c.channel,
      metrics: {
        spend: c.spend,
        impressions: delivery.impressions,
        clicks: delivery.clicks,
        conversions: c.conversions,
        cpa,
        revenue: c.revenue,
        roas,
        effectivePrice: c.economics.price,
        effectiveCtr: c.economics.ctr,
        effectiveCr: c.channel.typeConfig?.baselineMetrics?.conversionRate || 0,
      },
      aboveCpaTarget: !!(cpaTarget && cpa && cpa > cpaTarget),
      belowRoasTarget: !!(roasTarget && roas < roasTarget),
    };
  });
}

export function buildEconomics(spend: number, conversions: number, revenue: number, value: ValueCurve): PlanEconomics {
  if (!(spend > 0) || !(conversions > 0) || !Number.isFinite(revenue)) {
    return {
      computable: false,
      monthlySpend: Number.isFinite(spend) ? Math.max(0, spend) : 0,
      blendedCpa: null,
      monthlyValue: 0,
      netValuePerMonth: 0,
      cohortValue: 0,
      netValueCohort: 0,
      breakEvenCpa: null,
      breakEvenCpaCohort: null,
      losesMoney: false,
      losesMoneyCohort: false,
    };
  }
  // Month 1 earns the first month's share of the cohort's lifetime value.
  const monthlyValue = revenue * value.monthlyShare[0];
  return {
    computable: true,
    monthlySpend: spend,
    blendedCpa: spend / conversions,
    monthlyValue,
    netValuePerMonth: monthlyValue - spend,
    cohortValue: revenue,
    netValueCohort: revenue - spend,
    breakEvenCpa: monthlyValue / conversions,
    breakEvenCpaCohort: revenue / conversions,
    losesMoney: monthlyValue - spend < 0,
    losesMoneyCohort: revenue - spend < 0,
  };
}

/** 12 monthly points of cumulative value per customer against the cost per conversion. */
export function buildValuePoints(
  value: ValueCurve,
  valuePerCustomer: number,
  conversions: number,
  spend: number,
  costPerConversion: number
): LtvCurvePoint[] {
  return Array.from({ length: 12 }, (_, idx) => {
    const cumulative = valuePerCustomer * value.cumulativeShare[idx];
    const cohortValue = cumulative * Math.max(0, conversions);
    return {
      month: idx + 1,
      label: `M${idx + 1}`,
      cumulativeLtvPerUser: cumulative,
      monthlyLtvPerUser: valuePerCustomer * value.monthlyShare[idx],
      cohortValue,
      netCohortValue: cohortValue - spend,
      ltvToCac: costPerConversion > 0 ? cumulative / costPerConversion : null,
      cpaLine: costPerConversion,
    };
  });
}

/** Bear / Base / Bull as the P10 / P50 / P90 of the cohort's lifetime value. */
export function buildScenarios(
  revenue: EngineRange,
  conversions: number,
  costPerConversion: number
): ScenarioEnvelopePoint[] {
  const point = (scenario: ScenarioEnvelopePoint['scenario'], cohortValue: number): ScenarioEnvelopePoint => {
    const perUser = conversions > 0 ? cohortValue / conversions : 0;
    return {
      scenario,
      projectedLtvPerUser: perUser,
      projectedCohortValue: cohortValue,
      ltvToCac: costPerConversion > 0 ? perUser / costPerConversion : null,
    };
  };
  return [point('Bear', revenue.p10), point('Base', revenue.p50), point('Bull', revenue.p90)];
}

/** Return realised by each channel group after 1..`months` months: cumulative value earned / spend. */
function returnTrend(
  channels: ChannelWithMetrics[],
  value: ValueCurve,
  months: number
): Array<Record<string, number | string>> {
  const groups = Object.keys(GROUP_LABELS) as ChannelGroup[];
  const totals = groups.map((group) => {
    const members = channels.filter((c) => getChannelGroup(c) === group);
    return {
      label: GROUP_LABELS[group],
      spend: members.reduce((total, c) => total + c.metrics.spend, 0),
      revenue: members.reduce((total, c) => total + c.metrics.revenue, 0),
    };
  });
  return Array.from({ length: months }, (_, idx) => {
    const point: Record<string, number | string> = { month: `M${idx + 1}` };
    totals.forEach((group) => {
      point[group.label] = group.spend > 0 ? (group.revenue * value.cumulativeShare[idx]) / group.spend : 0;
    });
    return point;
  });
}

function revenueModelMonth(input: EngineInput, economics: PlanEconomics, conversions: number): IgamingRevenueMonthValues | null {
  if (input.industry !== 'igaming') return null;
  // Value per conversion is net revenue, so the waterfall is read backwards from it: gross
  // revenue is net revenue before the bonus share, registrations follow from the funnel rate.
  const rates = normalizeIgamingRevenueInputs(input.assumptions, input.assumptions.playerValue);
  const ngr = economics.monthlyValue;
  const ggr = rates.bonusRate < 1 ? ngr / (1 - rates.bonusRate) : ngr;
  return {
    registrations: rates.regToFtdCvr > 0 ? conversions / rates.regToFtdCvr : 0,
    activePlayers: conversions,
    ggr,
    bonus: ggr - ngr,
    ngr,
    grossContribution: ngr - economics.monthlySpend,
    ngrPerPlayer: conversions > 0 ? ngr / conversions : 0,
  };
}

const EMPTY_RANGES: EngineRangeSet = {
  conversions: { p10: 0, p50: 0, p90: 0 },
  revenue: { p10: 0, p50: 0, p90: 0 },
  costPerConversion: null,
  roas: { p10: 0, p50: 0, p90: 0 },
};

export function buildRanges(model: PlanModel): EngineRanges {
  const channels: Record<string, EngineRangeSet> = {};
  model.channels.forEach((c) => {
    channels[c.channel.id] = c.active
      ? rangeSet(c.spend, c.conversions, c.revenue, c.logSd, Math.hypot(c.logSd, model.value.valueLogSd))
      : EMPTY_RANGES;
  });
  const { totalSpend, totalConversions, totalRevenue } = model;
  return {
    totals: rangeSet(totalSpend, totalConversions, totalRevenue, model.conversionsLogSd, model.revenueLogSd),
    channels,
    paybackMonth: paybackRange(
      model.value,
      totalConversions > 0 ? totalRevenue / totalConversions : 0,
      totalConversions > 0 ? totalSpend / totalConversions : null,
      model.revenueLogSd
    ),
    assumptions: rangeAssumptions(model),
  };
}

export function compute(input: EngineInput): EngineResult {
  const model = buildPlanModel(input);
  const channels = buildChannels(model);
  const { totalSpend, totalConversions, totalRevenue, value } = model;
  const budget = Number.isFinite(input.budget) ? input.budget : 0;
  const blendedCpa = totalConversions > 0 ? totalSpend / totalConversions : null;
  const blendedRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
  const valuePerCustomer = totalConversions > 0 ? totalRevenue / totalConversions : 0;

  const economics = buildEconomics(totalSpend, totalConversions, totalRevenue, value);
  const ranges = buildRanges(model);
  const points = buildValuePoints(value, valuePerCustomer, totalConversions, totalSpend, blendedCpa ?? 0);

  const channelInsights: Record<string, EngineChannelInsight> = {};
  model.channels.forEach((c, idx) => {
    const metrics = channels[idx].metrics;
    const ceiling = c.curve.halfSaturation;
    channelInsights[c.channel.id] = {
      spendSharePct: totalSpend > 0 ? (metrics.spend / totalSpend) * 100 : 0,
      paybackMonths: paybackMonthsExact(value, c.valuePerConversion, c.active ? metrics.cpa : null),
      nearSaturation: c.active && metrics.spend > ceiling * 0.9,
      saturationPct: Math.min(100, Math.round((metrics.spend / ceiling) * 100)),
      budgetSharePct: (metrics.spend / (budget || 1)) * 100,
    };
  });

  const spending = channels.filter((c) => c.isActive && c.metrics.spend > 0);
  const belowBreakEven = spending.filter((c) => c.metrics.roas < 1);
  const overBudgetBy = Math.max(0, model.fixedSpend - budget);

  return {
    engine: { ...ENGINE_REF },
    channels,
    totals: {
      totalSpend,
      totalImpressions: channels.reduce((total, c) => total + c.metrics.impressions, 0),
      totalClicks: channels.reduce((total, c) => total + c.metrics.clicks, 0),
      totalConversions,
      blendedCpa,
      projectedRevenue: totalRevenue,
      blendedRoas,
      fixedSpend: model.fixedSpend,
      overBudget: overBudgetBy > 0,
      overBudgetBy,
      unallocated: Math.max(0, budget - totalSpend),
      fixedTierSpend: model.channels
        .filter((c) => c.active && c.channel.tier === 'fixed')
        .reduce((total, c) => total + (c.channel.typeConfig?.price || 0), 0),
      spendShareTotalPct: channels.reduce((total, c) => total + channelInsights[c.id].spendSharePct, 0),
      fixedBudgetSharePct: model.channels
        .filter((c) => c.active && c.fixed)
        .reduce((total, c) => total + ((c.channel.typeConfig?.price || 0) / (budget || 1)) * 100, 0),
      budgetShareTotalPct:
        Math.round(
          channels
            .filter((c) => c.isActive !== false && roundTo(c.metrics.spend, 0) > 0)
            .reduce((total, c) => total + roundTo(channelInsights[c.id].budgetSharePct, 1), 0) * 10
        ) / 10,
    },
    economics,
    roas: {
      lifetime: blendedRoas,
      month1: economics.computable && economics.monthlySpend > 0 ? economics.monthlyValue / economics.monthlySpend : null,
    },
    customerValue: {
      curve: points,
      paybackMonth: paybackMonth(value, valuePerCustomer, blendedCpa, 12),
      valuePerCustomer12m: points[11].cumulativeLtvPerUser,
      ltvToCac12m: points[11].ltvToCac,
    },
    scenarios: buildScenarios(ranges.totals.revenue, totalConversions, blendedCpa ?? 0),
    alerts: {
      efficiency: getEfficiencyAlerts(channels),
      integrity: getMetricIntegrityIssues(channels),
      belowBreakEven: belowBreakEven.map((c) => c.id),
      wastedSpend: belowBreakEven.reduce((total, c) => total + c.metrics.spend, 0),
      weakestChannelId: belowBreakEven[0]?.id ?? null,
      nearSaturation: channels.filter((c) => channelInsights[c.id].nearSaturation).map((c) => c.id),
      efficiencyActive: getEfficiencyAlerts(spending),
    },
    channelInsights,
    groups: {
      spend: buildGroupSpendTotals(channels),
      utilization: buildBudgetUtilization(channels, budget),
      returnTrend: returnTrend(channels, value, 6),
      reportReturnTrend: returnTrend(spending, value, 6),
    },
    revenueModelMonth: revenueModelMonth(input, economics, totalConversions),
    strongestChannelId: [...spending].sort((a, b) => b.metrics.roas - a.metrics.roas)[0]?.id ?? null,
    ranges,
  };
}
