import { ChannelData, GlobalMultipliers, ChannelWithMetrics, calculateChannelMetrics } from '@/hooks/use-media-plan-store';
// import { calculateChannelMetrics } from '@/lib/mediaplan-data'; // Use store version
import { normalizeAllocations } from './math-utils';

export interface OptimizationResult {
    channels: ChannelData[];
    changes: {
        slashed: string[];
        boosted: string[];
        freedAllocation: number;
    };
}

/**
 * Optimizes budget allocation based on CPA and ROAS targets.
 * 
 * Rules:
 * 1. Violators (CPA > Target) -> Reduce allocation by 30%.
 * 2. Winners (ROAS > Target) -> Increase allocation by 30%.
 * 3. Result is normalized to ensure 100% total.
 */
export function optimizeBudget(
    channels: ChannelData[],
    totalBudget: number,
    multipliers: GlobalMultipliers
): OptimizationResult {
    const { cpaTarget, roasTarget } = multipliers;

    // If no targets, we can't optimize
    if (!cpaTarget && !roasTarget) {
        return { channels, changes: { slashed: [], boosted: [], freedAllocation: 0 } };
    }

    // 1. Calculate Metrics for current state
    const channelsWithMetrics = channels.map(ch => {
        // Use external helper from store
        const metrics = calculateChannelMetrics(ch, totalBudget, multipliers);
        return { ...ch, metrics };
    });

    const slashedIds: string[] = [];
    const boostedIds: string[] = [];
    let modificationOccurred = false;

    // 2. Apply Punish/Reward Logic (Raw changes before normalization)
    const modifiedChannels = channelsWithMetrics.map(ch => {
        // Skip locked, fixed, or inactive channels
        if (ch.locked ||
            !ch.isActive ||
            ch.tier === 'fixed' ||
            ch.buyingModel === 'FLAT_FEE' ||
            ch.buyingModel === 'RETAINER') {
            return ch;
        }

        let newAlloc = ch.allocationPct;

        // Rule 1: Punish based on CPA
        // "Find channels where CPA > targetCPA -> Reduce allocation by 30%."
        if (cpaTarget && ch.metrics.cpa && ch.metrics.cpa > cpaTarget) {
            if (ch.allocationPct > 0) {
                newAlloc = newAlloc * 0.7; // Reduce by 30%
                if (!slashedIds.includes(ch.id)) slashedIds.push(ch.id);
                modificationOccurred = true;
            }
        }

        // Rule 2: Reward based on ROAS
        // "Find channels where ROAS > targetROAS -> Increase allocation by 30%."
        // Note: Logic implies ROAS *better* than target. ROAS target is usually a minimum (e.g. 2.0x).
        // So ROAS > target = Good.
        if (roasTarget && ch.metrics.roas && ch.metrics.roas > roasTarget) {
            // Only boost if it has some allocation, or maybe we boost 0? 
            // Logic says "Increase allocation", implied existing.
            if (ch.allocationPct > 0) {
                newAlloc = newAlloc * 1.3; // Increase by 30%
                if (!boostedIds.includes(ch.id)) boostedIds.push(ch.id);
                modificationOccurred = true;
            }
        }

        return { ...ch, allocationPct: newAlloc };
    });

    if (!modificationOccurred) {
        return { channels, changes: { slashed: [], boosted: [], freedAllocation: 0 } };
    }

    // 3. Normalize (The Normalizer)
    // "Re-run normalizeAllocations to ensure 100% total."
    // We expect the raw sums to be off (e.g. 110% or 90%), but normalization handles scaling.

    // Map back to ChannelData
    const resultChannels = modifiedChannels.map(ch => {
        const { metrics, ...data } = ch;
        return data as ChannelData;
    });

    const finalChannels = normalizeAllocations(resultChannels);

    return {
        channels: finalChannels,
        changes: {
            slashed: slashedIds,
            boosted: boostedIds,
            freedAllocation: 0 // Concept of "freed" is less relevant now as we just scale the pool
        }
    };
}
