import { Shield, Zap, TrendingUp, Target, Scale, Lock, DollarSign, Crosshair, Users, Globe, Smartphone, Mail, PieChart } from 'lucide-react';

export interface StrategyDef {
    id: string;
    name: string;
    description: string;
    icon?: any; // LucideIcon type
    distribution: Record<string, number>;
}

// 1. REGULATED MARKETS (Generic / Safe)
export const REGULATED_STRATEGIES: StrategyDef[] = [
    {
        id: 'balanced',
        name: 'Balanced Growth',
        description: 'Equal weight across all channels for steady, diversified acquisition.',
        icon: Scale,
        distribution: { 'Paid Search': 20, 'Paid Social': 20, 'Display/Programmatic': 20, 'Affiliate': 20, 'SEO/Content': 20 }
    },
    {
        id: 'conservative',
        name: 'Conservative / Safe',
        description: 'Prioritizes fixed costs and retainer-based channels to protect baseline.',
        icon: Shield,
        distribution: { 'Paid Search': 10, 'Paid Social': 10, 'Display/Programmatic': 10, 'Affiliate': 10, 'SEO/Content': 60 } // Heavy on generic SEO/Content for safety? Or manual logic override
    },
    {
        id: 'aggressive',
        name: 'Aggressive Scale',
        description: 'Heavy investment in paid media for maximum volume.',
        icon: TrendingUp,
        distribution: { 'Paid Search': 40, 'Paid Social': 30, 'Display/Programmatic': 20, 'Affiliate': 5, 'SEO/Content': 5 }
    },
    {
        id: 'efficiency',
        name: 'Efficiency First',
        description: 'Focus on high-ROAS channels, minimizing experimental spend.',
        icon: Target,
        distribution: { 'Paid Search': 30, 'Affiliate': 50, 'Paid Social': 10, 'Display/Programmatic': 5, 'SEO/Content': 5 }
    }
];

// 2. UNREGULATED MARKETS (Vertical Specific)
export const UNREGULATED_STRATEGIES: Record<string, StrategyDef[]> = {
    'CASINO': [
        {
            id: 'casino_affiliate',
            name: 'Affiliate Dominance',
            description: 'The standard iGaming model. 60%+ budget to CPA partners.',
            icon: Users,
            distribution: { 'Affiliate': 60, 'Paid Search': 20, 'Display/Programmatic': 10, 'SEO/Content': 10 }
        },
        {
            id: 'casino_streamer',
            name: 'Streamer / Influencer',
            description: 'Heavy focus on Twitch/Kick streamers and social proof.',
            icon: Smartphone,
            distribution: { 'Paid Social': 50, 'Affiliate': 20, 'Display/Programmatic': 20, 'SEO/Content': 10 }
        },
        {
            id: 'casino_seo',
            name: 'SEO Long Game',
            description: 'Building own assets to reduce dependency on affiliates.',
            icon: Globe,
            distribution: { 'SEO/Content': 50, 'Affiliate': 20, 'Paid Search': 20, 'Display/Programmatic': 10 }
        }
    ],
    'CRYPTO': [
        {
            id: 'crypto_push',
            name: 'Push & Pop Traffic',
            description: 'High volume, low cost traffic for pre-sales and meme coins.',
            icon: Zap,
            distribution: { 'Display/Programmatic': 60, 'Paid Social': 20, 'Affiliate': 10, 'SEO/Content': 10 }
        },
        {
            id: 'crypto_community',
            name: 'Community & KOLs',
            description: 'Telegram, Twitter (X), and YouTube influencers.',
            icon: Users,
            distribution: { 'Paid Social': 60, 'SEO/Content': 20, 'Display/Programmatic': 20 }
        }
    ],
    'NUTRA': [
        {
            id: 'nutra_native',
            name: 'Native Ads Blitz',
            description: 'Taboola/Outbrain advertorials driving direct sales.',
            icon: Globe,
            distribution: { 'Display/Programmatic': 70, 'Paid Search': 20, 'Affiliate': 10 }
        },
        {
            id: 'nutra_social',
            name: 'Social Direct Response',
            description: 'FB/TikTok ads with aggressive hooks.',
            icon: Smartphone,
            distribution: { 'Paid Social': 80, 'Paid Search': 10, 'SEO/Content': 10 }
        }
    ],
    'ADULT': [
        {
            id: 'adult_tube',
            name: 'Tube Traffic',
            description: 'Banner and pre-roll buys on major networks.',
            icon: PieChart,
            distribution: { 'Display/Programmatic': 80, 'Affiliate': 20 }
        },
        {
            id: 'adult_cam',
            name: 'Cam Network Affiliates',
            description: 'Rev-share focus with major cam networks.',
            icon: Users,
            distribution: { 'Affiliate': 80, 'Display/Programmatic': 20 }
        }
    ]
};
