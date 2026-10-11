import type { ChannelCategory } from '@/lib/mediaplan-data';
import type { ChannelFamily, BuyingModel, ChannelTypeConfig } from '@/types/channel';

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
  geoOverrides?: Record<string, GeoMarketOverride>;
  observedLtv?: ObservedLtvInputs;
}
