import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useMemo } from 'react';
import { snapshotPlanBeforeApply } from '@/lib/crash-recovery';
import { ChannelCategory } from '@/lib/mediaplan-data';
import {
  ChannelFamily,
  BuyingModel,
  ChannelTypeConfig,
  FAMILY_INFO,
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

import {
  GLOBAL_BUDGET_CAP,
  MIN_BUDGET_CAP,
} from '@/lib/media-plan/constants';
import type {
  ChannelData,
  GlobalMultipliers,
  CalculatedChannelMetrics,
  ChannelWithMetrics,
  BlendedMetrics,
  FtdVelocityMetrics,
  GeoAllocationState,
  GeoMarketProfile,
  GeoMarketOverride,
  ObservedLtvInputs,
  Preset,
  SubscriptionTier,
  UserStatus,
} from '@/lib/media-plan/types';
import {
  BASE_CHANNELS_DATA,
  DEFAULT_MULTIPLIERS,
  createInitialChannels,
} from '@/lib/media-plan/defaults';
import { calculateChannelMetricsWithGeo, getGeoMarketProfile } from '@/lib/media-plan/channel-metrics';
import { isFixedCostChannel, computePlanSnapshot, computeCategoryTotals } from '@/lib/media-plan/plan-snapshot';

export type { ChannelCategory };

export { GLOBAL_BUDGET_CAP, MIN_BUDGET_CAP } from '@/lib/media-plan/constants';
export type {
  ImpressionMode,
  SubscriptionTier,
  UserStatus,
  ChannelData,
  GlobalMultipliers,
  CalculatedChannelMetrics,
  ChannelWithMetrics,
  BlendedMetrics,
  FtdVelocityMetrics,
  GeoAllocationState,
  GeoMarketProfile,
  GeoMarketOverride,
  ObservedLtvInputs,
  Preset,
} from '@/lib/media-plan/types';
export { getGeoMarketProfile } from '@/lib/media-plan/channel-metrics';
export {
  computePoolAwareSpend,
  computePlanSnapshot,
  getSpendSharePct,
  computeCategoryTotals,
} from '@/lib/media-plan/plan-snapshot';
export type { PlanInputs } from '@/lib/media-plan/plan-snapshot';

/**
 * Same as `calculateChannelMetricsWithGeo`, but when no geo profile is passed it is
 * resolved from the live store state.
 */
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
  const resolvedGeoProfile =
    geoProfile ??
    getGeoMarketProfile(
      useMediaPlanStore.getState().activeTiers,
      useMediaPlanStore.getState().activeGeos,
      useMediaPlanStore.getState().geoOverrides
    );
  return calculateChannelMetricsWithGeo(
    channel,
    totalBudget,
    multipliers,
    spendOverride,
    resolvedGeoProfile
  );
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

      applyGeneratedPlan: (plan) => {
        // Keep the previous plan so a crash screen can offer "Undo last AI plan change".
        snapshotPlanBeforeApply();
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
        }));
      },

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
        const presetName = name.trim();
        if (!presetName) return;
        set((state) => {
          const preset: Preset = {
            name: presetName,
            totalBudget: state.totalBudget,
            channels: JSON.parse(JSON.stringify(state.channels)),
            globalMultipliers: { ...state.globalMultipliers },
            activeTiers: { ...state.activeTiers },
            activeGeos: [...state.activeGeos],
            geoOverrides: JSON.parse(JSON.stringify(state.geoOverrides)),
            observedLtv: { ...state.observedLtv },
          };

          const existing = state.presets.filter((p) => p.name !== presetName);
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
            globalMultipliers: { ...DEFAULT_MULTIPLIERS, ...preset.globalMultipliers },
            activeTiers: { ...TIER_DEFAULTS, ...(preset.activeTiers ?? {}) },
            activeGeos: [...(preset.activeGeos ?? [])],
            geoOverrides: JSON.parse(JSON.stringify(preset.geoOverrides ?? {})),
            observedLtv: { m1: null, m3: null, m6: null, ...(preset.observedLtv ?? {}) },
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
