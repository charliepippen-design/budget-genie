import { useMemo, useCallback } from 'react';
import { useMediaPlanStore, usePlanMetrics } from './use-media-plan-store';

/**
 * useBudgetGenieViewModel
 * 
 * A stable, memoized View Model for the main dashboard.
 * 
 * RESPONSIBILITIES:
 * 1. Connects to the Zustand store (Single Source of Truth)
 * 2. Derives all financial metrics via usePlanMetrics()
 * 3. Aggregates category totals for charts
 * 4. Aggregates blended totals for the project
 * 5. Provides safe, typed handlers for UI interactions
 */
export function useBudgetGenieViewModel() {
    // 1. RAW DATA SOURCE & ACTIONS
    const {
        totalBudget,
        setTotalBudget,
        projectName,
        setProjectName,
        resetAll,
        setChannelAllocation,
        normalizeAllocations
    } = useMediaPlanStore();

    // 2. UNIFIED DERIVED METRICS (Single Source of Truth)
    const planMetrics = usePlanMetrics();
    const channelsWithMetrics = planMetrics.channelsWithMetrics;
    const blendedMetrics = planMetrics.blendedMetrics;
    const categoryTotals = planMetrics.categoryTotals;

    // 3. DERIVED ALLOCATIONS MAP 
    // (Used by inputs to quickly find current %)
    const currentAllocations = useMemo(() => {
        return channelsWithMetrics.reduce((acc, ch) => ({
            ...acc,
            [ch.id]: ch.allocationPct || 0
        }), {} as Record<string, number>);
    }, [channelsWithMetrics]);

    // 4. ACTIONS
    const handleLoadScenario = useCallback((scenario: { totalBudget: number }) => {
        if (scenario && typeof scenario.totalBudget === 'number') {
            setTotalBudget(scenario.totalBudget);
        }
    }, [setTotalBudget]);

    return {
        // Data
        channels: channelsWithMetrics,
        totalBudget,
        projectName,

        // Derived Data (Unified)
        currentAllocations,
        blendedMetrics,
        categoryTotals,
        planMetrics,

        // Actions
        setTotalBudget,
        setProjectName,
        resetAll,
        updateChannelAllocation: setChannelAllocation,
        handleLoadScenario,
        normalizeAllocations
    };
}

