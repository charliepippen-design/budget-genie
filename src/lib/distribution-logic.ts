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
                'affiliate': 8,
                'cpa': 8,
                'paid': 1,
                'influencer': 1,
                'seo': 1
            }
        },
        influencer_dominant: {
            description: 'Maximize brand awareness via Influencers and Display',
            weights: {
                'influencer': 8,
                'display': 5,
                'programmatic': 5,
                'paid': 2
            }
        },
        hybrid_growth: {
            description: 'Balanced mix of Influencer reach and Affiliate performance',
            weights: {
                'influencer': 6,
                'affiliate': 6,
                'paid': 3,
                'seo': 2
            }
        },
        // New Presets
        seo_foundation: {
            description: 'Prioritize long-term authority. Sacrifices short-term volume to build sustainable organic traffic infrastructure.',
            weights: {
                'seo': 8,
                'content': 10,
                'backlinks': 9,
                'tech': 8,
                'audit': 8,
                'display': 1,
                'paid': 1
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
                'affiliate': 1,
                'seo': 1
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
