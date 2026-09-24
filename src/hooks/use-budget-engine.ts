import { useMediaPlanStore } from './use-media-plan-store';
import { useCallback } from 'react';

/**
 * Pure scaling function callable outside React components (e.g. tests, engines).
 * Updates total budget. Channel spends and allocation percentages derive purely.
 */
export function setPlanBudget(newTotalBudget: number) {
  useMediaPlanStore.getState().setTotalBudget(newTotalBudget);
}

/**
 * The Budget Engine Hook
 * Provides pure budget updating without mutating underlying channel relative weights.
 */
export const useBudgetEngine = () => {
  const setTotalBudget = useMediaPlanStore(s => s.setTotalBudget);

  const updateBudget = useCallback((newTotalBudget: number) => {
    setTotalBudget(newTotalBudget);
  }, [setTotalBudget]);

  const rebalance = useCallback(() => {
    // Pure calculation maintains consistency automatically
  }, []);

  return {
    updateBudget,
    rebalance,
  };
};
