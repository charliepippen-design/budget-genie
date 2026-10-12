import { describe, expect, it } from 'vitest';
import * as store from '@/hooks/use-media-plan-store';

// Guards the re-export surface of the store entry point during the split.
// Types are erased at runtime; the type-only imports below are checked by tsc.
import type {
  BlendedMetrics,
  CalculatedChannelMetrics,
  Channel,
  ChannelCategory,
  ChannelData,
  ChannelWithMetrics,
  FtdVelocityMetrics,
  GeoAllocationState,
  GeoMarketOverride,
  GeoMarketProfile,
  GlobalMultipliers,
  ImpressionMode,
  MediaPlanState,
  ObservedLtvInputs,
  PlanInputs,
  Preset,
  SubscriptionTier,
  UserStatus,
} from '@/hooks/use-media-plan-store';

export type TypeSurface = [
  BlendedMetrics,
  CalculatedChannelMetrics,
  Channel,
  ChannelCategory,
  ChannelData,
  ChannelWithMetrics,
  FtdVelocityMetrics,
  GeoAllocationState,
  GeoMarketOverride,
  GeoMarketProfile,
  GlobalMultipliers,
  ImpressionMode,
  MediaPlanState,
  ObservedLtvInputs,
  PlanInputs,
  Preset,
  SubscriptionTier,
  UserStatus,
];

describe('use-media-plan-store public API', () => {
  it('exports every runtime function', () => {
    const functions = [
      'calculateChannelMetrics',
      'getGeoMarketProfile',
      'computePoolAwareSpend',
      'computePlanSnapshot',
      'useChannelsWithMetrics',
      'useBlendedMetrics',
      'useGeoMarketProfile',
      'getSpendSharePct',
      'computeCategoryTotals',
      'useCategoryTotals',
      'useFtdVelocityMetrics',
    ] as const;
    for (const name of functions) {
      expect(typeof store[name], name).toBe('function');
    }
  });

  it('exports the store hook with persist api', () => {
    expect(typeof store.useMediaPlanStore).toBe('function');
    expect(typeof store.useMediaPlanStore.getState).toBe('function');
    expect(typeof store.useMediaPlanStore.persist.getOptions).toBe('function');
  });

  it('exports the budget cap constants', () => {
    expect(typeof store.GLOBAL_BUDGET_CAP).toBe('number');
    expect(typeof store.MIN_BUDGET_CAP).toBe('number');
    expect(store.GLOBAL_BUDGET_CAP).toBe(1000000);
    expect(store.MIN_BUDGET_CAP).toBe(1000);
  });

  it('exposes no unexpected runtime exports', () => {
    expect(Object.keys(store).sort()).toEqual([
      'GLOBAL_BUDGET_CAP',
      'MIN_BUDGET_CAP',
      'calculateChannelMetrics',
      'computeCategoryTotals',
      'computePlanSnapshot',
      'computePoolAwareSpend',
      'getGeoMarketProfile',
      'getSpendSharePct',
      'selectMarketSplit',
      'useBlendedMetrics',
      'useCategoryTotals',
      'useChannelsWithMetrics',
      'useFtdVelocityMetrics',
      'useGeoMarketProfile',
      'useMediaPlanStore',
    ]);
  });
});
