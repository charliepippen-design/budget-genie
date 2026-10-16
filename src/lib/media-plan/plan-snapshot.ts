import { CATEGORY_INFO } from '@/lib/mediaplan-data';
import { DEFAULT_IGAMING_REVENUE_INPUTS } from '@/lib/igaming-revenue-model';
import type { MediaPlanData } from './state';
import { calculateChannelMetricsWithGeo, getGeoMarketProfile } from './channel-metrics';
import type {
  ChannelData,
  GlobalMultipliers,
  ChannelWithMetrics,
  BlendedMetrics,
} from './types';

/**
 * Determines whether a channel uses a fixed-cost buying model whose spend is set
 * by `typeConfig.price` rather than by the percentage allocation pool.
 */
export function isFixedCostChannel(channel: ChannelData): boolean {
  return (
    channel.buyingModel === 'FLAT_FEE' ||
    channel.buyingModel === 'RETAINER' ||
    channel.tier === 'fixed'
  );
}

/**
 * Single source of truth for channel spend. Fixed-cost channels consume their
 * `typeConfig.price` directly; variable channels draw from the pool that remains
 * after all fixed costs are subtracted from the total budget.
 *
 * Variable channel allocationPcts are normalised within the variable cohort so
 * that the full variable pool is always consumed (no silent budget leakage when
 * fixed channels hold a portion of the 0–100% allocation space).
 *
 * The spendMultiplier is applied to variable channels only (fixed costs are
 * contractually fixed and should not be scaled by a global multiplier).
 *
 * @param variableAllocTotal  Sum of allocationPct across ALL active variable
 *   channels in the plan. Used to normalise this channel's share of the pool.
 *   Pass 0 to fall back to raw allocationPct / 100 (gives 0 spend if all
 *   variable channels are at 0%).
 */
export function computePoolAwareSpend(
  channel: ChannelData,
  variablePool: number,
  variableAllocTotal: number,
  multipliers: Pick<GlobalMultipliers, 'spendMultiplier'>
): number {
  if (channel.isActive === false) return 0;
  if (isFixedCostChannel(channel)) {
    return channel.typeConfig?.price || 0;
  }
  const safeAlloc = channel.allocationPct || 0;
  // Normalise within the variable cohort so 100% of the pool is always deployed.
  const normalisedShare = variableAllocTotal > 0 ? safeAlloc / variableAllocTotal : 0;
  return variablePool * normalisedShare * multipliers.spendMultiplier;
}

export const DEFAULT_MULTIPLIERS_FALLBACK: GlobalMultipliers = {
  spendMultiplier: 1,
  defaultCpmOverride: null,
  ctrBump: 0,
  cpaTarget: null,
  roasTarget: null,
  playerValue: 150,
  retentionRate: DEFAULT_IGAMING_REVENUE_INPUTS.retentionRate,
  regToFtdCvr: DEFAULT_IGAMING_REVENUE_INPUTS.regToFtdCvr,
  turnoverRate: DEFAULT_IGAMING_REVENUE_INPUTS.turnoverRate,
  margin: DEFAULT_IGAMING_REVENUE_INPUTS.margin,
  bonusRate: DEFAULT_IGAMING_REVENUE_INPUTS.bonusRate,
};

export type PlanInputs = Pick<
  MediaPlanData,
  'totalBudget' | 'channels' | 'globalMultipliers' | 'activeTiers' | 'activeGeos' | 'geoOverrides'
>;

export interface PlanSnapshot {
  channels: ChannelWithMetrics[];
  blended: BlendedMetrics;
  /** Sum of active fixed-fee prices (spent in full whatever the budget). */
  fixedSpend: number;
  /** True when fixed fees alone exceed the budget: the plan spends more than the user set. */
  overBudget: boolean;
  /** How far fixed fees exceed the budget (0 when within budget). */
  overBudgetBy: number;
}

/**
 * Pure plan computation: per-channel metrics and blended totals.
 * The dashboard hooks and the AI planner both read numbers from here.
 */
export function computePlanSnapshot(input: PlanInputs): PlanSnapshot {
  const mults = input.globalMultipliers || DEFAULT_MULTIPLIERS_FALLBACK;
  const { cpaTarget, roasTarget } = mults;
  const geoProfile = getGeoMarketProfile(input.activeTiers, input.activeGeos, input.geoOverrides);
  const safeChannels = Array.isArray(input.channels) ? input.channels : [];

  // Build the variable pool once: total budget minus all fixed-cost channel prices.
  const totalFixedSpend = safeChannels
    .filter((ch) => ch.isActive !== false && isFixedCostChannel(ch))
    .reduce((sum, ch) => sum + (ch.typeConfig?.price || 0), 0);
  const variablePool = Math.max(0, input.totalBudget - totalFixedSpend);
  // Sum of allocationPcts across active variable channels only, so the full pool is deployed.
  const variableAllocTotal = safeChannels
    .filter((ch) => ch.isActive !== false && !isFixedCostChannel(ch))
    .reduce((sum, ch) => sum + (ch.allocationPct || 0), 0);

  const blended: BlendedMetrics = {
    totalSpend: 0,
    totalImpressions: 0,
    totalClicks: 0,
    totalConversions: 0,
    blendedCpa: null,
    projectedRevenue: 0,
    blendedRoas: 0,
  };
  const channels = safeChannels.map((channel) => {
    const poolAwareSpend = computePoolAwareSpend(channel, variablePool, variableAllocTotal, mults);
    const metrics = calculateChannelMetricsWithGeo(
      channel,
      input.totalBudget,
      mults,
      poolAwareSpend,
      geoProfile
    );

    blended.totalSpend += metrics.spend;
    blended.totalImpressions += metrics.impressions;
    blended.totalClicks += metrics.clicks;
    blended.totalConversions += metrics.conversions;
    blended.projectedRevenue += metrics.revenue;

    return {
      ...channel,
      metrics,
      aboveCpaTarget: !!(cpaTarget && metrics.cpa && metrics.cpa > cpaTarget),
      belowRoasTarget: !!(roasTarget && metrics.roas < roasTarget),
    };
  });

  blended.blendedCpa = blended.totalConversions > 0 ? blended.totalSpend / blended.totalConversions : null;
  blended.blendedRoas = blended.totalSpend > 0 ? blended.projectedRevenue / blended.totalSpend : 0;
  const overBudgetBy = Math.max(0, totalFixedSpend - (input.totalBudget || 0));
  return {
    channels,
    blended,
    fixedSpend: totalFixedSpend,
    overBudget: overBudgetBy > 0,
    overBudgetBy,
  };
}

/**
 * A channel's share of total plan spend (0–100). This is the share shown in the table:
 * fixed-fee channels get their real share (their allocationPct is not what drives spend)
 * and inactive channels get 0.
 */
export function getSpendSharePct(channel: ChannelWithMetrics, blended: BlendedMetrics): number {
  return blended.totalSpend > 0 ? (channel.metrics.spend / blended.totalSpend) * 100 : 0;
}

export function computeCategoryTotals(
  snapshot: Pick<PlanSnapshot, 'channels' | 'blended'>
): Record<string, { spend: number; percentage: number }> {
  const totals: Record<string, { spend: number; percentage: number }> = {};

  Object.keys(CATEGORY_INFO).forEach((cat) => {
    totals[cat] = { spend: 0, percentage: 0 };
  });

  snapshot.channels.forEach((ch) => {
    totals[ch.category] ??= { spend: 0, percentage: 0 };
    totals[ch.category].spend += ch.metrics.spend;
    totals[ch.category].percentage += getSpendSharePct(ch, snapshot.blended);
  });

  return totals;
}
