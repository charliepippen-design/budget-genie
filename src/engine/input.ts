import type { MediaPlanData } from '@/lib/media-plan/state';
import type { EngineInput } from './contract';

/** The store fields the engine reads. */
export type EngineSource = Pick<
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
