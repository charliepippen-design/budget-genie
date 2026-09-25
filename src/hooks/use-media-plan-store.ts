import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useMemo } from 'react';
import { ChannelCategory, CATEGORY_INFO } from '@/lib/mediaplan-data';
import {
  ChannelFamily,
  BuyingModel,
  ChannelTypeConfig,
  FAMILY_INFO,
  calculateUnifiedMetrics,
  inferChannelFamily,
  inferBuyingModel,
  getLikelyModel,
} from '@/types/channel';
import { normalizeAllocations as normalizeAllocationsUtil } from '@/lib/math-utils';
import { calculateScoredAllocation } from '@/lib/distribution-logic';
import { GeoTierKey, TOP_IGAMING_GEOS, TIER_DEFAULTS, TIER1_REFERENCE } from '@/lib/geo-market-data';
import {
  DEFAULT_IGAMING_REVENUE_INPUTS,
  calculateIgamingRevenueMonth,
  isIgamingVertical,
  normalizeIgamingRevenueInputs,
} from '@/lib/igaming-revenue-model';
import { sanitizeChannelName } from '@/lib/utils';
import { IgamingSubvertical, Vertical } from '@/lib/vertical-presets';
import type { PlanBrief, GeneratedPlan, ChannelRationale } from '@/lib/plan-generator';
import { industryToVertical } from '@/lib/industries';

export type { ChannelCategory };

// ========== BUDGET CONSTRAINTS ==========
export const GLOBAL_BUDGET_CAP = 1000000; // 1M max
export const MIN_BUDGET_CAP = 1000; // 1k min: small businesses plan real 1k/month budgets

// ========== DATA MODEL ==========

export type ImpressionMode = 'CPM' | 'FIXED';
export type SubscriptionTier = 'free' | 'pro' | 'enterprise';
export type UserStatus = 'demo' | 'active';

export interface ChannelData {
  id: string;
  name: string;
  category: ChannelCategory;
  allocationPct: number;

  // Polymorphic configuration
  family: ChannelFamily;
  buyingModel: BuyingModel;
  typeConfig: ChannelTypeConfig;

  // Tier System (Engine Overhaul)
  tier: 'fixed' | 'scalable' | 'capped';
  maxSpendLimit?: number;

  // UI State / Meta
  locked: boolean;
  isActive: boolean; // New Ghost Math Flag
  warnings?: string[];
}

export interface GlobalMultipliers {
  spendMultiplier: number;
  defaultCpmOverride: number | null;
  ctrBump: number;
  cpaTarget: number | null;
  roasTarget: number | null;
  playerValue: number; // LTV per FTD for revenue calc
  retentionRate: number;
  regToFtdCvr: number;
  turnoverRate: number;
  margin: number;
  bonusRate: number;
}

export interface CalculatedChannelMetrics {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  cpa: number | null;
  revenue: number;
  roas: number;
  // Effective rates for display
  effectivePrice: number;
  effectiveCtr: number;
  effectiveCr: number;
}

export interface ChannelWithMetrics extends ChannelData {
  metrics: CalculatedChannelMetrics;
  aboveCpaTarget: boolean;
  belowRoasTarget: boolean;
}

export interface BlendedMetrics {
  totalSpend: number;
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
  blendedCpa: number | null;
  projectedRevenue: number;
  blendedRoas: number;
}

export interface FtdVelocityMetrics {
  totalImpressions: number;
  qualityClicks: number;
  registrations: number;
  ftds: number;
  ngr: number;
  impressionToClickRate: number;
  clickToRegistrationRate: number;
  registrationToFtdRate: number;
  ngrPerFtd: number;
}

export interface GeoAllocationState {
  tier1: number;
  tier2: number;
  tier3: number;
}

export interface GeoMarketProfile {
  mode: 'tiers' | 'geos';
  blendedCpa: number;
  blendedLtv: number;
}

export interface GeoMarketOverride {
  cpa?: number;
  ltv?: number;
}

export interface ObservedLtvInputs {
  m1: number | null;
  m3: number | null;
  m6: number | null;
}

export interface Preset {
  name: string;
  totalBudget: number;
  channels: ChannelData[];
  globalMultipliers: GlobalMultipliers;
  activeTiers?: GeoAllocationState;
  activeGeos?: string[];
}

// ========== DEFAULT DATA ==========

const BASE_CHANNELS_DATA = [
  // SEO & Content (RETAINER — fixed monthly spend, traffic × CR = FTDs)
  {
    id: 'seo-tech',
    name: 'SEO - Tech Audit & On-Page',
    category: 'SEO/Content' as ChannelCategory,
    baseSpend: 500,
    cpm: 2.5,
    ctr: 0.8,
    conversionRate: 0.8, // Organic: lower intent, slower funnel
    roas: 3.2,
  },
  {
    id: 'seo-content',
    name: 'SEO - Content Production',
    category: 'SEO/Content' as ChannelCategory,
    baseSpend: 1500,
    cpm: 1.8,
    ctr: 1.2,
    conversionRate: 1.0, // Content-driven organic converts slightly better
    roas: 4.5,
  },
  {
    id: 'seo-backlinks',
    name: 'SEO - Backlinks / Guest Posts',
    category: 'SEO/Content' as ChannelCategory,
    baseSpend: 1000,
    cpm: 3.5,
    ctr: 0.5,
    conversionRate: 0.8,
    roas: 2.8,
  },
  // Paid Media (CPM — impressions → clicks → FTDs)
  {
    id: 'paid-native',
    name: 'Paid - Native Ads',
    category: 'Display/Programmatic' as ChannelCategory,
    baseSpend: 2500,
    // CPM $4.2, CTR 0.35%, CR 1.2% → linear ROAS ≈ 1.5x (cold display, moderate intent)
    cpm: 4.2,
    ctr: 0.35,
    conversionRate: 1.2,
    roas: 1.8,
  },
  {
    id: 'paid-push',
    name: 'Paid - Push Notifications',
    category: 'Display/Programmatic' as ChannelCategory,
    baseSpend: 1500,
    // CPM raised $1.2 → $5.0; CR cut 1.2% → 0.3%
    // Push clickers are low-intent: high CTR but poor click-to-deposit rate.
    // Linear ROAS: (1000/5) × 0.025 × 0.003 × 150 ≈ 2.25x ✓
    cpm: 5.0,
    ctr: 2.5,
    conversionRate: 0.3,
    roas: 2.2,
  },
  {
    id: 'paid-programmatic',
    name: 'Paid - Programmatic / Display',
    category: 'Display/Programmatic' as ChannelCategory,
    baseSpend: 1000,
    // CTR raised 0.15% → 0.25%; CR raised 0.8% → 2.5%
    // Previous values gave 0.33x ROAS — unprofitable out of the box.
    // Linear ROAS: (1000/5.5) × 0.0025 × 0.025 × 150 ≈ 1.7x ✓
    cpm: 5.5,
    ctr: 0.25,
    conversionRate: 2.5,
    roas: 1.5,
  },
  {
    id: 'paid-retargeting',
    name: 'Paid - Retargeting (Pixel)',
    category: 'Display/Programmatic' as ChannelCategory,
    baseSpend: 500,
    // CPM raised $8 → $25 — retargeting premium inventory in iGaming is expensive.
    // Linear ROAS: (1000/25) × 0.018 × 0.045 × 150 ≈ 4.86x ✓ (warm audience deserves premium)
    cpm: 25.0,
    ctr: 1.8,
    conversionRate: 4.5,
    roas: 4.2,
  },
  // Affiliates
  {
    id: 'affiliate-listing',
    name: 'Affiliate - Listing Fees (Fixed)',
    category: 'Affiliate' as ChannelCategory,
    baseSpend: 1000,
    cpm: 15.0,
    ctr: 3.5,
    conversionRate: 3.0, // Affiliate referral traffic is pre-qualified
    roas: 2.0,
  },
  {
    id: 'affiliate-cpa',
    name: 'Affiliate - CPA Commissions',
    category: 'Affiliate' as ChannelCategory,
    baseSpend: 8500,
    cpm: 25.0,
    ctr: 4.2,
    conversionRate: 15.0, // CPA model: FTD = spend/CPA; CR only used for click back-calc
    roas: 3.5,
  },
  // Influencers (RETAINER / FLAT_FEE — fixed spend, estimated traffic × CR)
  {
    id: 'influencer-retainers',
    name: 'Influencer - Monthly Retainers',
    category: 'Paid Social' as ChannelCategory,
    baseSpend: 2000,
    cpm: 12.0,
    ctr: 1.5,
    conversionRate: 2.0, // Engaged community, medium conversion
    roas: 2.5,
  },
  {
    id: 'influencer-funds',
    name: 'Influencer - Play Funds (Balance)',
    category: 'Paid Social' as ChannelCategory,
    baseSpend: 1500,
    cpm: 10.0,
    ctr: 2.0,
    conversionRate: 2.5, // Bonus-incentivised traffic converts well
    roas: 3.0,
  },
];

const DEFAULT_MULTIPLIERS: GlobalMultipliers = {
  spendMultiplier: 1.0,
  defaultCpmOverride: null,
  ctrBump: 0,
  cpaTarget: null,
  roasTarget: null,
  playerValue: 150, // Default LTV per FTD
  retentionRate: DEFAULT_IGAMING_REVENUE_INPUTS.retentionRate,
  regToFtdCvr: DEFAULT_IGAMING_REVENUE_INPUTS.regToFtdCvr,
  turnoverRate: DEFAULT_IGAMING_REVENUE_INPUTS.turnoverRate,
  margin: DEFAULT_IGAMING_REVENUE_INPUTS.margin,
  bonusRate: DEFAULT_IGAMING_REVENUE_INPUTS.bonusRate,
};

// Helper to create type config from legacy channel data
function createTypeConfigFromLegacy(ch: (typeof BASE_CHANNELS_DATA)[0]): ChannelTypeConfig {
  const family = inferChannelFamily(ch.name);
  const buyingModel = inferBuyingModel(ch.name, family);

  let price = 0;
  const secondaryPrice = 0;

  // Map legacy values to new Price field
  switch (buyingModel) {
    case 'CPM':
      price = ch.cpm;
      break;
    case 'CPC':
      price = ch.cpm / 10;
      break; // Rough est
    case 'CPA':
      price = 50;
      break; // Default CPA
    case 'FLAT_FEE':
      price = ch.baseSpend;
      break;
    case 'RETAINER':
      price = ch.baseSpend;
      break;
    default:
      price = ch.cpm;
  }

  return {
    family,
    buyingModel,
    price,
    secondaryPrice,
    baselineMetrics: {
      ctr: ch.ctr,
      // Use channel-specific conversion rate so each channel type produces
      // credible metrics on first load rather than a uniform 2.5% across the board.
      conversionRate: ch.conversionRate ?? 2.5,
      aov: 150,
      trafficPerUnit: 1000,
      // Saturation ceiling at 3× base spend is a reasonable starting point.
      // Retargeting and affiliate CPA have naturally lower ceilings (tighter audiences).
      saturationCeiling: ch.baseSpend * 3,
    },
  };
}

function createInitialChannels(): ChannelData[] {
  const totalBaseSpend = BASE_CHANNELS_DATA.reduce((sum, ch) => sum + ch.baseSpend, 0);

  return BASE_CHANNELS_DATA.map((ch) => {
    const family = inferChannelFamily(ch.name);
    const buyingModel = inferBuyingModel(ch.name, family);
    const typeConfig = createTypeConfigFromLegacy(ch);

    // Auto-detect tier based on buying model
    let tier: 'fixed' | 'scalable' | 'capped' = 'scalable';
    if (buyingModel === 'RETAINER' || buyingModel === 'FLAT_FEE') {
      tier = 'fixed';
    }

    return {
      id: ch.id,
      name: ch.name,
      category: ch.category,
      allocationPct: (ch.baseSpend / totalBaseSpend) * 100,

      family,
      buyingModel,
      typeConfig,

      tier,
      maxSpendLimit: 0, // 0 = no limit

      locked: false,
      isActive: true,
    };
  });
}

// ========== CALCULATION FUNCTIONS ==========

export function calculateChannelMetrics(
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
  spendOverride?: number,
  geoProfile?: GeoMarketProfile
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

  const resolvedGeoProfile =
    geoProfile ??
    getGeoMarketProfile(
      useMediaPlanStore.getState().activeTiers,
      useMediaPlanStore.getState().activeGeos,
      useMediaPlanStore.getState().geoOverrides
    );

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

// ========== STORE DEFINITION ==========

export interface MediaPlanState {
  // Core data
  totalBudget: number;
  channels: ChannelData[];
  globalMultipliers: GlobalMultipliers;
  presets: Preset[];
  projectName: string;
  isBudgetDragging: boolean;
  budgetDragBaselineRevenue: number | null;
  budgetDragBaselineRoas: number | null;
  ghostProjectedRevenue: number | null;
  activeTiers: GeoAllocationState;
  activeGeos: string[];
  geoOverrides: Record<string, GeoMarketOverride>;
  observedLtv: ObservedLtvInputs;
  subscriptionTier: SubscriptionTier;
  userStatus: UserStatus;
  isGenieOpen: boolean;
  hasCompletedOnboarding: boolean;
  onboardingVertical: Vertical | null;
  onboardingSubvertical: IgamingSubvertical | null;

  // AI planner output
  brief: PlanBrief | null;
  planRationale: ChannelRationale[];
  planWarnings: string[];
  applyGeneratedPlan: (plan: GeneratedPlan) => void;

  // Actions - Budget
  setTotalBudget: (value: number) => void;
  setProjectName: (name: string) => void;
  beginBudgetDrag: (baselineRevenue: number, baselineRoas: number) => void;
  endBudgetDrag: () => void;
  setGhostProjectedRevenue: (value: number | null) => void;
  setTierAllocation: (tier: GeoTierKey, nextValue: number) => void;
  addActiveGeo: (geoName: string) => void;
  removeActiveGeo: (geoName: string) => void;
  clearActiveGeos: () => void;
  setGeoOverride: (geoName: string, override: GeoMarketOverride) => void;
  clearGeoOverride: (geoName: string) => void;
  setObservedLtv: (month: keyof ObservedLtvInputs, value: number | null) => void;
  clearObservedLtv: () => void;
  setSubscriptionTier: (tier: SubscriptionTier) => void;
  setUserStatus: (status: UserStatus) => void;
  setIsGenieOpen: (open: boolean) => void;
  setHasCompletedOnboarding: (value: boolean) => void;
  setOnboardingVertical: (v: Vertical | null) => void;
  setOnboardingSubvertical: (v: IgamingSubvertical | null) => void;

  // Actions - Channels
  setChannelAllocation: (channelId: string, percentage: number) => void;
  setAllocations: (allocations: Record<string, number>) => void;

  normalizeAllocations: () => void;
  toggleChannelLock: (channelId: string) => void;
  toggleChannelActive: (channelId: string) => void;

  restoreState: (snapshot: Partial<MediaPlanState>) => void; // For Time Travel

  addChannel: (channel: Partial<ChannelData> & { name: string; category: ChannelCategory }) => void;
  deleteChannel: (id: string) => void;
  setChannels: (channels: ChannelData[]) => void;

  // Actions - Channel Types (NEW)
  setChannelType: (channelId: string, family: ChannelFamily, buyingModel: BuyingModel) => void;
  updateChannelTypeConfig: (channelId: string, config: Partial<ChannelTypeConfig>) => void;

  // New Action for polymorphic updates
  updateChannelConfigField: (
    channelId: string,
    field: keyof ChannelTypeConfig | 'baselineMetrics',
    value: unknown
  ) => void;

  // Actions - Multipliers
  setGlobalMultipliers: (updates: Partial<GlobalMultipliers>) => void;
  resetGlobalMultipliers: () => void;

  // Actions - Rebalance
  rebalanceToTargets: () => void;

  // Actions - Presets
  savePreset: (name: string) => void;
  loadPreset: (name: string) => void;
  deletePreset: (name: string) => void;

  // Actions - Reset
  resetAll: () => void;

  // Actions - Bulk
  applyCategoryMultipliers: (multipliers: Record<string, number>) => void;
}

export const useMediaPlanStore = create<MediaPlanState>()(
  persist(
    (set, get) => ({
      // Initial state
      totalBudget: 50000,
      channels: createInitialChannels(),
      globalMultipliers: { ...DEFAULT_MULTIPLIERS },
      presets: [],
      projectName: 'My Media Plan',
      isBudgetDragging: false,
      budgetDragBaselineRevenue: null,
      budgetDragBaselineRoas: null,
      ghostProjectedRevenue: null,
      activeTiers: { ...TIER_DEFAULTS },
      activeGeos: [],
      geoOverrides: {},
      observedLtv: {
        m1: null,
        m3: null,
        m6: null,
      },
      subscriptionTier: 'free',
      userStatus: 'demo',
      isGenieOpen: true,
      hasCompletedOnboarding: false,
      onboardingVertical: null,
      onboardingSubvertical: null,
      brief: null,
      planRationale: [],
      planWarnings: [],

      applyGeneratedPlan: (plan) =>
        set((state) => ({
          brief: plan.brief,
          totalBudget: Math.max(MIN_BUDGET_CAP, Math.min(GLOBAL_BUDGET_CAP, plan.totalBudget)),
          channels: JSON.parse(JSON.stringify(plan.channels)),
          globalMultipliers: { ...state.globalMultipliers, ...plan.multipliers },
          activeGeos: plan.geo.activeGeos,
          activeTiers: { ...plan.geo.activeTiers },
          onboardingVertical: industryToVertical(plan.brief.industry),
          planRationale: plan.rationale,
          planWarnings: plan.warnings,
        })),

      // Budget
      setTotalBudget: (value) =>
        set({ totalBudget: Math.max(MIN_BUDGET_CAP, Math.min(GLOBAL_BUDGET_CAP, value)) }),
      setProjectName: (name) => set({ projectName: name }),
      beginBudgetDrag: (baselineRevenue, baselineRoas) =>
        set({
          isBudgetDragging: true,
          budgetDragBaselineRevenue: baselineRevenue,
          budgetDragBaselineRoas: baselineRoas,
        }),
      endBudgetDrag: () =>
        set({
          isBudgetDragging: false,
          budgetDragBaselineRevenue: null,
          budgetDragBaselineRoas: null,
        }),
      setGhostProjectedRevenue: (value) => set({ ghostProjectedRevenue: value }),
      setTierAllocation: (tier, nextValue) => {
        set((state) => {
          const clamped = Math.max(0, Math.min(100, nextValue));
          const otherTiers = (Object.keys(state.activeTiers) as GeoTierKey[]).filter(
            (key) => key !== tier
          );
          const remaining = Math.max(0, 100 - clamped);
          const currentOtherTotal = otherTiers.reduce(
            (sum, key) => sum + state.activeTiers[key],
            0
          );

          const nextTiers = { ...state.activeTiers, [tier]: clamped };

          if (currentOtherTotal === 0) {
            const equalShare = remaining / otherTiers.length;
            otherTiers.forEach((key) => {
              nextTiers[key] = Number(equalShare.toFixed(2));
            });
          } else {
            otherTiers.forEach((key) => {
              nextTiers[key] = Number(
                ((state.activeTiers[key] / currentOtherTotal) * remaining).toFixed(2)
              );
            });
          }

          const sum = Object.values(nextTiers).reduce((acc, value) => acc + value, 0);
          const drift = Number((100 - sum).toFixed(2));
          if (Math.abs(drift) > 0) {
            const repairKey = otherTiers[0] ?? tier;
            nextTiers[repairKey] = Number((nextTiers[repairKey] + drift).toFixed(2));
          }

          return { activeTiers: nextTiers };
        });
      },
      addActiveGeo: (geoName) =>
        set((state) => ({
          activeGeos: state.activeGeos.includes(geoName)
            ? state.activeGeos
            : [...state.activeGeos, geoName],
        })),
      removeActiveGeo: (geoName) =>
        set((state) => ({
          activeGeos: state.activeGeos.filter((item) => item !== geoName),
        })),
      clearActiveGeos: () => set({ activeGeos: [] }),
      setGeoOverride: (geoName, override) =>
        set((state) => ({
          geoOverrides: {
            ...state.geoOverrides,
            [geoName]: {
              ...(state.geoOverrides[geoName] ?? {}),
              ...override,
            },
          },
        })),
      clearGeoOverride: (geoName) =>
        set((state) => {
          const nextOverrides = { ...state.geoOverrides };
          delete nextOverrides[geoName];
          return { geoOverrides: nextOverrides };
        }),
      setObservedLtv: (month, value) =>
        set((state) => ({
          observedLtv: {
            ...state.observedLtv,
            [month]: value,
          },
        })),
      clearObservedLtv: () =>
        set({
          observedLtv: {
            m1: null,
            m3: null,
            m6: null,
          },
        }),
      setSubscriptionTier: (tier) => set({ subscriptionTier: tier }),
      setUserStatus: (status) => set({ userStatus: status }),
      setIsGenieOpen: (open) => set({ isGenieOpen: open }),
      setHasCompletedOnboarding: (value) => set({ hasCompletedOnboarding: value }),
      setOnboardingVertical: (v) => set({ onboardingVertical: v }),
      setOnboardingSubvertical: (v) => set({ onboardingSubvertical: v }),

      // Channel allocation
      setChannelAllocation: (channelId, percentage) => {
        set((state) => {
          const targetChannel = state.channels.find((ch) => ch.id === channelId);
          if (!targetChannel) return { channels: state.channels };

          const oldPercentage = targetChannel.allocationPct;
          const newPercentage = Math.max(0, Math.min(100, percentage));
          const delta = newPercentage - oldPercentage;

          // Only active, unlocked, variable channels absorb the change: inactive channels are out
          // of the plan and fixed-fee spend comes from their price, not the percentage.
          const absorbs = (ch: ChannelData) =>
            ch.id !== channelId && !ch.locked && ch.isActive !== false && !isFixedCostChannel(ch);
          const availableChannels = state.channels.filter(absorbs);
          const availableTotal = availableChannels.reduce((sum, ch) => sum + ch.allocationPct, 0);

          if (delta > 0 && availableTotal <= 0) {
            return { channels: state.channels };
          }

          // Cap growth so proportional reductions can never push others below 0.
          const cappedDelta = delta > 0 ? Math.min(delta, availableTotal) : delta;
          const finalTargetPercentage = oldPercentage + cappedDelta;

          const channels = state.channels.map((ch) => {
            if (ch.id === channelId) {
              return { ...ch, allocationPct: Math.max(0, finalTargetPercentage) };
            }

            if (!absorbs(ch)) return ch;

            if (availableTotal <= 0) return ch;

            const weight = ch.allocationPct / availableTotal;
            const adjustedPercentage = ch.allocationPct - cappedDelta * weight;

            return { ...ch, allocationPct: Math.max(0, adjustedPercentage) };
          });

          return { channels };
        });
      },

      setAllocations: (allocations) => {
        set((state) => ({
          channels: state.channels.map((ch) =>
            allocations[ch.id] !== undefined
              ? { ...ch, allocationPct: Math.max(0, Math.min(100, allocations[ch.id])) }
              : ch
          ),
        }));
      },

      normalizeAllocations: () => {
        // Same rule as toggling/adding channels: inactive channels keep their ghost value,
        // active unlocked ones are scaled so the active plan sums to 100%.
        set((state) => ({ channels: normalizeAllocationsUtil(state.channels) }));
      },

      toggleChannelActive: (channelId) => {
        set((state) => {
          const newChannels = state.channels.map((ch) =>
            ch.id === channelId ? { ...ch, isActive: ch.isActive === false } : ch
          );

          // Re-normalize immediately after toggle
          return { channels: normalizeAllocationsUtil(newChannels) };
        });
      },

      toggleChannelLock: (channelId) => {
        set((state) => ({
          channels: state.channels.map((ch) =>
            ch.id === channelId ? { ...ch, locked: !ch.locked } : ch
          ),
        }));
      },

      // Replaced updateChannelOverride with specific config updates
      updateChannelTypeConfig: (channelId, config) => {
        set((state) => ({
          channels: state.channels.map((ch) =>
            ch.id === channelId ? { ...ch, typeConfig: { ...ch.typeConfig, ...config } } : ch
          ),
        }));
      },

      updateChannelConfigField: (channelId, field, value) => {
        set((state) => ({
          channels: state.channels.map((ch) => {
            if (ch.id !== channelId) return ch;

            if (field === 'baselineMetrics') {
              const baselineUpdates =
                typeof value === 'object' && value !== null
                  ? (value as Partial<ChannelTypeConfig['baselineMetrics']>)
                  : {};

              return {
                ...ch,
                typeConfig: {
                  ...ch.typeConfig,
                  baselineMetrics: { ...ch.typeConfig.baselineMetrics, ...baselineUpdates },
                },
              };
            }

            return {
              ...ch,
              typeConfig: { ...ch.typeConfig, [field]: value },
            };
          }),
        }));
      },

      addChannel: (channelData) => {
        set((state) => {
          const id = crypto.randomUUID();
          // Defensively sanitize channel name to prevent XSS
          const sanitizedName = sanitizeChannelName(channelData.name) ?? 'Unnamed Channel';
          const family = channelData.family ?? inferChannelFamily(sanitizedName);
          // Auto-sensing defaults
          const likelyModel = getLikelyModel(channelData.category);
          const buyingModel = channelData.buyingModel ?? likelyModel;

          const newChannel: ChannelData = {
            id,
            name: sanitizedName,
            category: channelData.category,
            allocationPct: 5,
            family,
            buyingModel,
            typeConfig: channelData.typeConfig ?? {
              family,
              buyingModel,
              price: 5,
              baselineMetrics: {
                ctr: 1,
                conversionRate: 2.5,
                saturationCeiling: 50000, // Default for new manual channels
              },
            },

            tier: likelyModel === 'RETAINER' || likelyModel === 'FLAT_FEE' ? 'fixed' : 'scalable',
            maxSpendLimit: 0,

            locked: false,
            isActive: true,
          };

          // Normalize to include new channel
          const allChannels = [...state.channels, newChannel];
          return { channels: normalizeAllocationsUtil(allChannels) };
        });
      },

      deleteChannel: (id) => {
        set((state) => {
          const remaining = state.channels.filter((ch) => ch.id !== id);
          if (remaining.length === 0) return state;

          return { channels: normalizeAllocationsUtil(remaining) };
        });
      },

      setChannels: (channels) => {
        set({ channels });
      },

      // Channel Type Actions (NEW)
      setChannelType: (channelId, family, buyingModel) => {
        // Translate the price into the new model from the channel's current economics, so a
        // €6 CPM doesn't silently become a €6 CPA.
        const current = computePlanSnapshot(get()).channels.find((c) => c.id === channelId);
        const m = current?.metrics;
        const price = (() => {
          if (!current || current.buyingModel === buyingModel) return current?.typeConfig.price ?? 0;
          switch (buyingModel) {
            case 'CPM':
              return m && m.impressions > 0 ? (m.spend / m.impressions) * 1000 : 5;
            case 'CPC':
              return m && m.clicks > 0 ? m.spend / m.clicks : 1;
            case 'CPA':
            case 'HYBRID':
              return m && m.conversions > 0 ? m.spend / m.conversions : 50;
            case 'FLAT_FEE':
            case 'RETAINER':
              return m && m.spend > 0 ? m.spend : 1000;
            case 'REV_SHARE':
              return 25;
            default:
              return current.typeConfig.price;
          }
        })();
        const fixed = buyingModel === 'FLAT_FEE' || buyingModel === 'RETAINER';
        set((state) => ({
          channels: state.channels.map((ch) =>
            ch.id === channelId
              ? {
                  ...ch,
                  family,
                  buyingModel,
                  tier: fixed ? 'fixed' : ch.tier === 'fixed' ? 'scalable' : ch.tier,
                  typeConfig: {
                    ...ch.typeConfig,
                    family,
                    buyingModel,
                    price: Math.round(price * 100) / 100,
                    ...(buyingModel === 'REV_SHARE' || buyingModel === 'HYBRID'
                      ? { secondaryPrice: ch.typeConfig.secondaryPrice || 25 }
                      : {}),
                  },
                }
              : ch
          ),
        }));
      },

      // Multipliers
      setGlobalMultipliers: (updates) => {
        // Skip undefined/NaN so a partial update can never wipe a default (e.g. revenue-model rates).
        const clean = Object.fromEntries(
          Object.entries(updates).filter(
            ([, v]) => v !== undefined && !(typeof v === 'number' && !Number.isFinite(v))
          )
        ) as Partial<GlobalMultipliers>;
        set((state) => ({
          globalMultipliers: { ...state.globalMultipliers, ...clean },
        }));
      },

      resetGlobalMultipliers: () => {
        set({ globalMultipliers: { ...DEFAULT_MULTIPLIERS } });
      },

      // Rebalance towards targets
      rebalanceToTargets: () => {
        const state = get();
        const { cpaTarget, roasTarget } = state.globalMultipliers;
        if (!cpaTarget && !roasTarget) return;

        // Calculate metrics for each channel
        const channelsWithMetrics = state.channels
          .filter((ch) => ch.isActive !== false)
          .map((ch) => ({
            ...ch,
            metrics: calculateChannelMetrics(ch, state.totalBudget, state.globalMultipliers),
            aboveCpaTarget: false, // Not needed for calculation but fitting the type
            belowRoasTarget: false,
          })) as ChannelWithMetrics[]; // Casting mainly because we don't need the boolean flags for the calc

        if (channelsWithMetrics.length === 0) return;

        // Calculate new allocations based on weighted scoring
        const newAllocations = calculateScoredAllocation(
          channelsWithMetrics,
          cpaTarget,
          roasTarget
        );

        set({
          channels: normalizeAllocationsUtil(
            state.channels.map((ch) => {
              // Preserve locked and ghost channels exactly as-is.
              if (ch.locked || ch.isActive === false) return ch;
              // Apply new allocation if calculated.
              if (newAllocations[ch.id] !== undefined) {
                return { ...ch, allocationPct: newAllocations[ch.id] };
              }
              return ch;
            })
          ),
        });
      },

      // Presets
      savePreset: (name) => {
        set((state) => {
          const preset: Preset = {
            name,
            totalBudget: state.totalBudget,
            channels: JSON.parse(JSON.stringify(state.channels)),
            globalMultipliers: { ...state.globalMultipliers },
            activeTiers: { ...state.activeTiers },
            activeGeos: [...state.activeGeos],
          };

          const existing = state.presets.filter((p) => p.name !== name);
          return { presets: [...existing, preset] };
        });
      },

      loadPreset: (name) => {
        set((state) => {
          const preset = state.presets.find((p) => p.name === name);
          if (!preset) return state;

          return {
            totalBudget: preset.totalBudget,
            channels: JSON.parse(JSON.stringify(preset.channels)),
            globalMultipliers: { ...preset.globalMultipliers },
            activeTiers: { ...TIER_DEFAULTS, ...(preset.activeTiers ?? {}) },
            activeGeos: [...(preset.activeGeos ?? [])],
          };
        });
      },

      deletePreset: (name) => {
        set((state) => ({
          presets: state.presets.filter((p) => p.name !== name),
        }));
      },

      resetAll: () => {
        // "Reset to Zero" - User Request
        // We keep the channels structure so they don't have to re-add everything,
        // but we zero out the budget and targets.

        const DEFAULT_CHANNELS_DATA = [
          {
            id: '1',
            name: 'Paid Search',
            category: 'Paid Search',
            buyingModel: 'CPC',
            price: 0,
            allocation: 0,
            baselineMetrics: { conversionRate: 3.5, ctr: 2.0 },
            isLocked: false,
          },
          {
            id: '2',
            name: 'Facebook Ads',
            category: 'Paid Social',
            buyingModel: 'CPM',
            price: 0,
            allocation: 0,
            baselineMetrics: { ctr: 1.2, conversionRate: 1.5 },
            isLocked: false,
          },
          {
            id: '3',
            name: 'Affiliates',
            category: 'Affiliate',
            buyingModel: 'CPA',
            price: 0,
            allocation: 0,
            baselineMetrics: { conversionRate: 5.0 },
            isLocked: false,
          },
          {
            id: '4',
            name: 'Display / Programmatic',
            category: 'Display/Programmatic',
            buyingModel: 'CPM',
            price: 0,
            allocation: 0,
            baselineMetrics: { ctr: 0.8, conversionRate: 0.5 },
            isLocked: false,
          },
          {
            id: '5',
            name: 'SEO Content',
            category: 'SEO/Content',
            buyingModel: 'FLAT_FEE',
            price: 0,
            allocation: 0,
            baselineMetrics: { trafficPerUnit: 5000, conversionRate: 1.8 },
            isLocked: false,
          },
        ];

        // Map to Schema
        const newChannels: ChannelData[] = DEFAULT_CHANNELS_DATA.map((d) => {
          const family = inferChannelFamily(d.name);
          const buyingModel = d.buyingModel as BuyingModel;

          let tier: 'fixed' | 'scalable' | 'capped' = 'scalable';
          if (buyingModel === 'RETAINER' || buyingModel === 'FLAT_FEE') {
            tier = 'fixed';
          }

          return {
            id: d.id,
            name: d.name,
            category: d.category as ChannelCategory,
            allocationPct: d.allocation, // Now 0
            family,
            buyingModel,
            typeConfig: {
              family,
              buyingModel,
              price: d.price,
              baselineMetrics: d.baselineMetrics,
              secondaryPrice: 0,
              saturationCeiling: 50000, // Default
            },
            tier,
            maxSpendLimit: 0,
            locked: d.isLocked,
            isActive: true,
          };
        });

        localStorage.removeItem('mediaplan-store-v2');
        set({
          totalBudget: 0, // Reset to 0
          channels: newChannels,
          globalMultipliers: {
            ...DEFAULT_MULTIPLIERS,
            cpaTarget: null,
            roasTarget: null,
          },
          activeTiers: { ...TIER_DEFAULTS },
          activeGeos: [],
          geoOverrides: {},
          observedLtv: {
            m1: null,
            m3: null,
            m6: null,
          },
          onboardingSubvertical: null,
          brief: null,
          planRationale: [],
          planWarnings: [],
        });
      },

      applyCategoryMultipliers: (multipliers) => {
        set((state) => {
          const baseTotalSpend = BASE_CHANNELS_DATA.reduce((sum, ch) => sum + ch.baseSpend, 0);

          const newAllocations = state.channels.map((ch) => {
            const base = BASE_CHANNELS_DATA.find((b) => b.id === ch.id);
            if (!base) return { id: ch.id, raw: ch.allocationPct };

            const mult = multipliers[base.category] ?? 1.0;
            const baseShare = (base.baseSpend / baseTotalSpend) * 100;
            return { id: ch.id, raw: baseShare * mult };
          });

          // Normalize
          const totalRaw = newAllocations.reduce((sum, item) => sum + item.raw, 0);
          const factor = totalRaw > 0 ? 100 / totalRaw : 1;

          return {
            channels: state.channels.map((ch) => {
              const newAlloc = newAllocations.find((n) => n.id === ch.id);
              return {
                ...ch,
                allocationPct: newAlloc ? newAlloc.raw * factor : ch.allocationPct,
              };
            }),
          };
        });
      },

      restoreState: (snapshot) => {
        set((state) => ({
          ...state,
          ...snapshot,
        }));
      },
    }),
    {
      name: 'mediaplan-store-v2',
      partialize: (state) => ({
        totalBudget: state.totalBudget,
        channels: state.channels,
        globalMultipliers: state.globalMultipliers,
        presets: state.presets,
        activeTiers: state.activeTiers,
        activeGeos: state.activeGeos,
        geoOverrides: state.geoOverrides,
        observedLtv: state.observedLtv,
        subscriptionTier: state.subscriptionTier,
        userStatus: state.userStatus,
        hasCompletedOnboarding: state.hasCompletedOnboarding,
        onboardingVertical: state.onboardingVertical,
        onboardingSubvertical: state.onboardingSubvertical,
        brief: state.brief,
        planRationale: state.planRationale,
        planWarnings: state.planWarnings,
      }),
      version: 9,
      // Fill multipliers missing from older/broken saves (JSON drops undefined keys) with defaults.
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<MediaPlanState>;
        return {
          ...current,
          ...saved,
          globalMultipliers: { ...current.globalMultipliers, ...(saved.globalMultipliers ?? {}) },
        };
      },
      migrate: (persistedState: unknown, version) => {
        const safeState = (persistedState ?? {}) as Partial<MediaPlanState> & {
          channels?: Array<Partial<ChannelData>>;
        };
        const withRevenueModelDefaults = (state: Partial<MediaPlanState>) => ({
          ...state,
          globalMultipliers: {
            ...DEFAULT_MULTIPLIERS,
            ...(state.globalMultipliers ?? {}),
          },
          onboardingSubvertical: state.onboardingSubvertical ?? null,
        });

        if (version < 2) {
          // Hard reset for version 2 (Types totally changed)
          return withRevenueModelDefaults({
            totalBudget: 50000,
            channels: createInitialChannels(),
            globalMultipliers: { ...DEFAULT_MULTIPLIERS },
            presets: [],
          }) as unknown as MediaPlanState;
        }
        // Migration to v3 for isActive
        if (version < 3) {
          return withRevenueModelDefaults({
            ...safeState,
            channels: (safeState.channels ?? []).map((ch) => ({
              ...ch,
              isActive: ch.isActive ?? true,
            })),
            activeTiers: { ...TIER_DEFAULTS },
            activeGeos: [],
          }) as MediaPlanState;
        }
        if (version < 4) {
          return withRevenueModelDefaults({
            ...safeState,
            activeTiers: {
              ...TIER_DEFAULTS,
              ...(safeState as Partial<MediaPlanState>).activeTiers,
            },
            activeGeos: (safeState as Partial<MediaPlanState>).activeGeos ?? [],
            subscriptionTier: (safeState as Partial<MediaPlanState>).subscriptionTier ?? 'free',
            userStatus: (safeState as Partial<MediaPlanState>).userStatus ?? 'demo',
          }) as MediaPlanState;
        }
        if (version < 5) {
          return withRevenueModelDefaults({
            ...safeState,
            subscriptionTier: (safeState as Partial<MediaPlanState>).subscriptionTier ?? 'free',
            userStatus: (safeState as Partial<MediaPlanState>).userStatus ?? 'demo',
          }) as MediaPlanState;
        }
        if (version < 6) {
          return withRevenueModelDefaults({
            ...safeState,
            userStatus: (safeState as Partial<MediaPlanState>).userStatus ?? 'demo',
          }) as MediaPlanState;
        }
        if (version < 7) {
          return withRevenueModelDefaults({
            ...safeState,
            geoOverrides: (safeState as Partial<MediaPlanState>).geoOverrides ?? {},
            observedLtv: (safeState as Partial<MediaPlanState>).observedLtv ?? {
              m1: null,
              m3: null,
              m6: null,
            },
          }) as MediaPlanState;
        }
        if (version < 8) {
          return withRevenueModelDefaults({
            ...safeState,
            onboardingVertical: (safeState as Partial<MediaPlanState>).onboardingVertical ?? null,
          }) as MediaPlanState;
        }
        return withRevenueModelDefaults(safeState) as MediaPlanState;
      },
    }
  )
);

// ========== SELECTOR HOOKS ==========

/**
 * Determines whether a channel uses a fixed-cost buying model whose spend is set
 * by `typeConfig.price` rather than by the percentage allocation pool.
 */
function isFixedCostChannel(channel: ChannelData): boolean {
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

const DEFAULT_MULTIPLIERS_FALLBACK: GlobalMultipliers = {
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
  MediaPlanState,
  'totalBudget' | 'channels' | 'globalMultipliers' | 'activeTiers' | 'activeGeos' | 'geoOverrides'
>;

/**
 * Pure plan computation: per-channel metrics and blended totals.
 * The dashboard hooks and the AI planner both read numbers from here.
 */
export function computePlanSnapshot(input: PlanInputs): {
  channels: ChannelWithMetrics[];
  blended: BlendedMetrics;
} {
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
    const metrics = calculateChannelMetrics(channel, input.totalBudget, mults, poolAwareSpend, geoProfile);

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
  return { channels, blended };
}

function usePlanSnapshot() {
  const totalBudget = useMediaPlanStore((state) => state.totalBudget);
  const channels = useMediaPlanStore((state) => state.channels);
  const globalMultipliers = useMediaPlanStore((state) => state.globalMultipliers);
  const activeTiers = useMediaPlanStore((state) => state.activeTiers);
  const activeGeos = useMediaPlanStore((state) => state.activeGeos);
  const geoOverrides = useMediaPlanStore((state) => state.geoOverrides);

  return useMemo(
    () => computePlanSnapshot({ totalBudget, channels, globalMultipliers, activeTiers, activeGeos, geoOverrides }),
    [activeGeos, activeTiers, channels, geoOverrides, globalMultipliers, totalBudget]
  );
}

export function useChannelsWithMetrics(): ChannelWithMetrics[] {
  return usePlanSnapshot().channels;
}

export function useBlendedMetrics(): BlendedMetrics {
  return usePlanSnapshot().blended;
}

export function useGeoMarketProfile(): GeoMarketProfile {
  const activeTiers = useMediaPlanStore((state) => state.activeTiers);
  const activeGeos = useMediaPlanStore((state) => state.activeGeos);
  const geoOverrides = useMediaPlanStore((state) => state.geoOverrides);

  return useMemo(
    () => getGeoMarketProfile(activeTiers, activeGeos, geoOverrides),
    [activeGeos, activeTiers, geoOverrides]
  );
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
  snapshot: ReturnType<typeof computePlanSnapshot>
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

export function useCategoryTotals(): Record<string, { spend: number; percentage: number }> {
  const snapshot = usePlanSnapshot();

  return useMemo(() => computeCategoryTotals(snapshot), [snapshot]);
}

export function useFtdVelocityMetrics(): FtdVelocityMetrics {
  const channelsWithMetrics = useChannelsWithMetrics();
  const vertical = useMediaPlanStore((s) => s.onboardingVertical);
  const globalMultipliers = useMediaPlanStore((s) => s.globalMultipliers);

  return useMemo(() => {
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
    const igamingInputs = normalizeIgamingRevenueInputs(
      globalMultipliers,
      globalMultipliers.playerValue
    );
    const waterfall = isIgamingVertical(vertical)
      ? calculateIgamingRevenueMonth(
          {
            ftds,
            marketingCost: 0,
          },
          0,
          igamingInputs
        )
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
  }, [channelsWithMetrics, globalMultipliers, vertical]);
}

export type Channel = ChannelData;
