import { calculateUnifiedMetrics, ChannelTypeConfig } from '@/types/channel';
import { GeoTierKey, TOP_IGAMING_GEOS, TIER1_REFERENCE } from '@/lib/geo-market-data';
import type {
  ChannelData,
  GlobalMultipliers,
  CalculatedChannelMetrics,
  GeoAllocationState,
  GeoMarketProfile,
  GeoMarketOverride,
} from './types';

// ========== CALCULATION FUNCTIONS ==========

/**
 * Pure core of `calculateChannelMetrics`. The geo profile is required here so this
 * module never reads store state; the store file wraps this and resolves the profile
 * from the live store when the caller does not pass one.
 */
export function calculateChannelMetricsWithGeo(
  channel: ChannelData,
  totalBudget: number,
  multipliers: GlobalMultipliers,
  /**
   * Optional pre-computed spend for this channel. When supplied (e.g. from pool-aware
   * selectors that account for fixed-fee channels), it takes precedence over the default
   * allocationPct × totalBudget × spendMultiplier formula.
   * This is the single source of truth for spend; callers should not overwrite
   * `metrics.spend` after calling this function.
   */
  spendOverride: number | undefined,
  resolvedGeoProfile: GeoMarketProfile
): CalculatedChannelMetrics {
  // Ghost Math: If inactive, return zeroed metrics
  if (channel.isActive === false) {
    return {
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
    };
  }

  // Spend: use the pool-aware override when provided; otherwise fall back to the simple formula.
  // The spendMultiplier is only applied to the fallback path — pool-aware callers already
  // factor the multiplier into the variable pool calculation.
  const spend =
    spendOverride !== undefined
      ? spendOverride
      : (channel.allocationPct / 100) * totalBudget * multipliers.spendMultiplier;

  // Apply Multipliers to Config
  // 1. CTR Bump
  const effectiveCtr = Math.max(
    0.01,
    (channel.typeConfig.baselineMetrics.ctr ?? 1) + multipliers.ctrBump
  );

  // 2. Global CPM Override (Only if model is CPM? Or apply broadly?)
  // If global CPM override is set, and we are in CPM mode, use it.
  // But 'price' is polymorphic.
  // Let's only apply if model is CPM.
  let effectivePrice = channel.typeConfig.price;
  if (channel.buyingModel === 'CPM' && multipliers.defaultCpmOverride) {
    effectivePrice = multipliers.defaultCpmOverride;
  }

  // Markets scale media prices and customer value relative to Tier-1 (the basis of all presets).
  // They must not force every channel to the same CPA: efficiency differences between
  // channels are what the plan is optimising.
  const costIndex =
    resolvedGeoProfile.blendedCpa > 0 ? resolvedGeoProfile.blendedCpa / TIER1_REFERENCE.cpa : 1;
  const valueIndex =
    resolvedGeoProfile.blendedLtv > 0 ? resolvedGeoProfile.blendedLtv / TIER1_REFERENCE.ltv : 1;
  const cpmOverridden = effectivePrice !== channel.typeConfig.price;
  const scalesWithMarket =
    !cpmOverridden && ['CPM', 'CPC', 'CPA', 'HYBRID'].includes(channel.buyingModel);
  if (scalesWithMarket) effectivePrice = effectivePrice * costIndex;
  const baseValue = channel.typeConfig.baselineMetrics.aov ?? multipliers.playerValue;

  const effectiveConfig: ChannelTypeConfig = {
    ...channel.typeConfig,
    price: effectivePrice,
    baselineMetrics: {
      ...channel.typeConfig.baselineMetrics,
      ctr: effectiveCtr,
      aov: baseValue * valueIndex,
    },
  };

  const unified = calculateUnifiedMetrics(effectiveConfig, spend, multipliers.playerValue * valueIndex);

  return {
    spend: unified.spend,
    impressions: unified.impressions,
    clicks: unified.clicks,
    conversions: unified.ftds,
    cpa: unified.cpa,
    revenue: unified.revenue,
    roas: unified.roas,
    effectivePrice,
    effectiveCtr,
    effectiveCr: channel.typeConfig.baselineMetrics.conversionRate || 0,
  };
}

export function getGeoMarketProfile(
  activeTiers: GeoAllocationState,
  activeGeos: string[],
  geoOverrides: Record<string, GeoMarketOverride> = {}
): GeoMarketProfile {
  const resolveGeoBaseline = (geo: (typeof TOP_IGAMING_GEOS)[number]) => {
    const override = geoOverrides[geo.name];
    return {
      cpa: override?.cpa ?? geo.baselineCpa,
      ltv: override?.ltv ?? geo.baselineLtv,
    };
  };

  if (activeGeos.length > 0) {
    const selected = TOP_IGAMING_GEOS.filter((geo) => activeGeos.includes(geo.name));

    if (selected.length > 0) {
      return {
        mode: 'geos',
        blendedCpa:
          selected.reduce((sum, geo) => sum + resolveGeoBaseline(geo).cpa, 0) / selected.length,
        blendedLtv:
          selected.reduce((sum, geo) => sum + resolveGeoBaseline(geo).ltv, 0) / selected.length,
      };
    }
  }

  const averageTier = (tier: GeoTierKey) => {
    const markets = TOP_IGAMING_GEOS.filter((geo) => geo.tier === tier);
    if (markets.length === 0) {
      return { cpa: 0, ltv: 0 };
    }

    return {
      cpa: markets.reduce((sum, geo) => sum + resolveGeoBaseline(geo).cpa, 0) / markets.length,
      ltv: markets.reduce((sum, geo) => sum + resolveGeoBaseline(geo).ltv, 0) / markets.length,
    };
  };

  const tierProfiles = {
    tier1: averageTier('tier1'),
    tier2: averageTier('tier2'),
    tier3: averageTier('tier3'),
  } as const;

  const totalWeight = Math.max(1, activeTiers.tier1 + activeTiers.tier2 + activeTiers.tier3);

  return {
    mode: 'tiers',
    blendedCpa:
      (activeTiers.tier1 * tierProfiles.tier1.cpa +
        activeTiers.tier2 * tierProfiles.tier2.cpa +
        activeTiers.tier3 * tierProfiles.tier3.cpa) /
      totalWeight,
    blendedLtv:
      (activeTiers.tier1 * tierProfiles.tier1.ltv +
        activeTiers.tier2 * tierProfiles.tier2.ltv +
        activeTiers.tier3 * tierProfiles.tier3.ltv) /
      totalWeight,
  };
}
