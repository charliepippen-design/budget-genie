import type { ChannelCategory } from '@/lib/mediaplan-data';
import type { BuyingModel, ChannelFamily, ChannelTypeConfig } from '@/types/channel';
import type { GeoTierKey } from '@/lib/geo-market-data';
import type { IgamingSubvertical, Vertical } from '@/lib/vertical-presets';
import type { PlanBrief, GeneratedPlan, ChannelRationale } from '@/lib/plan-generator';
import type {
  ChannelData,
  GlobalMultipliers,
  GeoAllocationState,
  GeoMarketOverride,
  ObservedLtvInputs,
  Preset,
  SubscriptionTier,
  UserStatus,
} from './types';

/** The data half of the media plan store (no actions). */
export interface MediaPlanData {
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
}

export interface MediaPlanActions {
  /** `snapshot: false` when the caller already took the pre-apply snapshot for this change. */
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

  // Actions - Channel Types
  setChannelType: (channelId: string, family: ChannelFamily, buyingModel: BuyingModel) => void;
  updateChannelTypeConfig: (channelId: string, config: Partial<ChannelTypeConfig>) => void;

  // Polymorphic config updates
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

export type MediaPlanState = MediaPlanData & MediaPlanActions;

export interface MarketSplit {
  /** Markets the plan targets: the brief's countries, else the selected geo names. */
  markets: string[];
  tiers: Record<GeoTierKey, number>;
}
