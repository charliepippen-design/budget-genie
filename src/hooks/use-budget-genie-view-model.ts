import { useCallback, useMemo } from 'react';
import {
  useMediaPlanStore,
  useChannelsWithMetrics,
  useBlendedMetrics,
  useCategoryTotals,
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
  const blendedMetrics = useBlendedMetrics();
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
