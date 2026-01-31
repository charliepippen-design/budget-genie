import { useMediaPlanStore } from './use-media-plan-store';
import { useCallback } from 'react';

/**
 * The Smart Engine
 * Handles budget distribution logic based on channel tiers:
 * 1. Fixed (Retainers): Paid first, amount never changes.
 * 2. Capped (Sponsorships): Paid second, up to limit.
 * 3. Scalable (Ads): Absorb the rest based on weights.
 */
export const useBudgetEngine = () => {
    const {
        totalBudget,
        setTotalBudget,
        channels,
        setAllocations,
        normalizeAllocations
    } = useMediaPlanStore();

    /**
     * Updates the total budget and redistributes allocations according to tiers.
     * @param newTotalBudget The new total budget amount
     */
    const updateBudget = useCallback((newTotalBudget: number) => {
        // Access fresh state to ensure we capture recent price changes
        const state = useMediaPlanStore.getState();
        const currentChannels = state.channels;

        // 1. Calculate Fixed Costs
        const fixedChannels = currentChannels.filter(ch => ch.tier === 'fixed');
        let fixedCostTotal = 0;

        fixedChannels.forEach(ch => {
            // Price is the monthly fee
            const cost = ch.typeConfig.price;
            fixedCostTotal += cost;
        });

        // 2. Determine Remaining Budget for Scalable/Capped
        // If Fixed Costs > Total, we have 0 remaining (and technically an overflow situation, but we clamp to 0 for variable)
        const remainingBudget = Math.max(0, newTotalBudget - fixedCostTotal);

        // 3. Calculate Allocations
        const newAllocations: Record<string, number> = {};

        // A. Fixed Channels Allocation
        // Allocation % = (FixedCost / TotalBudget) * 100
        fixedChannels.forEach(ch => {
            const cost = ch.typeConfig.price;
            // Prevent division by zero if budget is 0
            const pct = newTotalBudget > 0 ? (cost / newTotalBudget) * 100 : 0;
            // If newTotalBudget is less than fixed costs, this will perform correct partial allocation math (e.g. 200%)
            // but the UI/Metrics might need to handle the >100% case or we accept it as "Over Budget"
            newAllocations[ch.id] = pct;
        });

        // B. Scalable / Capped Channels
        const variableChannels = currentChannels.filter(ch => ch.tier !== 'fixed');

        if (variableChannels.length > 0) {
            // We need to distribute the 'remainingBudget' among these channels.

            // First, get current relative weights of variable channels
            const totalVariableWeight = variableChannels.reduce((sum, ch) => sum + ch.allocationPct, 0);

            variableChannels.forEach(ch => {
                let shareOfVariable = 0;
                if (totalVariableWeight > 0) {
                    shareOfVariable = ch.allocationPct / totalVariableWeight;
                } else {
                    shareOfVariable = 1 / variableChannels.length;
                }

                // Amount to spend = RemainingBudget * Share
                const spendAmount = remainingBudget * shareOfVariable;

                // Convert back to % of Total Budget
                const pct = newTotalBudget > 0 ? (spendAmount / newTotalBudget) * 100 : 0;
                newAllocations[ch.id] = pct;
            });
        }

        // 4. Update Store
        setAllocations(newAllocations);
        setTotalBudget(newTotalBudget);

    }, [setAllocations, setTotalBudget]);

    const rebalance = useCallback(() => {
        const currentTotal = useMediaPlanStore.getState().totalBudget;
        updateBudget(currentTotal);
    }, [updateBudget]);

    return {
        updateBudget,
        rebalance
    };
};


