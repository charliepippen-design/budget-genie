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
import { normalizeAllocations as normalizeAllocationsUtil } from '@/lib/math-utils';
import { calculateScoredAllocation } from '@/lib/distribution-logic';
import { calculatePlanMetrics, calculateSingleChannelMetrics, PlanAllocationResult } from '@/lib/plan-math';
import type { PlanBrief, GeneratedPlan, ChannelRationale } from '@/lib/plan-generator';

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
}

export interface CalculatedChannelMetrics {
  spend: number;
  impressions: number;
  clicks: number;
  registrations: number;
  conversions: number; // FTDs
  cpl: number | null;  // Cost Per Lead / Registration
  cpa: number | null;  // Cost Per Acquisition / FTD
  revenue: number;
  roas: number;
  // Effective rates for display
  effectivePrice: number;
  effectiveCtr: number;
  effectiveCr: number;
  clickToReg?: number;
  regToFtd?: number;
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
  totalRegistrations: number;
  totalConversions: number; // FTDs
  blendedCpl: number | null;
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
  // SEO & Content (High LTV players: €260-€300)
  { 
    id: 'seo-tech', 
    name: 'SEO - Tech Audit & On-Page', 
    category: 'SEO/Content' as ChannelCategory, 
    baseSpend: 500, 
    cpm: 2.5, 
    ctr: 0.8, 
    clickToReg: 7.0, 
    regToFtd: 15.0, 
    trafficPerUnit: 350, 
    expectedLtv: 300, 
    roas: 3.2 
  },
  { 
    id: 'seo-content', 
    name: 'SEO - Content Production', 
    category: 'SEO/Content' as ChannelCategory, 
    baseSpend: 1500, 
    cpm: 1.8, 
    ctr: 1.2, 
    clickToReg: 8.0, 
    regToFtd: 18.0, 
    trafficPerUnit: 2000, 
    expectedLtv: 280, 
    roas: 4.5 
  },
  { 
    id: 'seo-backlinks', 
    name: 'SEO - Backlinks / Guest Posts', 
    category: 'SEO/Content' as ChannelCategory, 
    baseSpend: 1000, 
    cpm: 3.5, 
    ctr: 0.5, 
    clickToReg: 6.0, 
    regToFtd: 20.0, 
    trafficPerUnit: 1000, 
    expectedLtv: 260, 
    roas: 2.8 
  },

  // Paid Media (Display / Push / Native / Retargeting)
  { 
    id: 'paid-native', 
    name: 'Paid - Native Ads (Adult/Crypto)', 
    category: 'Display/Programmatic' as ChannelCategory, 
    baseSpend: 2500, 
    cpm: 3.8, 
    ctr: 0.45, 
    clickToReg: 3.0, 
    regToFtd: 5.0, 
    expectedLtv: 140, 
    roas: 2.5 
  },
  { 
    id: 'paid-push', 
    name: 'Paid - Push Notifications', 
    category: 'Display/Programmatic' as ChannelCategory, 
    baseSpend: 1500, 
    cpm: 1.5, 
    ctr: 1.2, 
    clickToReg: 2.5, 
    regToFtd: 4.0, 
    expectedLtv: 120, 
    roas: 1.2 
  },
  { 
    id: 'paid-programmatic', 
    name: 'Paid - Programmatic / Display', 
    category: 'Display/Programmatic' as ChannelCategory, 
    baseSpend: 1000, 
    cpm: 5.5, 
    ctr: 0.25, 
    clickToReg: 4.0, 
    regToFtd: 8.0, 
    expectedLtv: 150, 
    roas: 1.5 
  },
  { 
    id: 'paid-retargeting', 
    name: 'Paid - Retargeting (Pixel)', 
    category: 'Display/Programmatic' as ChannelCategory, 
    baseSpend: 500, 
    cpm: 7.5, 
    ctr: 1.5, 
    clickToReg: 8.0, 
    regToFtd: 15.0, 
    expectedLtv: 180, 
    roas: 3.8 
  },

  // Affiliates
  { 
    id: 'affiliate-listing', 
    name: 'Affiliate - Listing Fees (Fixed)', 
    category: 'Affiliate' as ChannelCategory, 
    baseSpend: 1000, 
    cpm: 15.0, 
    ctr: 3.5, 
    clickToReg: 12.0, 
    regToFtd: 20.0, 
    trafficPerUnit: 800, 
    expectedLtv: 160, 
    roas: 2.0 
  },
  { 
    id: 'affiliate-cpa', 
    name: 'Affiliate - CPA Commissions', 
    category: 'Affiliate' as ChannelCategory, 
    baseSpend: 8500, 
    cpm: 25.0, 
    ctr: 4.2, 
    clickToReg: 8.0, 
    regToFtd: 25.0, 
    expectedLtv: 150, 
    roas: 3.0 
  },

  // Influencers
  { 
    id: 'influencer-retainers', 
    name: 'Influencer - Monthly Retainers', 
    category: 'Paid Social' as ChannelCategory, 
    baseSpend: 2000, 
    cpm: 12.0, 
    ctr: 1.5, 
    clickToReg: 5.0, 
    regToFtd: 12.0, 
    trafficPerUnit: 3000, 
    expectedLtv: 180, 
    roas: 2.2 
  },
  { 
    id: 'influencer-funds', 
    name: 'Influencer - Play Funds (Bal)', 
    category: 'Paid Social' as ChannelCategory, 
    baseSpend: 1500, 
    cpm: 10.0, 
    ctr: 2.0, 
    clickToReg: 6.0, 
    regToFtd: 14.0, 
    trafficPerUnit: 2200, 
    expectedLtv: 170, 
    roas: 2.5 
  },
];

export const GLOBAL_BUDGET_CAP = 1000000;
export const MIN_BUDGET_CAP = 5000;

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
    case 'CPC': price = ch.cpm / 10; break;
    case 'CPA': price = 50; break;
    case 'FLAT_FEE': price = ch.baseSpend; break;
    case 'RETAINER': price = ch.baseSpend; break;
    default: price = ch.cpm;
  }

  const clickToReg = ch.clickToReg ?? 6;
  const regToFtd = ch.regToFtd ?? 15;
  const conversionRate = (clickToReg * regToFtd) / 100;
  const expectedLtv = ch.expectedLtv ?? 150;

  return {
    family,
    buyingModel,
    price,
    secondaryPrice,
    baselineMetrics: {
      ctr: ch.ctr,
      clickToReg,
      regToFtd,
      conversionRate,
      aov: expectedLtv,
      expectedLtv,
      trafficPerUnit: ch.trafficPerUnit ?? (buyingModel === 'RETAINER' || buyingModel === 'FLAT_FEE' ? Math.round(ch.baseSpend * 1.5) : undefined),
      saturationCeiling: ch.baseSpend * 4
    }
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
  multipliers: GlobalMultipliers
): CalculatedChannelMetrics {
  const safeMultipliers = multipliers || DEFAULT_MULTIPLIERS;
  const isFixed = channel.tier === 'fixed' || channel.buyingModel === 'FLAT_FEE' || channel.buyingModel === 'RETAINER';
  const spend = isFixed
    ? (channel.typeConfig?.price || 0)
    : ((channel.allocationPct || 0) / 100) * totalBudget * (safeMultipliers.spendMultiplier || 1);
  return calculateSingleChannelMetrics(channel, spend, safeMultipliers);
}

// ========== STORE DEFINITION ==========

export interface MediaPlanState {
  // Core data
  totalBudget: number;
  channels: ChannelData[];
  globalMultipliers: GlobalMultipliers;
  presets: Preset[];

  // AI planner output
  brief: PlanBrief | null;
  planRationale: ChannelRationale[];
  planWarnings: string[];
  applyGeneratedPlan: (plan: GeneratedPlan) => void;
  projectName: string;
  setProjectName: (name: string) => void;

  // Auth / Tier Faking for Local Dev Check
  devDeityMode: boolean;
  toggleDevDeityMode: () => void;
  setDevDeityMode: (val: boolean) => void;

  // Actions - Budget
  setTotalBudget: (value: number) => void;

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
  updateChannelConfigField: (channelId: string, field: keyof ChannelTypeConfig | 'baselineMetrics', value: string | number | boolean | Record<string, any>) => void;

  // Actions - Multipliers
  setGlobalMultipliers: (updates: Partial<GlobalMultipliers>) => void;
  resetGlobalMultipliers: () => void;

  // Actions - Rebalance
  rebalanceToTargets: () => void;
  applyArbitrageRebalance: () => void;

  // Actions - Presets
  savePreset: (name: string) => void;
  loadPreset: (name: string) => void;
  deletePreset: (name: string) => void;

  // Actions - Reset
  resetAll: () => void;

  // Actions - Bulk
  applyCategoryMultipliers: (multipliers: Record<string, number>) => void;

  // Actions - DB Sync
  hydrateFromDB: (configData: Partial<MediaPlanState>) => void;
}

export const useMediaPlanStore = create<MediaPlanState>()(
  persist(
    (set, get) => ({
      // Initial state
      totalBudget: 50000,
      channels: createInitialChannels(),
      globalMultipliers: { ...DEFAULT_MULTIPLIERS },
      presets: [],
      brief: null,
      planRationale: [],
      planWarnings: [],
      projectName: "New Media Plan",
      devDeityMode: true,

      setProjectName: (name) => set({ projectName: name }),

      applyGeneratedPlan: (plan) => set((state) => ({
        brief: plan.brief,
        totalBudget: Math.max(MIN_BUDGET_CAP, Math.min(GLOBAL_BUDGET_CAP, plan.totalBudget)),
        channels: JSON.parse(JSON.stringify(plan.channels)),
        globalMultipliers: { ...state.globalMultipliers, ...plan.multipliers },
        planRationale: plan.rationale,
        planWarnings: plan.warnings,
      })),
      toggleDevDeityMode: () => set(state => ({ devDeityMode: !state.devDeityMode })),
      setDevDeityMode: (val) => set({ devDeityMode: val }),

      // DB Sync
      hydrateFromDB: (configData) => {
        set((state) => ({ ...state, ...configData }));
      },

      // Budget
      setTotalBudget: (value) => set({ totalBudget: Math.max(MIN_BUDGET_CAP, Math.min(GLOBAL_BUDGET_CAP, value)) }),

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
        set((state) => ({
          channels: normalizeAllocationsUtil(state.channels)
        }));
      },

      toggleChannelActive: (channelId) => {
        set((state) => {
          const newChannels = state.channels.map((ch) =>
            ch.id === channelId ? { ...ch, isActive: !ch.isActive } : ch
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
                  baselineMetrics: { ...ch.typeConfig.baselineMetrics, ...(value as any) }
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
              baselineMetrics: {
                ctr: 1,
                conversionRate: 2.5,
                saturationCeiling: 50000 // Default for new manual channels
              }
            },

            tier: (likelyModel === 'RETAINER' || likelyModel === 'FLAT_FEE') ? 'fixed' : 'scalable',
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
          aboveCpaTarget: false, // Not needed for calculation but fitting the type
          belowRoasTarget: false
        })) as ChannelWithMetrics[]; // Casting mainly because we don't need the boolean flags for the calc

        // Calculate new allocations based on weighted scoring
        const newAllocations = calculateScoredAllocation(channelsWithMetrics, cpaTarget, roasTarget);

        set({
          channels: state.channels.map((ch) => {
            if (ch.locked) return ch;
            // Apply new allocation if calculated
            if (newAllocations[ch.id] !== undefined) {
              return { ...ch, allocationPct: newAllocations[ch.id] };
            }
            return ch;
          }),
        });

        // Ensure normalization maintains 100% total
        get().normalizeAllocations();
      },

      // iGaming arbitrage: drain bleeding (lowest ROAS) by up to 20% and reallocate to highest ROAS
      applyArbitrageRebalance: () => {
        const state = get();
        const activeCandidates = state.channels
          .filter((ch) => ch.isActive && !ch.locked)
          .map((ch) => ({
            ...ch,
            metrics: calculateChannelMetrics(ch, state.totalBudget, state.globalMultipliers),
          }));

        if (activeCandidates.length < 2) return;

        const bleeding = activeCandidates.reduce((worst, current) =>
          current.metrics.roas < worst.metrics.roas ? current : worst
        );

        const best = activeCandidates.reduce((top, current) =>
          current.metrics.roas > top.metrics.roas ? current : top
        );

        if (bleeding.id === best.id) return;

        const siphonPct = Math.min(bleeding.allocationPct * 0.2, bleeding.allocationPct);
        if (siphonPct <= 0) return;

        set({
          channels: state.channels.map((ch) => {
            if (ch.id === bleeding.id) {
              return {
                ...ch,
                allocationPct: Math.max(0, ch.allocationPct - siphonPct),
              };
            }
            if (ch.id === best.id) {
              return {
                ...ch,
                allocationPct: Math.min(100, ch.allocationPct + siphonPct),
              };
            }
            return ch;
          }),
        });

        // Keep total normalized after rebalance.
        get().normalizeAllocations();
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
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem('mediaplan-store-v2');
          }
        } catch {
          // ignore in environments without localStorage
        }

        set({
          totalBudget: 50000,
          channels: createInitialChannels(),
          globalMultipliers: {
            ...DEFAULT_MULTIPLIERS,
            cpaTarget: null,
            roasTarget: null
          },
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

      restoreState: (snapshot) => {
        set((state) => ({
          ...state,
          ...snapshot
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
        brief: state.brief,
        planRationale: state.planRationale,
        planWarnings: state.planWarnings,
      }),
      version: 3, // Increment version to force migration/reset
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
        // Migration to v3 for isActive
        if (version < 3) {
          return {
            ...persistedState,
            channels: (persistedState as any).channels.map((ch: any) => ({
              ...ch,
              isActive: true
            }))
          } as MediaPlanState;
        }
        return persistedState as MediaPlanState;
      },
    }
  )
);

// ========== SELECTOR HOOKS ==========

export function usePlanMetrics(): PlanAllocationResult {
  const { totalBudget, channels, globalMultipliers } = useMediaPlanStore();
  const safeChannels = Array.isArray(channels) ? channels : [];
  return calculatePlanMetrics(safeChannels, totalBudget, globalMultipliers);
}

export function useChannelsWithMetrics(): ChannelWithMetrics[] {
  return usePlanMetrics().channelsWithMetrics;
}

export function useBlendedMetrics(): BlendedMetrics {
  return usePlanMetrics().blendedMetrics;
}

export function useCategoryTotals(): Record<string, { spend: number; percentage: number }> {
  return usePlanMetrics().categoryTotals;
}

export type Channel = ChannelData;
