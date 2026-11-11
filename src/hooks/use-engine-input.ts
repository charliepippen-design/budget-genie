import { useMemo } from 'react';
import type { EngineInput } from '@/engine/contract';
import { selectEngineInput } from '@/engine/input';
import { useMediaPlanStore } from './use-media-plan-store';

/**
 * The live engine input, rebuilt only when a store field the engine reads changes. Shared by
 * the timeline and what-if hooks (usePlanResult builds the same input inline).
 */
export function useEngineInput(): EngineInput {
  const totalBudget = useMediaPlanStore((state) => state.totalBudget);
  const channels = useMediaPlanStore((state) => state.channels);
  const globalMultipliers = useMediaPlanStore((state) => state.globalMultipliers);
  const activeTiers = useMediaPlanStore((state) => state.activeTiers);
  const activeGeos = useMediaPlanStore((state) => state.activeGeos);
  const geoOverrides = useMediaPlanStore((state) => state.geoOverrides);
  const onboardingVertical = useMediaPlanStore((state) => state.onboardingVertical);
  const observedLtv = useMediaPlanStore((state) => state.observedLtv);

  return useMemo(
    () =>
      selectEngineInput({
        totalBudget,
        channels,
        globalMultipliers,
        activeTiers,
        activeGeos,
        geoOverrides,
        onboardingVertical,
        observedLtv,
      }),
    [totalBudget, channels, globalMultipliers, activeTiers, activeGeos, geoOverrides, onboardingVertical, observedLtv]
  );
}
