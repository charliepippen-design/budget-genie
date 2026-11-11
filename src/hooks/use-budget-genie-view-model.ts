import { useCallback, useMemo } from 'react';
import {
  useMediaPlanStore,
  useChannelsWithMetrics,
  useBlendedMetrics,
  useCategoryTotals,
  usePlanResult,
} from './use-media-plan-store';

export function useBudgetGenieViewModel() {
  const {
    totalBudget,
    projectName,
    setTotalBudget,
    setProjectName,
    resetAll,
    setChannelAllocation,
    normalizeAllocations,
  } = useMediaPlanStore();

  const channels = useChannelsWithMetrics();
  const plainBlended = useBlendedMetrics();
  const month1Roas = usePlanResult().roas.month1;
  // Carries Month-1 ROAS (from the engine result) next to the blended totals.
  const blendedMetrics = useMemo(() => ({ ...plainBlended, month1Roas }), [plainBlended, month1Roas]);
  const categoryTotals = useCategoryTotals();

  const currentAllocations = useMemo(
    () => channels.reduce<Record<string, number>>((acc, ch) => {
      acc[ch.id] = ch.allocationPct || 0;
      return acc;
    }, {}),
    [channels],
  );

  const handleLoadScenario = useCallback((scenario: { totalBudget: number }) => {
    if (typeof scenario?.totalBudget === 'number') {
      setTotalBudget(scenario.totalBudget);
    }
  }, [setTotalBudget]);

  return {
    channels,
    totalBudget,
    projectName,
    currentAllocations,
    blendedMetrics,
    categoryTotals,
    setTotalBudget,
    setProjectName,
    resetAll,
    updateChannelAllocation: setChannelAllocation,
    handleLoadScenario,
    normalizeAllocations,
  };
}
