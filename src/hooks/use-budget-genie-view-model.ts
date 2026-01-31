import { useMemo, useCallback } from 'react';
import { useMediaPlanStore } from './use-media-plan-store';
import { calculateChannelMetrics, calculateBlendedMetrics } from '@/lib/mediaplan-data';

/**
 * useBudgetGenieViewModel
 * 
 * A stable, memoized View Model for the main dashboard.
 * 
 * RESPONSIBILITIES:
 * 1. Connects to the raw Zustand store (Single Source of Truth)
 * 2. Derives all financial metrics (Spend, ROAS, CPA, etc.)
 * 3. Aggregates category totals for charts
 * 4. Aggregates blended totals for the project
 * 5. Provides safe, typed handlers for UI interactions
 * 
 * WHY THIS EXISTS:
 * Attempting to do this math inside the render loop of BudgetGenieAI.tsx
 * caused race conditions, lag, and crashes when data was incomplete.
 */
export function useBudgetGenieViewModel() {
    // 1. RAW DATA SOURCE
    const {
        channels,
        totalBudget,
        setTotalBudget,
        projectName,
        setProjectName,
        resetAll,
        setChannelAllocation, // Correct name from store
        normalizeAllocations
    } = useMediaPlanStore();

    // Safety check for array existence
    const safeChannels = useMemo(() => Array.isArray(channels) ? channels : [], [channels]);

    // 3. DERIVED METRICS (Channel Level)
    // Recompute strictly when channels or totalBudget changes.
    const channelsWithMetrics = useMemo(() => {
        // --- SUBTRACTIVE LOGIC START (Audit Fix) ---

        // 1. Identify Fixed Costs
        // Sum the cost of all channels where model is FIXED/RETAINER
        const fixedChannels = safeChannels.filter(ch =>
            ch.buyingModel === 'FLAT_FEE' ||
            ch.buyingModel === 'RETAINER' ||
            ch.tier === 'fixed'
        );

        const totalFixedSpend = fixedChannels.reduce((sum, ch) => sum + (ch.typeConfig.price || 0), 0);

        // 2. Calculate Remaining Pool
        const variableBudgetPool = Math.max(0, totalBudget - totalFixedSpend);

        // Warning if overflow (Optional: could expose this state)
        if (totalBudget < totalFixedSpend) {
            console.warn("Budget Overflow: Fixed costs exceed total budget.");
        }

        return safeChannels.map(channel => {
            try {
                let spend = 0;
                const isFixed = channel.buyingModel === 'FLAT_FEE' || channel.buyingModel === 'RETAINER' || channel.tier === 'fixed';

                if (isFixed) {
                    // Fixed channels take their exact price
                    spend = channel.typeConfig.price || 0;
                } else {
                    // Variable channels take % of the REMAINING pool
                    const allocationPct = Number(channel.allocationPct) || 0;
                    spend = (variableBudgetPool * allocationPct) / 100;
                }

                // Calculate metrics using the shared library
                const metrics = calculateChannelMetrics(channel, spend);

                return {
                    ...channel,
                    metrics
                };
            } catch (error) {
                console.error(`Error calculating metrics for channel ${channel.id}:`, error);

                // Fallback to zero-safe object to prevent UI crashes
                return {
                    ...channel,
                    metrics: {
                        spend: 0,
                        impressions: 0,
                        clicks: 0,
                        conversions: 0,
                        cpa: 0,
                        revenue: 0,
                        roas: 0,
                        effectivePrice: 0,
                        effectiveCtr: 0,
                        effectiveCr: 0
                    }
                };
            }
        });
    }, [safeChannels, totalBudget]);

    // 3. DERIVED ALLOCATIONS MAP 
    // (Used by inputs to quickly find current %)
    const currentAllocations = useMemo(() => {
        return safeChannels.reduce((acc, ch) => ({
            ...acc,
            [ch.id]: ch.allocationPct || 0
        }), {} as Record<string, number>);
    }, [safeChannels]);

    // 4. DERIVED BLENDED METRICS (Project Level)
    // We derive this FROM channelsWithMetrics to ensure mathematical consistency.
    // Previously, this was recalculated independently, leading to drift.
    const blendedMetrics = useMemo(() => {
        try {
            // Aggregate directly from the already-calculated channel metrics
            return channelsWithMetrics.reduce((acc, ch) => {
                const m = ch.metrics;
                return {
                    totalSpend: acc.totalSpend + (m.spend || 0),
                    totalRevenue: acc.totalRevenue + (m.revenue || 0),
                    totalConversions: acc.totalConversions + (m.conversions || 0),
                    totalImpressions: (acc.totalImpressions || 0) + (m.impressions || 0),
                    totalClicks: (acc.totalClicks || 0) + (m.clicks || 0),
                    // Ratios calculated at the end
                    blendedRoas: 0,
                    blendedCpa: 0
                };
            }, {
                totalSpend: 0,
                totalRevenue: 0,
                totalConversions: 0,
                totalImpressions: 0,
                totalClicks: 0,
                blendedRoas: 0,
                blendedCpa: 0
            });

        } catch (error) {
            console.error("Critical: Error calculating blended metrics", error);
            return { totalSpend: 0, totalRevenue: 0, blendedRoas: 0, blendedCpa: 0, totalConversions: 0 };
        }
    }, [channelsWithMetrics]);

    // Final Ratio Calculation for Blended
    // Done here to handle divide-by-zero safely
    const finalBlendedMetrics = useMemo(() => {
        const { totalSpend, totalRevenue, totalConversions } = blendedMetrics;
        const blendedRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
        const blendedCpa = totalConversions > 0 ? totalSpend / totalConversions : 0;

        return {
            ...blendedMetrics,
            blendedRoas,
            blendedCpa
        };
    }, [blendedMetrics]);

    // 5. DERIVED CATEGORY TOTALS (For Pie Charts)
    const categoryTotals = useMemo(() => {
        return channelsWithMetrics.reduce((acc, ch) => {
            const cat = ch.category || 'Other';

            if (!acc[cat]) {
                acc[cat] = { spend: 0, percentage: 0 };
            }

            acc[cat].spend += ch.metrics.spend;
            acc[cat].percentage += ch.allocationPct || 0;

            return acc;
        }, {} as Record<string, { spend: number; percentage: number }>);
    }, [channelsWithMetrics]);

    // 6. ACTIONS
    const handleLoadScenario = useCallback((scenario: { totalBudget: number }) => {
        if (scenario && typeof scenario.totalBudget === 'number') {
            setTotalBudget(scenario.totalBudget);
        }
    }, [setTotalBudget]);

    return {
        // Raw Data
        channels: channelsWithMetrics, // Return the ENRICHED channels
        totalBudget,
        projectName,

        // Derived Data (Stable)
        currentAllocations,
        blendedMetrics: finalBlendedMetrics,
        categoryTotals,

        // Actions
        setTotalBudget,
        setProjectName,
        resetAll,
        updateChannelAllocation: setChannelAllocation, // Alias for backward compatibility if needed
        handleLoadScenario,
        normalizeAllocations
    };
}
