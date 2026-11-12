// Channel response curves: conversions as a concave, saturating function of spend.
//
//   conversions(s) = slope * s / (1 + s / halfSaturation)        (Michaelis-Menten)
//
// `slope` is the conversions bought per unit of spend when the channel is empty; it comes from
// the channel's buying model, price and funnel rates. `halfSaturation` is the spend at which
// each unit buys half as much, the channel's `saturationCeiling`. Both are the user's inputs, so
// editing a price, a rate or a ceiling moves the curve.

import type { ChannelData, GlobalMultipliers } from '@/lib/media-plan/types';
import { defaultHalfSaturationSpend } from './priors';
import { finiteOr } from './stats';

export interface ChannelCurve {
  /** Conversions per unit of spend at zero spend (0 when the channel cannot convert). */
  slope: number;
  /** Spend at which efficiency is half of `slope` (always positive). */
  halfSaturation: number;
}

export interface CurveContext {
  assumptions: GlobalMultipliers;
  /** Media cost of the plan's markets relative to Tier 1 (1 = Tier 1). */
  costIndex: number;
  /** Customer value of the plan's markets relative to Tier 1. */
  valueIndex: number;
  /** Extra CTR points on top of `assumptions.ctrBump` (the timeline's per-month bump). */
  extraCtrBump?: number;
}

/** A channel's price, rates and value after plan-wide adjustments and market indices. */
export interface ChannelEconomics {
  /** Price in the channel's buying-model unit (CPM, CPC, CPA, fee) after market and override. */
  price: number;
  /** Click-through rate in %. */
  ctr: number;
  /** Click -> conversion rate in %. */
  conversionRate: number;
  /** Lifetime value of one conversion, before any calibration to observed value. */
  valuePerConversion: number;
}

const MARKET_PRICED = new Set(['CPM', 'CPC', 'CPA', 'HYBRID']);

/** Same adjustments the placeholder applies, so both engines read a channel's inputs the same way. */
export function channelEconomics(channel: ChannelData, ctx: CurveContext): ChannelEconomics {
  const config = channel.typeConfig;
  const base = config?.baselineMetrics ?? {};
  const ctr = Math.max(0.01, finiteOr(base.ctr, 1) + finiteOr(ctx.assumptions.ctrBump, 0) + (ctx.extraCtrBump ?? 0));
  const conversionRate = Math.max(0, finiteOr(base.conversionRate, 2.5));
  let price = Math.max(0, finiteOr(config?.price, 0));
  const cpmOverride = channel.buyingModel === 'CPM' ? ctx.assumptions.defaultCpmOverride : null;
  if (cpmOverride && cpmOverride > 0) price = cpmOverride;
  else if (MARKET_PRICED.has(channel.buyingModel)) price *= ctx.costIndex;
  const statedValue = finiteOr(base.aov, finiteOr(ctx.assumptions.playerValue, 0));
  return { price, ctr, conversionRate, valuePerConversion: Math.max(0, statedValue * ctx.valueIndex) };
}

/** Conversions per unit of spend before saturation, by buying model. */
function initialSlope(channel: ChannelData, eco: ChannelEconomics): number {
  const { price, ctr, conversionRate } = eco;
  const sharePct = Math.max(0, finiteOr(channel.typeConfig?.secondaryPrice, 0));
  switch (channel.buyingModel) {
    case 'CPM':
      // Spend buys impressions; a share click, a share of those convert.
      return price > 0 ? (1000 / price) * (ctr / 100) * (conversionRate / 100) : 0;
    case 'CPC':
      return price > 0 ? conversionRate / 100 / price : 0;
    case 'CPA':
      return price > 0 ? 1 / price : 0;
    case 'REV_SHARE': {
      // The partner is paid a share of the customer's value: that share is the cost per conversion.
      const cost = eco.valuePerConversion * (sharePct / 100);
      return cost > 0 ? 1 / cost : 0;
    }
    case 'HYBRID': {
      const cost = price + eco.valuePerConversion * (sharePct / 100);
      return cost > 0 ? 1 / cost : 0;
    }
    case 'FLAT_FEE':
    case 'RETAINER': {
      // The fee buys `trafficPerUnit` visits; the curve passes through that point before saturation.
      const traffic = Math.max(0, finiteOr(channel.typeConfig?.baselineMetrics?.trafficPerUnit, 0));
      return price > 0 ? (traffic * (conversionRate / 100)) / price : 0;
    }
    default:
      return 0;
  }
}

export function channelCurve(channel: ChannelData, eco: ChannelEconomics, ctx: CurveContext): ChannelCurve {
  const ceiling = finiteOr(channel.typeConfig?.baselineMetrics?.saturationCeiling, 0);
  const halfSaturation =
    ceiling > 0 ? ceiling : Math.max(1, defaultHalfSaturationSpend(channel.family) * (ctx.costIndex > 0 ? ctx.costIndex : 1));
  const slope = initialSlope(channel, eco);
  return { slope: Number.isFinite(slope) && slope > 0 ? slope : 0, halfSaturation };
}

/** Expected conversions at a spend. Zero at zero spend, increasing, concave, bounded by slope * halfSaturation. */
export function conversionsAt(curve: ChannelCurve, spend: number): number {
  if (!(spend > 0) || curve.slope <= 0) return 0;
  return (curve.slope * spend) / (1 + spend / curve.halfSaturation);
}

/** Conversions bought by the next unit of spend: positive and strictly decreasing in spend. */
export function marginalConversionsAt(curve: ChannelCurve, spend: number): number {
  const ratio = 1 + Math.max(0, spend) / curve.halfSaturation;
  return curve.slope / (ratio * ratio);
}

/** Impressions and clicks a spend delivers (reference figures; conversions come from the curve). */
export function mediaDelivery(
  channel: ChannelData,
  eco: ChannelEconomics,
  spend: number,
  conversions: number
): { impressions: number; clicks: number } {
  const { price, ctr, conversionRate } = eco;
  switch (channel.buyingModel) {
    case 'CPM': {
      const impressions = price > 0 ? (spend / price) * 1000 : 0;
      return { impressions, clicks: impressions * (ctr / 100) };
    }
    case 'CPC': {
      const clicks = price > 0 ? spend / price : 0;
      const ratio = finiteOr(channel.typeConfig?.baselineMetrics?.cpcImpressionRatio, 0);
      return { impressions: ratio > 0 ? clicks * ratio : clicks / (ctr / 100), clicks };
    }
    case 'CPA': {
      // Back-calculated from the conversions delivered, for reference.
      const clicks = conversionRate > 0 ? conversions / (conversionRate / 100) : 0;
      return { impressions: clicks / (ctr / 100), clicks };
    }
    case 'FLAT_FEE':
    case 'RETAINER':
      return {
        impressions: 0,
        clicks: spend > 0 ? Math.max(0, finiteOr(channel.typeConfig?.baselineMetrics?.trafficPerUnit, 0)) : 0,
      };
    default:
      return { impressions: 0, clicks: 0 };
  }
}
