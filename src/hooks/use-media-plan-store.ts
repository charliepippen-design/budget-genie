import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ChannelCategory, CATEGORY_INFO } from '@/lib/mediaplan-data';
import {
  ChannelFamily,
  BuyingModel,
  ChannelTypeConfig,
  FAMILY_INFO,
  calculateUnifiedMetrics,
  inferChannelFamily,
  inferBuyingModel
} from '@/types/channel';

// ========== DATA MODEL ==========

export type ImpressionMode = 'CPM' | 'FIXED';

export interface ChannelData {
  id: string;
  name: string;
  category: ChannelCategory;
  allocationPct: number;

  // NEW: Channel type configuration for polymorphic calculations
  family: ChannelFamily;
  buyingModel: BuyingModel;
  typeConfig: ChannelTypeConfig;

  // Base KPI inputs (from CSV/defaults) - kept for backwards compatibility
  baseCpm: number;
  baseCtr: number;
  baseCr: number; // Conversion rate (%)
  baseCpa: number | null;
  baseRoas: number;

  // Editable overrides (null = use base)
  overrideCpm: number | null;
  overrideCtr: number | null;
  overrideCr: number | null;
  overrideCpa: number | null;
  overrideRoas: number | null;

  // Impression mode
  impressionMode: ImpressionMode;
  fixedImpressions: number;

  // Locked allocation (for normalization)
  locked: boolean;
}

export interface GlobalMultipliers {
  spendMultiplier: number;
  defaultCpmOverride: number | null;
  ctrBump: number;
  cpaTarget: number | null;
  roasTarget: number | null;
  playerValue: number; // LTV per FTD for revenue calc
}

export interface CalculatedChannelMetrics {
  spend: number;
  effectiveCpm: number;
  effectiveCtr: number;
  effectiveCr: number;
  impressions: number;
  clicks: number;
  conversions: number;
  cpa: number | null;
  revenue: number;
  roas: number;
}

export interface ChannelWithMetrics extends ChannelData {
  metrics: CalculatedChannelMetrics;
  aboveCpaTarget: boolean;
  belowRoasTarget: boolean;
  // Legacy compat
  currentPercentage: number;
  effectiveCpm: number;
  effectiveCtr: number;
  warnings: string[];
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

export interface Preset {
  name: string;
  totalBudget: number;
  channels: ChannelData[];
  globalMultipliers: GlobalMultipliers;
}

// ========== DEFAULT DATA ==========

const BASE_CHANNELS_DATA = [
  // SEO & Content
  { id: 'seo-tech', name: 'SEO - Tech Audit & On-Page', category: 'SEO/Content' as ChannelCategory, baseSpend: 500, cpm: 2.5, ctr: 0.8, roas: 3.2 },
  { id: 'seo-content', name: 'SEO - Content Production', category: 'SEO/Content' as ChannelCategory, baseSpend: 1500, cpm: 1.8, ctr: 1.2, roas: 4.5 },
  { id: 'seo-backlinks', name: 'SEO - Backlinks / Guest Posts', category: 'SEO/Content' as ChannelCategory, baseSpend: 1000, cpm: 3.5, ctr: 0.5, roas: 2.8 },
  // Paid Media
  { id: 'paid-native', name: 'Paid - Native Ads (Adult/Crypto)', category: 'Display/Programmatic' as ChannelCategory, baseSpend: 2500, cpm: 4.2, ctr: 0.35, roas: 1.8 },
  { id: 'paid-push', name: 'Paid - Push Notifications', category: 'Display/Programmatic' as ChannelCategory, baseSpend: 1500, cpm: 1.2, ctr: 2.5, roas: 2.2 },
  { id: 'paid-programmatic', name: 'Paid - Programmatic / Display', category: 'Display/Programmatic' as ChannelCategory, baseSpend: 1000, cpm: 5.5, ctr: 0.15, roas: 1.5 },
  { id: 'paid-retargeting', name: 'Paid - Retargeting (Pixel)', category: 'Display/Programmatic' as ChannelCategory, baseSpend: 500, cpm: 8.0, ctr: 1.8, roas: 4.2 },
  // Affiliates
  { id: 'affiliate-listing', name: 'Affiliate - Listing Fees (Fixed)', category: 'Affiliate' as ChannelCategory, baseSpend: 1000, cpm: 15.0, ctr: 3.5, roas: 2.0 },
  { id: 'affiliate-cpa', name: 'Affiliate - CPA Commissions', category: 'Affiliate' as ChannelCategory, baseSpend: 8500, cpm: 25.0, ctr: 4.2, roas: 3.5 },
  // Influencers
  { id: 'influencer-retainers', name: 'Influencer - Monthly Retainers', category: 'Paid Social' as ChannelCategory, baseSpend: 2000, cpm: 12.0, ctr: 1.5, roas: 2.5 },
  { id: 'influencer-funds', name: 'Influencer - Play Funds (Bal)', category: 'Paid Social' as ChannelCategory, baseSpend: 1500, cpm: 10.0, ctr: 2.0, roas: 3.0 },
];

const DEFAULT_MULTIPLIERS: GlobalMultipliers = {
  spendMultiplier: 1.0,
  defaultCpmOverride: null,
  ctrBump: 0,
  cpaTarget: null,
  roasTarget: null,
  playerValue: 150, // Default LTV per FTD
};

// Helper to create type config from legacy channel data
function createTypeConfigFromLegacy(ch: typeof BASE_CHANNELS_DATA[0]): ChannelTypeConfig {
  const family = inferChannelFamily(ch.name);
  const buyingModel = inferBuyingModel(ch.name, family);

  return {
    family,
    buyingModel,
    cpm: ch.cpm,
    ctr: ch.ctr,
    cr: 2.5,
    // Set defaults based on model
    ...(buyingModel === 'flat_fee' && { fixedCost: ch.baseSpend, estFtds: 5 }),
    ...(buyingModel === 'retainer' && { fixedCost: ch.baseSpend, estTraffic: 5000, cr: 2.5 }),
    ...(buyingModel === 'cpa' && { targetCpa: 50, targetFtds: 10 }),
    ...(buyingModel === 'unit_based' && { unitCount: 4, costPerUnit: 500, estReachPerUnit: 50000, ctr: ch.ctr, cr: 2.5 }),
  };
}

function createInitialChannels(): ChannelData[] {
  const totalBaseSpend = BASE_CHANNELS_DATA.reduce((sum, ch) => sum + ch.baseSpend, 0);

  return BASE_CHANNELS_DATA.map((ch) => {
    const family = inferChannelFamily(ch.name);
    const buyingModel = inferBuyingModel(ch.name, family);
    const typeConfig = createTypeConfigFromLegacy(ch);

    return {
      id: ch.id,
      name: ch.name,
      category: ch.category,
      allocationPct: (ch.baseSpend / totalBaseSpend) * 100,

      // NEW: Channel type fields
      family,
      buyingModel,
      typeConfig,

      baseCpm: ch.cpm,
      baseCtr: ch.ctr,
      baseCr: 2.5, // Default conversion rate
      baseCpa: null,
      baseRoas: ch.roas,

      overrideCpm: null,
      overrideCtr: null,
      overrideCr: null,
      overrideCpa: null,
      overrideRoas: null,

      impressionMode: (ch.category === 'Paid Social' || ch.id === 'affiliate-listing') ? 'FIXED' as ImpressionMode : 'CPM' as ImpressionMode,
      fixedImpressions: ch.category === 'Paid Social' ? 200000 : 100000,

      locked: false,
    };
  });
}

// ========== CALCULATION FUNCTIONS ==========

function calculateChannelMetrics(
  channel: ChannelData,
  totalBudget: number,
  multipliers: GlobalMultipliers
): CalculatedChannelMetrics {
  // Spend = allocation × budget × spend multiplier
  const spend = (channel.allocationPct / 100) * totalBudget * multipliers.spendMultiplier;

  // Effective values with overrides
  let effectiveCpm = channel.overrideCpm
    ?? (multipliers.defaultCpmOverride && channel.overrideCpm === null ? multipliers.defaultCpmOverride : null)
    ?? channel.baseCpm;

  // CTR with bump, clamped to minimum 0.01%
  const effectiveCtr = Math.max(
    0.01,
    (channel.overrideCtr ?? channel.baseCtr) + multipliers.ctrBump
  );

  const effectiveCr = channel.overrideCr ?? channel.baseCr;

  // Impressions based on mode
  let impressions: number;
  if (channel.impressionMode === 'FIXED') {
    impressions = channel.fixedImpressions;
    // Derive CPM from fixed impressions
    effectiveCpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
  } else {
    impressions = effectiveCpm > 0 ? (spend / effectiveCpm) * 1000 : 0;
  }

  // Clicks and conversions
  const clicks = impressions * (effectiveCtr / 100);
  const conversions = clicks * (effectiveCr / 100);

  // CPA (override or calculated)
  const cpa = channel.overrideCpa
    ?? (conversions > 0 ? spend / conversions : null);

  // ROAS and Revenue
  const effectiveRoas = channel.overrideRoas ?? channel.baseRoas;
  const revenue = spend * effectiveRoas;

  return {
    spend,
    effectiveCpm,
    effectiveCtr,
    effectiveCr,
    impressions,
    clicks,
    conversions,
    cpa,
    revenue,
    roas: effectiveRoas,
  };
}

// ========== STORE DEFINITION ==========

interface MediaPlanState {
  // Core data
  totalBudget: number;
  channels: ChannelData[];
  globalMultipliers: GlobalMultipliers;
  presets: Preset[];

  // Actions - Budget
  setTotalBudget: (value: number) => void;

  // Actions - Channels
  setChannelAllocation: (channelId: string, percentage: number) => void;
  setAllocations: (allocations: Record<string, number>) => void;
  normalizeAllocations: () => void;
  toggleChannelLock: (channelId: string) => void;
  updateChannelOverride: (channelId: string, updates: Partial<ChannelData>) => void;
  setImpressionMode: (channelId: string, mode: ImpressionMode) => void;
  setFixedImpressions: (channelId: string, impressions: number) => void;
  addChannel: (channel: Partial<ChannelData> & { name: string; category: ChannelCategory }) => void;
  deleteChannel: (id: string) => void;
  setChannels: (channels: ChannelData[]) => void;

  // Actions - Channel Types (NEW)
  setChannelType: (channelId: string, family: ChannelFamily, buyingModel: BuyingModel) => void;
  updateChannelTypeConfig: (channelId: string, config: Partial<ChannelTypeConfig>) => void;

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

      // Budget
      setTotalBudget: (value) => set({ totalBudget: Math.max(0, Math.min(10000000, value)) }),

      // Channel allocation
      setChannelAllocation: (channelId, percentage) => {
        set((state) => ({
          channels: state.channels.map((ch) =>
            ch.id === channelId ? { ...ch, allocationPct: Math.max(0, Math.min(100, percentage)) } : ch
          ),
        }));
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
        set((state) => {
          const locked = state.channels.filter((ch) => ch.locked);
          const unlocked = state.channels.filter((ch) => !ch.locked);

          const lockedTotal = locked.reduce((sum, ch) => sum + ch.allocationPct, 0);
          const unlockedTotal = unlocked.reduce((sum, ch) => sum + ch.allocationPct, 0);

          const targetUnlocked = Math.max(0, 100 - lockedTotal);
          const factor = unlockedTotal > 0 ? targetUnlocked / unlockedTotal : 0;

          return {
            channels: state.channels.map((ch) => {
              if (ch.locked) return ch;
              return {
                ...ch,
                allocationPct: Math.max(0, ch.allocationPct * factor),
              };
            }),
          };
        });
      },

      toggleChannelLock: (channelId) => {
        set((state) => ({
          channels: state.channels.map((ch) =>
            ch.id === channelId ? { ...ch, locked: !ch.locked } : ch
          ),
        }));
      },

      updateChannelOverride: (channelId, updates) => {
        set((state) => ({
          channels: state.channels.map((ch) =>
            ch.id === channelId ? { ...ch, ...updates } : ch
          ),
        }));
      },

      setImpressionMode: (channelId, mode) => {
        set((state) => ({
          channels: state.channels.map((ch) =>
            ch.id === channelId ? { ...ch, impressionMode: mode } : ch
          ),
        }));
      },

      setFixedImpressions: (channelId, impressions) => {
        set((state) => ({
          channels: state.channels.map((ch) =>
            ch.id === channelId ? { ...ch, fixedImpressions: Math.max(0, impressions) } : ch
          ),
        }));
      },

      addChannel: (channelData) => {
        set((state) => {
          const id = `channel-${Date.now()}`;
          const family = channelData.family ?? inferChannelFamily(channelData.name);
          const buyingModel = channelData.buyingModel ?? inferBuyingModel(channelData.name, family);

          const newChannel: ChannelData = {
            id,
            name: channelData.name,
            category: channelData.category,
            allocationPct: 5,

            // NEW: Channel type fields
            family,
            buyingModel,
            typeConfig: channelData.typeConfig ?? {
              family,
              buyingModel,
              cpm: channelData.baseCpm ?? 5,
              ctr: channelData.baseCtr ?? 1,
              cr: channelData.baseCr ?? 2.5,
            },

            baseCpm: channelData.baseCpm ?? 5,
            baseCtr: channelData.baseCtr ?? 1,
            baseCr: channelData.baseCr ?? 2.5,
            baseCpa: channelData.baseCpa ?? null,
            baseRoas: channelData.baseRoas ?? 2,
            overrideCpm: channelData.overrideCpm ?? null,
            overrideCtr: channelData.overrideCtr ?? null,
            overrideCr: channelData.overrideCr ?? null,
            overrideCpa: channelData.overrideCpa ?? null,
            overrideRoas: channelData.overrideRoas ?? null,
            impressionMode: channelData.impressionMode ?? 'CPM',
            fixedImpressions: channelData.fixedImpressions ?? 100000,
            locked: false,
          };

          // Normalize to include new channel
          const allChannels = [...state.channels, newChannel];
          const total = allChannels.reduce((sum, ch) => sum + ch.allocationPct, 0);
          const factor = 100 / total;

          return {
            channels: allChannels.map((ch) => ({
              ...ch,
              allocationPct: ch.allocationPct * factor,
            })),
          };
        });
      },

      deleteChannel: (id) => {
        set((state) => {
          const remaining = state.channels.filter((ch) => ch.id !== id);
          if (remaining.length === 0) return state;

          // Re-normalize
          const total = remaining.reduce((sum, ch) => sum + ch.allocationPct, 0);
          const factor = total > 0 ? 100 / total : 1;

          return {
            channels: remaining.map((ch) => ({
              ...ch,
              allocationPct: ch.allocationPct * factor,
            })),
          };
        });
      },

      setChannels: (channels) => {
        set({ channels });
      },

      // Channel Type Actions (NEW)
      setChannelType: (channelId, family, buyingModel) => {
        set((state) => ({
          channels: state.channels.map((ch) =>
            ch.id === channelId
              ? {
                ...ch,
                family,
                buyingModel,
                typeConfig: { ...ch.typeConfig, family, buyingModel }
              }
              : ch
          ),
        }));
      },

      updateChannelTypeConfig: (channelId, config) => {
        set((state) => ({
          channels: state.channels.map((ch) =>
            ch.id === channelId
              ? { ...ch, typeConfig: { ...ch.typeConfig, ...config } }
              : ch
          ),
        }));
      },

      // Multipliers
      setGlobalMultipliers: (updates) => {
        set((state) => ({
          globalMultipliers: { ...state.globalMultipliers, ...updates },
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
        const channelsWithMetrics = state.channels.map((ch) => ({
          ...ch,
          metrics: calculateChannelMetrics(ch, state.totalBudget, state.globalMultipliers),
        }));

        // Find good and bad performers
        const poor: string[] = [];
        const good: string[] = [];

        channelsWithMetrics.forEach((ch) => {
          if (ch.locked) return; // REPAIR 4: Explicitly skip locked channels from being sources/destinations

          const aboveCpa = cpaTarget && ch.metrics.cpa && ch.metrics.cpa > cpaTarget;
          const belowRoas = roasTarget && ch.metrics.roas < roasTarget;

          if (aboveCpa || belowRoas) {
            poor.push(ch.id);
          } else {
            good.push(ch.id);
          }
        });

        if (poor.length === 0 || good.length === 0) return;

        // Shift 10% from poor to good channels
        // REPAIR 4: Respect locked channels
        const shiftAmount = 10 / poor.length;
        const addAmount = (shiftAmount * poor.length) / good.length;

        set({
          channels: state.channels.map((ch) => {
            if (ch.locked) return ch; // Explicitly skip locked channels

            if (poor.includes(ch.id)) {
              return {
                ...ch,
                allocationPct: Math.max(0.5, ch.allocationPct - shiftAmount),
              };
            }
            if (good.includes(ch.id)) {
              return {
                ...ch,
                allocationPct: Math.min(100, ch.allocationPct + addAmount),
              };
            }
            return ch;
          }),
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
          };
        });
      },

      deletePreset: (name) => {
        set((state) => ({
          presets: state.presets.filter((p) => p.name !== name),
        }));
      },

      resetAll: () => {
        // REPAIR 2: Atomic Reset
        localStorage.removeItem('mediaplan-store-v2'); // Match persist name
        set({
          totalBudget: 50000,
          channels: createInitialChannels(),
          globalMultipliers: { ...DEFAULT_MULTIPLIERS },
        });
      },

      applyCategoryMultipliers: (multipliers) => {
        set((state) => {
          // 1. Calculate weighted allocations based on BASE data and multipliers
          const baseTotalSpend = BASE_CHANNELS_DATA.reduce((sum, ch) => sum + ch.baseSpend, 0);

          const newAllocations = state.channels.map(ch => {
            // Find base data for this channel
            const base = BASE_CHANNELS_DATA.find(b => b.id === ch.id);
            if (!base) return { id: ch.id, raw: ch.allocationPct }; // Keep as is if custom/unknown

            const mult = multipliers[base.category] ?? 1.0;
            // Base share * multiplier
            const baseShare = (base.baseSpend / baseTotalSpend) * 100;
            return { id: ch.id, raw: baseShare * mult };
          });

          // 2. Normalize
          const totalRaw = newAllocations.reduce((sum, item) => sum + item.raw, 0);
          const factor = totalRaw > 0 ? 100 / totalRaw : 1;

          return {
            channels: state.channels.map(ch => {
              const newAlloc = newAllocations.find(n => n.id === ch.id);
              return {
                ...ch,
                allocationPct: newAlloc ? newAlloc.raw * factor : ch.allocationPct
              };
            })
          };
        });
      },
    }),
    {
      name: 'mediaplan-store-v2',
      partialize: (state) => ({
        totalBudget: state.totalBudget,
        channels: state.channels,
        globalMultipliers: state.globalMultipliers,
        presets: state.presets,
      }),
      version: 1,
      migrate: (persistedState: any, version) => {
        if (version === 0) {
          // Migration from version 0 to 1
          // Update legacy categories
          const mapping: Record<string, ChannelCategory> = {
            'seo': 'SEO/Content',
            'paid': 'Display/Programmatic',
            'affiliate': 'Affiliate',
            'influencer': 'Paid Social',
          };

          const newChannels = persistedState.channels.map((ch: any) => ({
            ...ch,
            category: mapping[ch.category] || ch.category
          }));

          return { ...persistedState, channels: newChannels };
        }
        return persistedState as MediaPlanState;
      },
    }
  )
);

// ========== SELECTOR HOOKS ==========

export function useChannelsWithMetrics(): ChannelWithMetrics[] {
  const { totalBudget, channels, globalMultipliers } = useMediaPlanStore();
  const { cpaTarget, roasTarget } = globalMultipliers;

  return channels.map((channel) => {
    const metrics = calculateChannelMetrics(channel, totalBudget, globalMultipliers);

    const aboveCpaTarget = !!(cpaTarget && metrics.cpa && metrics.cpa > cpaTarget);
    const belowRoasTarget = !!(roasTarget && metrics.roas < roasTarget);

    // Warnings for legacy compat - use generic symbol (will be formatted by UI)
    const warnings: string[] = [];
    if (aboveCpaTarget) {
      warnings.push(`CPA ${metrics.cpa?.toFixed(0)} exceeds target ${cpaTarget}`);
    }
    if (belowRoasTarget) {
      warnings.push(`ROAS ${metrics.roas.toFixed(1)}x below target ${roasTarget}x`);
    }

    return {
      ...channel,
      metrics,
      aboveCpaTarget,
      belowRoasTarget,
      // Legacy compat
      currentPercentage: channel.allocationPct,
      effectiveCpm: metrics.effectiveCpm,
      effectiveCtr: metrics.effectiveCtr,
      warnings,
    };
  });
}

export function useBlendedMetrics(): BlendedMetrics {
  const { totalBudget, channels, globalMultipliers } = useMediaPlanStore();

  let totalSpend = 0;
  let totalImpressions = 0;
  let totalClicks = 0;
  let totalConversions = 0;
  let totalRevenue = 0;

  channels.forEach((channel) => {
    const metrics = calculateChannelMetrics(channel, totalBudget, globalMultipliers);
    totalSpend += metrics.spend;
    totalImpressions += metrics.impressions;
    totalClicks += metrics.clicks;
    totalConversions += metrics.conversions;
    totalRevenue += metrics.revenue;
  });

  return {
    totalSpend,
    totalImpressions,
    totalClicks,
    totalConversions,
    blendedCpa: totalConversions > 0 ? totalSpend / totalConversions : null,
    projectedRevenue: totalRevenue,
    blendedRoas: totalSpend > 0 ? totalRevenue / totalSpend : 0,
  };
}

export function useCategoryTotals(): Record<string, { spend: number; percentage: number }> {
  const channelsWithMetrics = useChannelsWithMetrics();
  const totals: Record<string, { spend: number; percentage: number }> = {};

  Object.keys(CATEGORY_INFO).forEach((cat) => {
    totals[cat] = { spend: 0, percentage: 0 };
  });

  channelsWithMetrics.forEach((ch) => {
    totals[ch.category].spend += ch.metrics.spend;
    totals[ch.category].percentage += ch.allocationPct;
  });

  return totals;
}

// Legacy Channel type export for compatibility
export type Channel = ChannelData;
