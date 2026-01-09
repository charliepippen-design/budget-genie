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
  inferBuyingModel,
  getLikelyModel
} from '@/types/channel';

// ========== DATA MODEL ==========

export type ImpressionMode = 'CPM' | 'FIXED';

export interface ChannelData {
  id: string;
  name: string;
  category: ChannelCategory;
  allocationPct: number;

  // Polymorphic configuration
  family: ChannelFamily;
  buyingModel: BuyingModel;
  typeConfig: ChannelTypeConfig;

  // UI State / Meta
  locked: boolean;
  warnings?: string[];
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

  let price = 0;
  let secondaryPrice = 0;

  // Map legacy values to new Price field
  switch (buyingModel) {
    case 'CPM': price = ch.cpm; break;
    case 'CPC': price = ch.cpm / 10; break; // Rough est
    case 'CPA': price = 50; break; // Default CPA
    case 'FLAT_FEE': price = ch.baseSpend; break;
    case 'RETAINER': price = ch.baseSpend; break;
    default: price = ch.cpm;
  }

  return {
    family,
    buyingModel,
    price,
    secondaryPrice,
    baselineMetrics: {
      ctr: ch.ctr,
      conversionRate: 2.5,
      aov: 150,
      trafficPerUnit: 1000
    }
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

      family,
      buyingModel,
      typeConfig,

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

  // Apply Multipliers to Config
  // 1. CTR Bump
  const effectiveCtr = Math.max(0.01, (channel.typeConfig.baselineMetrics.ctr || 1) + multipliers.ctrBump);

  // 2. Global CPM Override (Only if model is CPM? Or apply broadly?)
  // If global CPM override is set, and we are in CPM mode, use it.
  // But 'price' is polymorphic. 
  // Let's only apply if model is CPM.
  let effectivePrice = channel.typeConfig.price;
  if (channel.buyingModel === 'CPM' && multipliers.defaultCpmOverride) {
    effectivePrice = multipliers.defaultCpmOverride;
  }

  // Construct effective config
  const effectiveConfig: ChannelTypeConfig = {
    ...channel.typeConfig,
    price: effectivePrice,
    baselineMetrics: {
      ...channel.typeConfig.baselineMetrics,
      ctr: effectiveCtr
    }
  };

  const unified = calculateUnifiedMetrics(effectiveConfig, spend, multipliers.playerValue);

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

  addChannel: (channel: Partial<ChannelData> & { name: string; category: ChannelCategory }) => void;
  deleteChannel: (id: string) => void;
  setChannels: (channels: ChannelData[]) => void;

  // Actions - Channel Types (NEW)
  setChannelType: (channelId: string, family: ChannelFamily, buyingModel: BuyingModel) => void;
  updateChannelTypeConfig: (channelId: string, config: Partial<ChannelTypeConfig>) => void;

  // New Action for polymorphic updates
  updateChannelConfigField: (channelId: string, field: keyof ChannelTypeConfig | 'baselineMetrics', value: any) => void;

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

      // Replaced updateChannelOverride with specific config updates
      updateChannelTypeConfig: (channelId, config) => {
        set((state) => ({
          channels: state.channels.map((ch) =>
            ch.id === channelId
              ? { ...ch, typeConfig: { ...ch.typeConfig, ...config } }
              : ch
          ),
        }));
      },

      updateChannelConfigField: (channelId, field, value) => {
        set((state) => ({
          channels: state.channels.map((ch) => {
            if (ch.id !== channelId) return ch;

            if (field === 'baselineMetrics') {
              return {
                ...ch,
                typeConfig: {
                  ...ch.typeConfig,
                  baselineMetrics: { ...ch.typeConfig.baselineMetrics, ...value }
                }
              };
            }

            return {
              ...ch,
              typeConfig: { ...ch.typeConfig, [field]: value }
            };
          }),
        }));
      },

      addChannel: (channelData) => {
        set((state) => {
          const id = `channel-${Date.now()}`;
          const family = channelData.family ?? inferChannelFamily(channelData.name);
          // Auto-sensing defaults
          const likelyModel = getLikelyModel(channelData.category);
          const buyingModel = channelData.buyingModel ?? likelyModel;

          const newChannel: ChannelData = {
            id,
            name: channelData.name,
            category: channelData.category,
            allocationPct: 5,
            family,
            buyingModel,
            typeConfig: channelData.typeConfig ?? {
              family,
              buyingModel,
              price: 5,
              baselineMetrics: { ctr: 1, conversionRate: 2.5 }
            },
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
          if (ch.locked) return;

          const aboveCpa = cpaTarget && ch.metrics.cpa && ch.metrics.cpa > cpaTarget;
          const belowRoas = roasTarget && ch.metrics.roas < roasTarget;

          if (aboveCpa || belowRoas) {
            poor.push(ch.id);
          } else {
            good.push(ch.id);
          }
        });

        if (poor.length === 0 || good.length === 0) return;

        const shiftAmount = 10 / poor.length;
        const addAmount = (shiftAmount * poor.length) / good.length;

        set({
          channels: state.channels.map((ch) => {
            if (ch.locked) return ch;

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
        const DEFAULT_CHANNELS_DATA = [
          {
            id: '1', name: 'Paid Search', category: 'Paid Search',
            buyingModel: 'CPC', price: 2.50, allocation: 20,
            baselineMetrics: { conversionRate: 3.5, ctr: 2.0 }, isLocked: false
          },
          {
            id: '2', name: 'Facebook Ads', category: 'Paid Social',
            buyingModel: 'CPM', price: 12.00, allocation: 30,
            baselineMetrics: { ctr: 1.2, conversionRate: 1.5 }, isLocked: false
          },
          {
            id: '3', name: 'Affiliates', category: 'Affiliate',
            buyingModel: 'CPA', price: 45.00, allocation: 15,
            baselineMetrics: { conversionRate: 5.0 }, isLocked: false
          },
          {
            id: '4', name: 'Display / Programmatic', category: 'Display/Programmatic',
            buyingModel: 'CPM', price: 4.50, allocation: 15,
            baselineMetrics: { ctr: 0.8, conversionRate: 0.5 }, isLocked: false
          },
          {
            id: '5', name: 'SEO Content', category: 'SEO/Content',
            buyingModel: 'FLAT_FEE', price: 2000, allocation: 20,
            baselineMetrics: { trafficPerUnit: 5000, conversionRate: 1.8 }, isLocked: false
          }
        ];

        // Map to Schema
        const newChannels: ChannelData[] = DEFAULT_CHANNELS_DATA.map(d => {
          const family = inferChannelFamily(d.name);
          return {
            id: d.id,
            name: d.name,
            category: d.category as ChannelCategory,
            allocationPct: d.allocation,
            family,
            buyingModel: d.buyingModel as BuyingModel,
            typeConfig: {
              family,
              buyingModel: d.buyingModel as BuyingModel,
              price: d.price,
              baselineMetrics: d.baselineMetrics,
              secondaryPrice: 0
            },
            locked: d.isLocked
          };
        });

        localStorage.removeItem('mediaplan-store-v2');
        set({
          totalBudget: 50000,
          channels: newChannels,
          globalMultipliers: { ...DEFAULT_MULTIPLIERS },
        });
      },

      applyCategoryMultipliers: (multipliers) => {
        set((state) => {
          const baseTotalSpend = BASE_CHANNELS_DATA.reduce((sum, ch) => sum + ch.baseSpend, 0);

          const newAllocations = state.channels.map(ch => {
            const base = BASE_CHANNELS_DATA.find(b => b.id === ch.id);
            if (!base) return { id: ch.id, raw: ch.allocationPct };

            const mult = multipliers[base.category] ?? 1.0;
            const baseShare = (base.baseSpend / baseTotalSpend) * 100;
            return { id: ch.id, raw: baseShare * mult };
          });

          // Normalize
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
      version: 2, // Increment version to force migration/reset
      migrate: (persistedState: any, version) => {
        if (version < 2) {
          // Hard reset for version 2 (Types totally changed)
          return {
            totalBudget: 50000,
            channels: createInitialChannels(),
            globalMultipliers: { ...DEFAULT_MULTIPLIERS },
            presets: []
          } as MediaPlanState;
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

    return {
      ...channel,
      metrics,
      aboveCpaTarget,
      belowRoasTarget,
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

export type Channel = ChannelData;
