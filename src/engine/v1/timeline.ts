// `computeTimeline`: the plan month by month on the response-curve model.
//
// Each month's spend is read off the channels' curves, scaled by the industry's seasonality for
// that calendar month and by the channel family's ramp-up since the first month. A month's
// conversions form a cohort whose lifetime value is earned over the following months along the
// retention curve, so the P&L recognises value when it is earned, not when the customer is won.

import { normalizeIgamingRevenueInputs } from '@/lib/igaming-revenue-model';
import type { ChannelData } from '@/lib/media-plan/types';
import { calculateDistribution, channelsFromPlanSnapshot } from '@/lib/multi-month/calc';
import type { EngineInput } from '../contract';
import { OPTIMISATION_PATTERNS, comparePlans, optimisationScore } from '../placeholder-timeline';
import type {
  TimelineChannel,
  TimelineInput,
  TimelineMonthInput,
  TimelineOptimisationCandidate,
  TimelinePlan,
  TimelineResult,
  TimelineSettings,
} from '../timeline';
import { ENGINE_REF, buildChannels, rangeAssumptions } from './compute';
import { efficiencyLogSd } from './evidence';
import { buildPlanModel, pooledLogSd, type PlanModel } from './model';
import {
  FLAT_SEASONALITY,
  OPERATING_COST_SHARE,
  RAMP_UP_BY_FAMILY,
  SEASONALITY_BY_INDUSTRY,
  defaultHalfSaturationSpend,
  type SeasonalityIndex,
} from './priors';
import { channelCurve, channelEconomics, conversionsAt, type ChannelCurve } from './response-curve';
import { finiteOr, lognormalRange } from './stats';

/** Calendar month (0 = January) of the timeline's first month; null when `startMonth` is not "YYYY-MM". */
function startCalendarMonth(startMonth: string): number | null {
  const match = /^\d{4}-(\d{1,2})$/.exec(startMonth ?? '');
  const month = match ? Number(match[1]) : NaN;
  return month >= 1 && month <= 12 ? month - 1 : null;
}

/** Share of a channel's steady-state effect delivered `monthIndex` months after the first month. */
export function rampUpFactor(family: ChannelData['family'], monthIndex: number): number {
  const prior = RAMP_UP_BY_FAMILY[family] ?? RAMP_UP_BY_FAMILY.paid_media;
  return prior.start + (1 - prior.start) * (1 - Math.exp(-Math.max(0, monthIndex) / prior.monthsToMature));
}

/** Demand of a calendar month relative to the average month, for the plan's industry. */
export function seasonalityFactor(industry: EngineInput['industry'], calendarMonth: number | null): number {
  if (calendarMonth === null) return 1;
  const index: SeasonalityIndex = SEASONALITY_BY_INDUSTRY[industry ?? 'other'] ?? FLAT_SEASONALITY;
  return index[((calendarMonth % 12) + 12) % 12] ?? 1;
}

interface MonthChannel {
  data: ChannelData;
  curve: ChannelCurve;
  valuePerConversion: number;
  /** Channels without a buying model that deliver a set volume: conversions whatever the spend. */
  fixedConversions: number | null;
  /** Return on spend for those channels (they have no value per conversion). */
  fixedRoas: number;
}

function monthChannel(ch: TimelineChannel, model: PlanModel, extraCtrBump: number): MonthChannel {
  const family = ch.family ?? ch.typeConfig?.family ?? 'paid_media';
  const data: ChannelData = {
    id: ch.channelId,
    name: ch.name,
    category: ch.category,
    allocationPct: ch.allocationPct,
    family,
    buyingModel: ch.buyingModel ?? ch.typeConfig?.buyingModel ?? 'CPM',
    typeConfig: ch.typeConfig ?? { family, buyingModel: 'CPM', price: ch.cpm, baselineMetrics: {} },
    tier: 'scalable',
    locked: ch.locked,
    isActive: true,
  };
  const context = { ...model.context, extraCtrBump };

  if (ch.typeConfig && (ch.buyingModel ?? ch.typeConfig.buyingModel)) {
    const economics = channelEconomics(data, context);
    return {
      data,
      curve: channelCurve(data, economics, context),
      valuePerConversion: economics.valuePerConversion * model.value.valueFactor,
      fixedConversions: null,
      fixedRoas: 0,
    };
  }

  // A month channel without the plan's configuration (the built-in defaults): its own CPM, CTR,
  // conversion rate and return define the curve, with the family's default saturation.
  const ctr = Math.max(0.01, finiteOr(ch.ctr, 0) + extraCtrBump) / 100;
  const cr = Math.max(0, finiteOr(ch.cr, 0)) / 100;
  const halfSaturation = Math.max(1, defaultHalfSaturationSpend(family) * model.context.costIndex);
  if (ch.impressionMode === 'FIXED') {
    return {
      data,
      curve: { slope: 0, halfSaturation },
      valuePerConversion: 0,
      fixedConversions: Math.max(0, finiteOr(ch.fixedImpressions, 0)) * ctr * cr,
      fixedRoas: Math.max(0, finiteOr(ch.roas, 0)),
    };
  }
  const slope = ch.cpm > 0 ? (1000 / ch.cpm) * ctr * cr : 0;
  return {
    data,
    curve: { slope, halfSaturation },
    valuePerConversion: slope > 0 ? Math.max(0, finiteOr(ch.roas, 0)) / slope : 0,
    fixedConversions: null,
    fixedRoas: 0,
  };
}

interface PlanDetail {
  plan: TimelinePlan;
  /** Period totals per channel, for the ranges. */
  byChannel: Map<string, { channel: ChannelData; conversions: number; revenue: number }>;
  /** Value earned in the period by its cohorts. */
  realisedValue: number;
}

function computePlan(
  months: TimelineMonthInput[],
  settings: TimelineSettings,
  input: EngineInput,
  model: PlanModel,
  firstCalendarMonth: number | null
): PlanDetail {
  const { value } = model;
  const isIgaming = input.industry === 'igaming';
  const rates = isIgaming ? normalizeIgamingRevenueInputs(input.assumptions, input.assumptions.playerValue) : null;
  const byChannel: PlanDetail['byChannel'] = new Map();
  const cohortConversions: number[] = [];
  const cohortValue: number[] = [];
  let cumulativeProfit = 0;
  let breakEvenMonth: number | null = null;
  let realisedValue = 0;

  const rows = months.map((month, idx) => {
    const spendMultiplier = month.spendMultiplier ?? settings.spendMultiplier;
    const actualBudget = month.budget * month.budgetMultiplier * spendMultiplier;
    const season = seasonalityFactor(input.industry, firstCalendarMonth === null ? null : firstCalendarMonth + idx);
    const ctrBump = finiteOr(month.ctrBump ?? settings.ctrBump, 0);

    let spend = 0;
    let conversions = 0;
    let revenue = 0;
    const channelSpend = month.channels.map((ch) => {
      const mc = monthChannel(ch, model, ctrBump);
      const channelSpendValue = Math.max(0, (finiteOr(ch.allocationPct, 0) / 100) * actualBudget) || 0;
      const lift = season * rampUpFactor(mc.data.family, idx);
      const channelConversions =
        (mc.fixedConversions !== null ? mc.fixedConversions : conversionsAt(mc.curve, channelSpendValue)) * lift;
      const channelRevenue =
        mc.fixedConversions !== null ? channelSpendValue * mc.fixedRoas * lift : channelConversions * mc.valuePerConversion;
      spend += channelSpendValue;
      conversions += channelConversions;
      revenue += channelRevenue;
      const entry = byChannel.get(ch.channelId) ?? { channel: mc.data, conversions: 0, revenue: 0 };
      entry.conversions += channelConversions;
      entry.revenue += channelRevenue;
      byChannel.set(ch.channelId, entry);
      return { channelId: ch.channelId, name: ch.name, spend: channelSpendValue };
    });

    cohortConversions.push(conversions);
    cohortValue.push(revenue);
    // Value earned this month by every cohort acquired so far, and the customers still active.
    let earned = 0;
    let active = 0;
    for (let j = 0; j <= idx; j += 1) {
      const age = idx - j;
      earned += cohortValue[j] * (value.monthlyShare[age] ?? 0);
      active += cohortConversions[j] * (value.survival[age] ?? 0);
    }
    realisedValue += earned;
    const operatingCosts = earned * OPERATING_COST_SHARE;
    const netProfit = earned - spend - operatingCosts;
    cumulativeProfit += netProfit;
    if (breakEvenMonth === null && cumulativeProfit >= 0) breakEvenMonth = idx;

    const ggr = rates && rates.bonusRate < 1 ? earned / (1 - rates.bonusRate) : earned;
    const revenueModel = rates
      ? {
          registrations: rates.regToFtdCvr > 0 ? conversions / rates.regToFtdCvr : 0,
          activePlayers: active,
          ggr,
          bonus: ggr - earned,
          ngr: earned,
          grossContribution: earned - spend,
        }
      : null;

    return {
      id: month.id,
      label: month.label,
      isSoftLaunch: month.isSoftLaunch,
      budget: month.budget,
      spend,
      conversions,
      revenue,
      operatingCosts,
      netProfit,
      cumulativeProfit,
      channelSpend,
      revenueModel,
      // As the plan-health chart reads it: contribution (already net of spend) against spend.
      contributionDelta: (revenueModel?.grossContribution ?? 0) - spend,
    };
  });

  const total = (pick: (row: (typeof rows)[number]) => number) => rows.reduce((sum, row) => sum + pick(row), 0);
  const allocatedBudget = total((row) => row.budget || 0);
  const totalSpend = total((row) => row.spend);
  const totalConversions = total((row) => row.conversions);
  const totalRevenue = total((row) => row.revenue);

  return {
    plan: {
      months: rows,
      totals: {
        allocatedBudget,
        spend: totalSpend,
        conversions: totalConversions,
        revenue: totalRevenue,
        netRevenue: total((row) => row.revenueModel?.ngr ?? 0),
        grossContribution: total((row) => row.revenueModel?.grossContribution ?? 0),
        operatingCosts: total((row) => row.operatingCosts),
        netProfit: total((row) => row.netProfit),
        avgMonthlyBudget: rows.length > 0 ? allocatedBudget / rows.length : 0,
        cpa: totalConversions > 0 ? totalSpend / totalConversions : null,
        roas: totalSpend > 0 ? totalRevenue / totalSpend : 0,
        breakEvenMonth,
        endingCumulativeProfit: rows.length > 0 ? rows[rows.length - 1].cumulativeProfit : 0,
      },
    },
    byChannel,
    realisedValue,
  };
}

export function computeTimeline(input: EngineInput, timeline: TimelineInput): TimelineResult {
  const model = buildPlanModel(input);
  const firstCalendarMonth = startCalendarMonth(timeline.startMonth);
  const run = (months: TimelineMonthInput[], settings: TimelineSettings) =>
    computePlan(months, settings, input, model, firstCalendarMonth);

  const active = run(timeline.months, timeline.settings);
  const scenarios: Record<string, TimelinePlan> = {};
  timeline.scenarios.forEach((scenario) => {
    scenarios[scenario.id] = run(scenario.months, scenario.settings).plan;
  });
  const comparisonId = timeline.comparisonScenarioId;
  const compared = comparisonId !== null ? scenarios[comparisonId] : undefined;

  const redistribute = timeline.redistribute ?? {
    totalBudget: timeline.months.reduce((sum, m) => sum + m.budget, 0),
    monthCount: timeline.months.length,
  };

  // Budget patterns shape the period budget; they are tried on this engine's curves, so a
  // pattern that spends more in strong months or after the ramp-up scores better.
  const baseTotal = timeline.settings.baseMonthlyBudget * timeline.months.length;
  const optimisation: TimelineOptimisationCandidate[] = OPTIMISATION_PATTERNS.map((pattern) => {
    const budgets = calculateDistribution(pattern, baseTotal, timeline.months.length, {
      growthRate: timeline.settings.growthRate,
    });
    const { totals } = run(
      timeline.months.map((m, idx) => ({ ...m, budget: budgets[idx] })),
      timeline.settings
    ).plan;
    const score = optimisationScore(timeline.optimisationGoal, totals);
    return {
      pattern,
      score,
      confidence: Math.min(95, 60 + score / 10),
      totals: {
        allocatedBudget: totals.allocatedBudget,
        spend: totals.spend,
        revenue: totals.revenue,
        netProfit: totals.netProfit,
        roas: totals.roas,
        cpa: totals.cpa,
        breakEvenMonth: totals.breakEvenMonth,
      },
    };
  }).sort((a, b) => b.score - a.score);

  // A channel's efficiency error is the same unknown every month, so months add up perfectly
  // correlated within a channel and the period's spread is pooled across channels only.
  const parts = [...active.byChannel.values()];
  const conversionsLogSd = pooledLogSd(
    parts.map((p) => ({ channel: p.channel, amount: p.conversions, logSd: efficiencyLogSd(p.channel) }))
  );
  const revenueLogSd = Math.hypot(
    pooledLogSd(parts.map((p) => ({ channel: p.channel, amount: p.revenue, logSd: efficiencyLogSd(p.channel) }))),
    model.value.valueLogSd
  );
  const totals = active.plan.totals;
  const realised = lognormalRange(active.realisedValue, revenueLogSd);
  const profitAt = (earned: number) => earned * (1 - OPERATING_COST_SHARE) - totals.spend;

  return {
    engine: { ...ENGINE_REF },
    plan: active.plan,
    scenarios,
    comparison: comparisonId !== null && compared ? comparePlans(comparisonId, active.plan, compared) : null,
    optimisation,
    patternBudgets: calculateDistribution(timeline.pattern, redistribute.totalBudget, redistribute.monthCount, {
      ...timeline.patternParams,
      growthRate: timeline.settings.growthRate,
    }),
    baseChannels: channelsFromPlanSnapshot(buildChannels(model)),
    ranges: {
      conversions: lognormalRange(totals.conversions, conversionsLogSd),
      revenue: lognormalRange(totals.revenue, revenueLogSd),
      netProfit: { p10: profitAt(realised.p10), p50: profitAt(realised.p50), p90: profitAt(realised.p90) },
      assumptions: [
        ...rangeAssumptions(model),
        'Months follow an industry seasonality assumption and a ramp-up assumption per channel family, counted from the first month of the timeline.',
        'The period profit counts value as it is earned along the retention curve; value earned after the last month is not in it.',
      ],
    },
  };
}
