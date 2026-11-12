// The plan as the response-curve engine sees it: each channel's spend, curve, expected
// conversions and value, plus the value-over-time curve and how uncertain everything is.
// `compute`, `computeTimeline`, `computeWhatIf` and the optimiser all start from here.

import { TIER1_REFERENCE } from '@/lib/geo-market-data';
import { getGeoMarketProfile } from '@/lib/media-plan/channel-metrics';
import { computePoolAwareSpend, isFixedCostChannel } from '@/lib/media-plan/plan-snapshot';
import type { ChannelData, GlobalMultipliers } from '@/lib/media-plan/types';
import type { EngineInput, EngineRange, EngineRangeSet } from '../contract';
import { efficiencyLogSd } from './evidence';
import { CROSS_FAMILY_CORRELATION, SAME_FAMILY_CORRELATION } from './priors';
import {
  channelCurve,
  channelEconomics,
  conversionsAt,
  type ChannelCurve,
  type ChannelEconomics,
  type CurveContext,
} from './response-curve';
import { finiteOr, lognormalRange, reciprocalRange, scaleRange } from './stats';
import { buildValueCurve, type ValueCurve } from './value-curve';

export interface ChannelModel {
  channel: ChannelData;
  active: boolean;
  /** Spend is the channel's fee, not a share of the variable budget. */
  fixed: boolean;
  spend: number;
  economics: ChannelEconomics;
  curve: ChannelCurve;
  /** Expected (median) conversions at `spend`. */
  conversions: number;
  /** Lifetime value of one conversion after calibration to observed value. */
  valuePerConversion: number;
  /** Lifetime value of the conversions. */
  revenue: number;
  /** Standard deviation of log(conversions): the channel's efficiency prior. */
  logSd: number;
}

export interface PlanModel {
  channels: ChannelModel[];
  context: CurveContext;
  assumptions: GlobalMultipliers;
  fixedSpend: number;
  /** Budget left for share-based channels after fixed fees. */
  variablePool: number;
  totalSpend: number;
  totalConversions: number;
  totalRevenue: number;
  value: ValueCurve;
  /** Standard deviation of log(plan conversions). */
  conversionsLogSd: number;
  /** Standard deviation of log(plan lifetime value): conversions and value per customer together. */
  revenueLogSd: number;
}

/** Sanitised plan-wide assumptions: non-finite figures fall back to neutral values. */
function safeAssumptions(assumptions: GlobalMultipliers): GlobalMultipliers {
  return {
    ...assumptions,
    spendMultiplier: Math.max(0, finiteOr(assumptions?.spendMultiplier, 1)),
    ctrBump: finiteOr(assumptions?.ctrBump, 0),
    playerValue: Math.max(0, finiteOr(assumptions?.playerValue, 0)),
  };
}

export function marketContext(input: EngineInput): CurveContext {
  const geo = getGeoMarketProfile(input.markets.tiers, input.markets.geos, input.markets.overrides);
  return {
    assumptions: safeAssumptions(input.assumptions),
    costIndex: geo.blendedCpa > 0 ? geo.blendedCpa / TIER1_REFERENCE.cpa : 1,
    valueIndex: geo.blendedLtv > 0 ? geo.blendedLtv / TIER1_REFERENCE.ltv : 1,
  };
}

/** Correlation of two channels' efficiency errors (see priors/correlation.ts). */
function correlation(a: ChannelData, b: ChannelData): number {
  return a.family === b.family ? SAME_FAMILY_CORRELATION : CROSS_FAMILY_CORRELATION;
}

/**
 * Standard deviation of log(sum of the channels' amounts), by first-order propagation: each
 * channel's amount is its median times a log-normal error, so
 *   var(log total) ~= sum_i sum_j w_i w_j rho_ij sd_i sd_j,   w_i = amount_i / total.
 */
export function pooledLogSd(parts: Array<{ channel: ChannelData; amount: number; logSd: number }>): number {
  const live = parts.filter((part) => part.amount > 0);
  const total = live.reduce((sumSoFar, part) => sumSoFar + part.amount, 0);
  if (!(total > 0)) return 0;
  let variance = 0;
  for (let i = 0; i < live.length; i += 1) {
    const wi = (live[i].amount / total) * live[i].logSd;
    variance += wi * wi;
    for (let j = i + 1; j < live.length; j += 1) {
      variance += 2 * wi * (live[j].amount / total) * live[j].logSd * correlation(live[i].channel, live[j].channel);
    }
  }
  return Math.sqrt(Math.max(0, variance));
}

export function buildPlanModel(input: EngineInput, stress?: { churnSpeed: number; shape: number }): PlanModel {
  const context = marketContext(input);
  const { assumptions } = context;
  const safeChannels = Array.isArray(input.channels) ? input.channels : [];
  const budget = Math.max(0, finiteOr(input.budget, 0));

  // Spend follows the plan's own rules (shared with the placeholder): fixed-fee channels cost
  // their fee, the rest of the budget is split by share across the active variable channels.
  const fixedSpend = safeChannels
    .filter((c) => c.isActive !== false && isFixedCostChannel(c))
    .reduce((total, c) => total + Math.max(0, finiteOr(c.typeConfig?.price, 0)), 0);
  const variablePool = Math.max(0, budget - fixedSpend);
  const variableShareTotal = safeChannels
    .filter((c) => c.isActive !== false && !isFixedCostChannel(c))
    .reduce((total, c) => total + Math.max(0, finiteOr(c.allocationPct, 0)), 0);

  const draft = safeChannels.map((channel) => {
    const active = channel.isActive !== false;
    const economics = channelEconomics(channel, context);
    const curve = channelCurve(channel, economics, context);
    const spend = active
      ? Math.max(0, finiteOr(computePoolAwareSpend(channel, variablePool, variableShareTotal, assumptions), 0))
      : 0;
    return {
      channel,
      active,
      fixed: isFixedCostChannel(channel),
      spend,
      economics,
      curve,
      conversions: active ? conversionsAt(curve, spend) : 0,
      logSd: efficiencyLogSd(channel),
    };
  });

  const statedConversions = draft.reduce((total, c) => total + c.conversions, 0);
  const statedValue = draft.reduce((total, c) => total + c.conversions * c.economics.valuePerConversion, 0);
  const value = buildValueCurve({
    industry: input.industry,
    assumptions,
    observed: input.observedValue,
    statedValuePerCustomer: statedConversions > 0 ? statedValue / statedConversions : 0,
    stress,
  });

  const channels: ChannelModel[] = draft.map((c) => {
    const valuePerConversion = c.economics.valuePerConversion * value.valueFactor;
    return { ...c, valuePerConversion, revenue: c.conversions * valuePerConversion };
  });

  const conversionsLogSd = pooledLogSd(channels.map((c) => ({ channel: c.channel, amount: c.conversions, logSd: c.logSd })));
  const revenueConversionsLogSd = pooledLogSd(channels.map((c) => ({ channel: c.channel, amount: c.revenue, logSd: c.logSd })));

  return {
    channels,
    context,
    assumptions,
    fixedSpend,
    variablePool,
    totalSpend: channels.reduce((total, c) => total + c.spend, 0),
    totalConversions: channels.reduce((total, c) => total + c.conversions, 0),
    totalRevenue: channels.reduce((total, c) => total + c.revenue, 0),
    value,
    conversionsLogSd,
    // Value per customer is one plan-wide unknown, independent of the channels' efficiency.
    revenueLogSd: Math.hypot(revenueConversionsLogSd, value.valueLogSd),
  };
}

const ZERO: EngineRange = { p10: 0, p50: 0, p90: 0 };

/** Ranges of conversions, lifetime value, cost per conversion and return for one spend. */
export function rangeSet(
  spend: number,
  conversions: number,
  revenue: number,
  conversionsLogSd: number,
  revenueLogSd: number
): EngineRangeSet {
  const conversionRange = lognormalRange(conversions, conversionsLogSd);
  const revenueRange = lognormalRange(revenue, revenueLogSd);
  return {
    conversions: conversionRange,
    revenue: revenueRange,
    costPerConversion: spend > 0 ? reciprocalRange(spend, conversionRange) : null,
    roas: spend > 0 ? scaleRange(revenueRange, 1 / spend) : ZERO,
  };
}
