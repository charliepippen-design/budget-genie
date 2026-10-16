import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useMemo } from 'react';
import { ChannelCategory } from '@/lib/mediaplan-data';
import { normalizeAllocations as normalizeAllocationsUtil } from '@/lib/math-utils';
import { calculateScoredAllocation } from '@/lib/distribution-logic';
import { TIER_DEFAULTS } from '@/lib/geo-market-data';
import { industryToVertical } from '@/lib/industries';

import type {
  ChannelData,
  GlobalMultipliers,
  CalculatedChannelMetrics,
  ChannelWithMetrics,
  BlendedMetrics,
  FtdVelocityMetrics,
  GeoMarketProfile,
} from '@/lib/media-plan/types';
import { DEFAULT_MULTIPLIERS, createInitialChannels } from '@/lib/media-plan/defaults';
import { calculateChannelMetricsWithGeo, getGeoMarketProfile } from '@/lib/media-plan/channel-metrics';
import { computePlanSnapshot, computeCategoryTotals, type PlanSnapshot } from '@/lib/media-plan/plan-snapshot';
import type { MediaPlanData, MediaPlanState } from '@/lib/media-plan/state';
import {
  MEDIA_PLAN_STORE_KEY,
  MEDIA_PLAN_STORE_VERSION,
  mergeMediaPlan,
  migrateMediaPlan,
  partializeMediaPlan,
} from '@/lib/media-plan/persistence';
import {
  applyCategoryMultipliersToChannels,
  applyChannelType,
  buildNewChannel,
  buildPreset,
  clampBudget,
  cleanMultiplierUpdates,
  createResetChannels,
  reallocateChannel,
  rebalanceTiers,
  setChannelAllocations,
  stateFromPreset,
  translatePriceForModel,
  updateChannelConfigField,
} from '@/lib/media-plan/actions';
import { computeFtdVelocity } from '@/lib/media-plan/selectors';

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
export type { MediaPlanState, MediaPlanData, MarketSplit } from '@/lib/media-plan/state';
export { getGeoMarketProfile } from '@/lib/media-plan/channel-metrics';
export {
  computePoolAwareSpend,
  computePlanSnapshot,
  getSpendSharePct,
  computeCategoryTotals,
} from '@/lib/media-plan/plan-snapshot';
export type { PlanInputs, PlanSnapshot } from '@/lib/media-plan/plan-snapshot';
export { selectMarketSplit } from '@/lib/media-plan/selectors';

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

const initialData = (): MediaPlanData => ({
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
  observedLtv: { m1: null, m3: null, m6: null },
  subscriptionTier: 'free',
  userStatus: 'demo',
  isGenieOpen: true,
  hasCompletedOnboarding: false,
  onboardingVertical: null,
  onboardingSubvertical: null,
  brief: null,
  planRationale: [],
  planWarnings: [],
});

export const useMediaPlanStore = create<MediaPlanState>()(
  persist(
    (set, get) => ({
      ...initialData(),

      applyGeneratedPlan: (plan) => {
        // No undo snapshot here: the wizard and onboarding use this too. AI tool applies
        // snapshot themselves (planner-agent).
        set((state) => ({
          brief: plan.brief,
          totalBudget: clampBudget(plan.totalBudget),
          channels: JSON.parse(JSON.stringify(plan.channels)),
          globalMultipliers: { ...state.globalMultipliers, ...plan.multipliers },
          activeGeos: plan.geo.activeGeos,
          activeTiers: { ...plan.geo.activeTiers },
          // Overrides belong to the old markets and ghost/drag values to the old budget:
          // left behind they skew or dim the new headline numbers.
          geoOverrides: {},
          isBudgetDragging: false,
          budgetDragBaselineRevenue: null,
          budgetDragBaselineRoas: null,
          ghostProjectedRevenue: null,
          onboardingVertical: industryToVertical(plan.brief.industry),
          planRationale: plan.rationale,
          planWarnings: plan.warnings,
        }));
      },

      // Budget
      setTotalBudget: (value) => set({ totalBudget: clampBudget(value) }),
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
      setTierAllocation: (tier, nextValue) =>
        set((state) => ({ activeTiers: rebalanceTiers(state.activeTiers, tier, nextValue) })),
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
      clearObservedLtv: () => set({ observedLtv: { m1: null, m3: null, m6: null } }),
      setSubscriptionTier: (tier) => set({ subscriptionTier: tier }),
      setUserStatus: (status) => set({ userStatus: status }),
      setIsGenieOpen: (open) => set({ isGenieOpen: open }),
      setHasCompletedOnboarding: (value) => set({ hasCompletedOnboarding: value }),
      setOnboardingVertical: (v) => set({ onboardingVertical: v }),
      setOnboardingSubvertical: (v) => set({ onboardingSubvertical: v }),

      // Channel allocation
      setChannelAllocation: (channelId, percentage) =>
        set((state) => ({ channels: reallocateChannel(state.channels, channelId, percentage) })),

      setAllocations: (allocations) =>
        set((state) => ({ channels: setChannelAllocations(state.channels, allocations) })),

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

      updateChannelTypeConfig: (channelId, config) => {
        set((state) => ({
          channels: state.channels.map((ch) =>
            ch.id === channelId ? { ...ch, typeConfig: { ...ch.typeConfig, ...config } } : ch
          ),
        }));
      },

      updateChannelConfigField: (channelId, field, value) =>
        set((state) => ({
          channels: updateChannelConfigField(state.channels, channelId, field, value),
        })),

      addChannel: (channelData) => {
        set((state) => ({
          // Normalize to include new channel
          channels: normalizeAllocationsUtil([...state.channels, buildNewChannel(channelData)]),
        }));
      },

      deleteChannel: (id) => {
        set((state) => {
          const remaining = state.channels.filter((ch) => ch.id !== id);
          if (remaining.length === 0) return state;
          return { channels: normalizeAllocationsUtil(remaining) };
        });
      },

      setChannels: (channels) => set({ channels }),

      setChannelType: (channelId, family, buyingModel) => {
        const current = computePlanSnapshot(get()).channels.find((c) => c.id === channelId);
        const price = translatePriceForModel(current, buyingModel);
        set((state) => ({
          channels: applyChannelType(state.channels, channelId, family, buyingModel, price),
        }));
      },

      // Multipliers
      setGlobalMultipliers: (updates) => {
        const clean = cleanMultiplierUpdates(updates);
        set((state) => ({
          globalMultipliers: { ...state.globalMultipliers, ...clean },
        }));
      },

      resetGlobalMultipliers: () => set({ globalMultipliers: { ...DEFAULT_MULTIPLIERS } }),

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
          })) as ChannelWithMetrics[];

        if (channelsWithMetrics.length === 0) return;

        // Calculate new allocations based on weighted scoring
        const newAllocations = calculateScoredAllocation(channelsWithMetrics, cpaTarget, roasTarget);

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
        set((state) => ({
          presets: [...state.presets.filter((p) => p.name !== presetName), buildPreset(state, presetName)],
        }));
      },

      loadPreset: (name) => {
        set((state) => {
          const preset = state.presets.find((p) => p.name === name);
          if (!preset) return state;
          return stateFromPreset(preset);
        });
      },

      deletePreset: (name) => {
        set((state) => ({
          presets: state.presets.filter((p) => p.name !== name),
        }));
      },

      resetAll: () => {
        // "Reset to Zero": keep a channel structure so users don't have to re-add everything,
        // but zero out the budget and targets.
        localStorage.removeItem(MEDIA_PLAN_STORE_KEY);
        set({
          totalBudget: 0,
          channels: createResetChannels(),
          globalMultipliers: {
            ...DEFAULT_MULTIPLIERS,
            cpaTarget: null,
            roasTarget: null,
          },
          activeTiers: { ...TIER_DEFAULTS },
          activeGeos: [],
          geoOverrides: {},
          observedLtv: { m1: null, m3: null, m6: null },
          onboardingSubvertical: null,
          brief: null,
          planRationale: [],
          planWarnings: [],
        });
      },

      applyCategoryMultipliers: (multipliers) =>
        set((state) => ({
          channels: applyCategoryMultipliersToChannels(state.channels, multipliers),
        })),

      restoreState: (snapshot) => {
        set((state) => ({
          ...state,
          ...snapshot,
        }));
      },
    }),
    {
      name: MEDIA_PLAN_STORE_KEY,
      partialize: (state) => partializeMediaPlan(state),
      version: MEDIA_PLAN_STORE_VERSION,
      // Only valid saved fields are restored; anything malformed keeps the defaults.
      merge: (persisted, current) => mergeMediaPlan(persisted, current),
      migrate: migrateMediaPlan,
    }
  )
);

// ========== SELECTOR HOOKS ==========

/** The engine snapshot for the live plan (channels, blended totals, over-budget flag). */
export function usePlanSnapshot(): PlanSnapshot {
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

  return useMemo(
    () => computeFtdVelocity(channelsWithMetrics, vertical, globalMultipliers),
    [channelsWithMetrics, globalMultipliers, vertical]
  );
}

export type Channel = ChannelData;
