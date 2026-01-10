export type DistributionStrategy =
    | 'balanced'
    | 'affiliate_dominant'
    | 'influencer_dominant'
    | 'hybrid_growth'
    | 'seo_foundation'
    | 'conversion_max'
    | 'programmatic_blitz'
    | 'retention_ltv';

interface WeightConfig {
    strategies: Record<DistributionStrategy, {
        description: string;
        weights: Record<string, number>; // default weight is 1
    }>
}

export const DISTRIBUTION_CONFIG: WeightConfig = {
    strategies: {
        balanced: {
            description: 'Equal distribution across all active channels',
            weights: {}, // All 1
        },
        affiliate_dominant: {
            description: 'Heavy focus on Affiliate and CPA channels for secure ROI',
            weights: {
                'Affiliate': 8,
                'cpa': 8,
                'Display/Programmatic': 1,
                'Paid Social': 1,
                'SEO/Content': 1
            }
        },
        influencer_dominant: {
            description: 'Maximize brand awareness via Influencers and Display',
            weights: {
                'Paid Social': 8,
                'display': 5,
                'programmatic': 5,
                'Display/Programmatic': 2
            }
        },
        hybrid_growth: {
            description: 'Balanced mix of Influencer reach and Affiliate performance',
            weights: {
                'Paid Social': 6,
                'Affiliate': 6,
                'Display/Programmatic': 3,
                'SEO/Content': 2
            }
        },
        // New Presets
        seo_foundation: {
            description: 'Prioritize long-term authority. Sacrifices short-term volume to build sustainable organic traffic infrastructure.',
            weights: {
                'SEO/Content': 8,
                'content': 10,
                'backlinks': 9,
                'tech': 8,
                'audit': 8,
                'display': 1,
                'Display/Programmatic': 1
            }
        },
        conversion_max: {
            description: 'Maximize immediate ROAS by targeting high-intent users ready to buy. Ignores broad awareness.',
            weights: {
                'retargeting': 10,
                'push': 10,
                'cpa': 5,
                'brand': 0.1,
                'awareness': 0.1,
                'display': 1
            }
        },
        programmatic_blitz: {
            description: 'Aggressive scaling using controllable programmatic channels. Reduces reliance on third-party partners.',
            weights: {
                'native': 8,
                'display': 8,
                'push': 8,
                'Affiliate': 1,
                'SEO/Content': 1
            }
        },
        retention_ltv: {
            description: 'Focus on re-engaging existing traffic to boost Lifetime Value and reduce churn.',
            weights: {
                'retargeting': 10,
                'email': 10,
                'push': 10,
                'content': 4
            }
        }
    }
};

/**
 * Calculates new allocation percentages based on the selected strategy.
 * @param channels List of active channels with their categories/families
 * @param strategy Selected distribution strategy
 */
export function calculateDistribution(
    channels: { id: string; category: string; family?: string; name: string }[],
    strategy: DistributionStrategy
): Record<string, number> {
    const config = DISTRIBUTION_CONFIG.strategies[strategy];
    const adjustments: Record<string, number> = {};

    // 1. Assign weights
    let totalWeight = 0;

    channels.forEach(ch => {
        let weight = 1; // Default

        // Check by Category (broad)
        if (config.weights[ch.category]) {
            weight = config.weights[ch.category];
        }

        // Check by Family (if available)
        if (ch.family && config.weights[ch.family]) {
            weight = Math.max(weight, config.weights[ch.family]);
        }

        // Check by Name/ID keywords (specific)
        Object.keys(config.weights).forEach(key => {
            if (ch.id.includes(key) || ch.name.toLowerCase().includes(key)) {
                weight = Math.max(weight, config.weights[key]);
            }
        });

        adjustments[ch.id] = weight;
        totalWeight += weight;
    });

    // 2. Calculate percentages
    const allocations: Record<string, number> = {};

    if (totalWeight === 0) return allocations;

    channels.forEach(ch => {
        allocations[ch.id] = (adjustments[ch.id] / totalWeight) * 100;
    });

    return allocations;
}

// ============================================================================
// DYNAMIC PRESET CALCULATORS (Mission 2 & 4 Extensions)
// ============================================================================

import { ChannelWithMetrics } from '@/hooks/use-media-plan-store';

/**
 * 1. 🚀 Maximize ROAS
 * Allocates budget based on ROAS weight. Channels < 1.0 ROAS get 0%.
 */
export function calculateRoasBasedAllocation(channels: ChannelWithMetrics[]): Record<string, number> {
    const allocations: Record<string, number> = {};

    // Filter positive ROAS
    const viableChannels = channels.filter(ch => ch.metrics.roas > 1.0);

    if (viableChannels.length === 0) {
        // Fallback: Equal distribution if no positive ROAS
        const share = 100 / channels.length;
        channels.forEach(ch => allocations[ch.id] = share);
        return allocations;
    }

    // Calculate total ROAS "points"
    const totalRoas = viableChannels.reduce((sum, ch) => sum + ch.metrics.roas, 0);

    // Distribute
    let calculatedTotal = 0;
    channels.forEach(ch => {
        if (ch.metrics.roas > 1.0) {
            const alloc = (ch.metrics.roas / totalRoas) * 100;
            allocations[ch.id] = alloc;
            calculatedTotal += alloc;
        } else {
            allocations[ch.id] = 0;
        }
    });

    // NORMALIZATION PASS (Fix overflow)
    if (calculatedTotal > 0 && Math.abs(calculatedTotal - 100) > 0.001) {
        const factor = 100 / calculatedTotal;
        Object.keys(allocations).forEach(id => {
            allocations[id] *= factor;
        });
    }

    return allocations;
}

/**
 * 2. 📢 Maximum Visibility (Impressions)
 * Allocates 80% of budget to top 25% lowest CPM channels.
 */
export function calculateVisibilityAllocation(channels: ChannelWithMetrics[]): Record<string, number> {
    const allocations: Record<string, number> = {};

    // Sort by CPM ascending (cheaper is better)
    // Use effectivePrice if available, otherwise fallback to typeConfig
    const sorted = [...channels].sort((a, b) => {
        const priceA = a.metrics.effectivePrice || a.typeConfig?.price || 100;
        const priceB = b.metrics.effectivePrice || b.typeConfig?.price || 100;
        return priceA - priceB;
    });

    // Identify winners (Top 25% or Top 3)
    const winnerCount = Math.max(1, Math.ceil(sorted.length * 0.25));
    const winners = sorted.slice(0, winnerCount);
    const others = sorted.slice(winnerCount);

    // Allocations
    const winnerShare = 80 / winners.length;
    const otherShare = others.length > 0 ? 20 / others.length : 0;

    winners.forEach(ch => allocations[ch.id] = winnerShare);
    others.forEach(ch => allocations[ch.id] = otherShare);

    return allocations;
}

/**
 * 3. 🛡️ Conservative / Safe Mode
 * Prioritizes 'RETAINER', 'FLAT_FEE', 'FIXED'.
 * Strategy: Give them 60% of budget (safe bet), split rest evenly.
 */
export function calculateConservativeAllocation(channels: ChannelWithMetrics[]): Record<string, number> {
    const allocations: Record<string, number> = {};

    const SAFE_MODELS = ['RETAINER', 'FLAT_FEE', 'FIXED'];
    const safeChannels = channels.filter(ch => SAFE_MODELS.includes(ch.buyingModel));
    const riskyChannels = channels.filter(ch => !SAFE_MODELS.includes(ch.buyingModel));

    // If no safe channels found, fallback to balanced
    if (safeChannels.length === 0) {
        const share = 100 / channels.length;
        channels.forEach(ch => allocations[ch.id] = share);
        return allocations;
    }

    // Allocation Split
    // If we have both types, give 70% to Safe, 30% to Risky
    const safeBudget = riskyChannels.length > 0 ? 70 : 100;
    const riskyBudget = 100 - safeBudget;

    const sharePerSafe = safeBudget / safeChannels.length;
    const sharePerRisky = riskyChannels.length > 0 ? riskyBudget / riskyChannels.length : 0;

    safeChannels.forEach(ch => allocations[ch.id] = sharePerSafe);
    riskyChannels.forEach(ch => allocations[ch.id] = sharePerRisky);

    return allocations;
}

/**
 * 4. 🧪 Experimental / Sandbox
 * 20% to channels with 0 Spend OR 0 Conversions. 80% to top performers.
 */
export function calculateExperimentalAllocation(channels: ChannelWithMetrics[]): Record<string, number> {
    const allocations: Record<string, number> = {};

    const experimental = channels.filter(ch => ch.metrics.spend === 0 || ch.metrics.conversions === 0);
    const established = channels.filter(ch => ch.metrics.spend > 0 && ch.metrics.conversions > 0);

    if (experimental.length === 0) {
        // No experiments available? Just do balanced
        const share = 100 / channels.length;
        channels.forEach(ch => allocations[ch.id] = share);
        return allocations;
    }

    // 20% for experiments
    const experimentBudget = 20;
    const coreBudget = 80;

    const sharePerExp = experimentBudget / experimental.length;

    // Distribute core budget by ROAS to ensure safety
    const totalRoas = established.reduce((sum, ch) => sum + (ch.metrics.roas || 0), 0);

    experimental.forEach(ch => allocations[ch.id] = sharePerExp);

    established.forEach(ch => {
        if (totalRoas > 0) {
            allocations[ch.id] = ((ch.metrics.roas || 0) / totalRoas) * coreBudget;
        } else {
            allocations[ch.id] = coreBudget / established.length;
        }
    });

    return allocations;
}

/**
 * 5. ⚖️ Pareto Efficiency (80/20)
 * Top 20% of channels (by conversions) get 80% of budget.
 */
export function calculateParetoAllocation(channels: ChannelWithMetrics[]): Record<string, number> {
    const allocations: Record<string, number> = {};

    // Sort by Conversions Descending
    const sorted = [...channels].sort((a, b) => b.metrics.conversions - a.metrics.conversions);

    // Identify Top 20%
    const topCount = Math.max(1, Math.ceil(sorted.length * 0.2));
    const topPerformers = sorted.slice(0, topCount);
    const tail = sorted.slice(topCount);

    const topShareTotal = 80;
    const tailShareTotal = 20;

    // Distribute within groups evenly (or could be weighted again, but let's keep it simple)
    const sharePerTop = topShareTotal / topPerformers.length;
    const sharePerTail = tail.length > 0 ? tailShareTotal / tail.length : 0;

    topPerformers.forEach(ch => allocations[ch.id] = sharePerTop);
    tail.forEach(ch => allocations[ch.id] = sharePerTail);

    return allocations;
}

/**
 * 6. 📉 Low CPA Hunter
 * Inverse CPA weighting. Cheaper conversions = More budget.
 */
export function calculateLowCpaAllocation(channels: ChannelWithMetrics[]): Record<string, number> {
    const allocations: Record<string, number> = {};

    const active = channels.filter(ch => ch.metrics.cpa !== null && ch.metrics.cpa > 0);
    const others = channels.filter(ch => !active.includes(ch));

    if (active.length === 0) {
        // Fallback
        const share = 100 / channels.length;
        channels.forEach(ch => allocations[ch.id] = share);
        return allocations;
    }

    // Calculate Inverse CPA (Score = 1/CPA)
    const scores = active.map(ch => ({ id: ch.id, score: 1 / (ch.metrics.cpa || 1) }));
    const totalScore = scores.reduce((sum, s) => sum + s.score, 0);

    const activeBudget = others.length > 0 ? 90 : 100; // Leave 10% for others just to keep them alive? Or 0? Let's say 90/10.
    const otherBudget = 100 - activeBudget;

    active.forEach(ch => {
        const score = 1 / (ch.metrics.cpa || 1);
        allocations[ch.id] = (score / totalScore) * activeBudget;
    });

    if (others.length > 0) {
        const share = otherBudget / others.length;
        others.forEach(ch => allocations[ch.id] = share);
    }

    return allocations;
}

/**
 * 7. 🎯 Active Solver / Weighted Scoring
 * Adjusts channel weights based on how close they are to the Target CPA/ROAS.
 * - Score increases if CPA < Target or ROAS > Target.
 * - Score decreases if CPA > Target or ROAS < Target.
 * - Clamps to prevent total starvation of fixed costs.
 */
export function calculateScoredAllocation(
    channels: ChannelWithMetrics[],
    cpaTarget: number | null,
    roasTarget: number | null
): Record<string, number> {
    const allocations: Record<string, number> = {};
    let totalScore = 0;
    const scores: Record<string, number> = {};

    channels.forEach(ch => {
        // Base Score (Start neutral)
        let score = 1.0;

        // 1. Efficiency Score (CPA)
        if (cpaTarget && ch.metrics.cpa) {
            // Factor: How much better/worse than target?
            const cpaFactor = cpaTarget / Math.max(0.01, ch.metrics.cpa);
            // Dampen the effect so it's not too wild (sqrt)
            score *= Math.sqrt(cpaFactor);
        }

        // 2. Efficiency Score (ROAS)
        if (roasTarget) {
            const roasFactor = ch.metrics.roas / Math.max(0.01, roasTarget);
            score *= Math.sqrt(roasFactor);
        }

        // 3. Safety Clamp for Fixed Costs (Retainers)
        // Don't let them drop below 50% of their "natural" weight if they are fixed
        if (['RETAINER', 'FLAT_FEE', 'FIXED'].includes(ch.buyingModel)) {
            score = Math.max(0.8, score);
        }

        // 4. Soft Min/Max to prevent absolute zero or monopoly
        score = Math.max(0.1, Math.min(10, score));

        scores[ch.id] = score;
        totalScore += score;
    });

    // Normalize
    const normalizeFactor = totalScore > 0 ? 100 / totalScore : 1;

    channels.forEach(ch => {
        allocations[ch.id] = scores[ch.id] * normalizeFactor;
    });

    return allocations;
}
