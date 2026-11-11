import { useMemo, useSyncExternalStore } from 'react';
import { useMediaPlanStore } from '@/hooks/use-media-plan-store';
import type { MediaPlanData } from '@/lib/media-plan/state';
import type { EngineInput, EngineResult } from './contract';
import { getEngine, subscribeEngine } from './registry';

type EngineSource = Pick<
  MediaPlanData,
  | 'totalBudget'
  | 'channels'
  | 'globalMultipliers'
  | 'activeTiers'
  | 'activeGeos'
  | 'geoOverrides'
  | 'onboardingVertical'
  | 'observedLtv'
>;

/** Maps the media plan store to the engine input. The only store → engine translation. */
export function selectEngineInput(state: EngineSource): EngineInput {
  return {
    budget: state.totalBudget,
    channels: state.channels,
    assumptions: state.globalMultipliers,
    markets: { tiers: state.activeTiers, geos: state.activeGeos, overrides: state.geoOverrides },
    industry: state.onboardingVertical,
    observedValue: state.observedLtv,
  };
}

/** Computes the plan with the active engine outside React (exports, AI context, tests). */
export function computePlanResult(state: EngineSource): EngineResult {
  return getEngine().compute(selectEngineInput(state));
}

/** The live plan result. Every screen reads plan numbers from here. */
export function usePlanResult(): EngineResult {
  const engine = useSyncExternalStore(subscribeEngine, getEngine, getEngine);
  const totalBudget = useMediaPlanStore((s) => s.totalBudget);
  const channels = useMediaPlanStore((s) => s.channels);
  const globalMultipliers = useMediaPlanStore((s) => s.globalMultipliers);
  const activeTiers = useMediaPlanStore((s) => s.activeTiers);
  const activeGeos = useMediaPlanStore((s) => s.activeGeos);
  const geoOverrides = useMediaPlanStore((s) => s.geoOverrides);
  const onboardingVertical = useMediaPlanStore((s) => s.onboardingVertical);
  const observedLtv = useMediaPlanStore((s) => s.observedLtv);

  return useMemo(
    () =>
      engine.compute(
        selectEngineInput({
          totalBudget,
          channels,
          globalMultipliers,
          activeTiers,
          activeGeos,
          geoOverrides,
          onboardingVertical,
          observedLtv,
        })
      ),
    [engine, totalBudget, channels, globalMultipliers, activeTiers, activeGeos, geoOverrides, onboardingVertical, observedLtv]
  );
}
