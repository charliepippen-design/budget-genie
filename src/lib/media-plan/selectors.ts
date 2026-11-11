import {
  calculateIgamingRevenueMonth,
  isIgamingVertical,
  normalizeIgamingRevenueInputs,
} from '@/lib/igaming-revenue-model';
import type { Vertical } from '@/lib/vertical-presets';
import type { ChannelWithMetrics, FtdVelocityMetrics, GlobalMultipliers } from './types';
import type { MarketSplit, MediaPlanData } from './state';

/**
 * What the dashboard shows for "where is the money going". Countries outside the
 * iGaming geo list are folded into tiers (activeGeos stays empty), so the brief
 * is the source for the market names.
 */
export function selectMarketSplit(
  state: Pick<MediaPlanData, 'brief' | 'activeGeos' | 'activeTiers'>
): MarketSplit {
  const fromBrief = state.brief?.markets ?? [];
  return {
    markets: fromBrief.length > 0 ? [...fromBrief] : [...state.activeGeos],
    tiers: { ...state.activeTiers },
  };
}

/** Funnel from impressions to FTDs and NGR for the active channels. */
export function computeFtdVelocity(
  channelsWithMetrics: ChannelWithMetrics[],
  vertical: Vertical | null,
  globalMultipliers: GlobalMultipliers
): FtdVelocityMetrics {
  // Locking a channel freezes its budget; it still delivers conversions.
  const unlocked = channelsWithMetrics.filter((ch) => ch.isActive);

  const totalImpressions = unlocked.reduce((sum, ch) => sum + ch.metrics.impressions, 0);
  const rawClicks = unlocked.reduce((sum, ch) => sum + ch.metrics.clicks, 0);
  const qualityClicks = rawClicks * 0.9;
  const ftds = unlocked.reduce((sum, ch) => sum + ch.metrics.conversions, 0);

  // Registration-to-conversion rate by vertical
  const regToConvRates: Record<string, number> = {
    igaming: globalMultipliers.regToFtdCvr,
    ecommerce: 0.12,
    saas: 0.35,
    lead_gen: 0.25,
    other: 0.3,
  };
  const registrationToFtdRate = regToConvRates[vertical ?? 'other'] ?? 0.3;
  const registrations = ftds > 0 ? ftds / registrationToFtdRate : 0;

  const projectedRevenue = unlocked.reduce((sum, ch) => sum + ch.metrics.revenue, 0);
  const igamingInputs = normalizeIgamingRevenueInputs(globalMultipliers, globalMultipliers.playerValue);
  const waterfall = isIgamingVertical(vertical)
    ? calculateIgamingRevenueMonth({ ftds, marketingCost: 0 }, 0, igamingInputs)
    : null;
  const ngr = waterfall?.ngr ?? projectedRevenue;

  const impressionToClickRate = totalImpressions > 0 ? qualityClicks / totalImpressions : 0;
  const clickToRegistrationRate = qualityClicks > 0 ? registrations / qualityClicks : 0;
  const ngrPerFtd = ftds > 0 ? ngr / ftds : 0;

  return {
    totalImpressions,
    qualityClicks,
    registrations,
    ftds,
    ngr,
    impressionToClickRate,
    clickToRegistrationRate,
    registrationToFtdRate,
    ngrPerFtd,
  };
}
