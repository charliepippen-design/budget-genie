// Media Plan Budget Calibrator - Data Layer
// Based on iGaming media plan structure

export interface Channel {
  id: string;
  name: string;
  category: ChannelCategory;
  baseSpend: number; // Reference spend (Month 2 - representative month)
  basePercentage: number; // Calculated percentage of total
  cpm?: number; // Cost per mille (estimated for channel type)
  ctr?: number; // Click-through rate (estimated for channel type)
  estimatedRoas?: number; // Return on ad spend
}

export type ChannelCategory = 'seo' | 'paid' | 'affiliate' | 'influencer';

export interface BudgetScenario {
  id: string;
  name: string;
  totalBudget: number;
  channelAllocations: Record<string, number>; // channelId -> percentage
  createdAt: Date;
}

export interface CalculatedMetrics {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  cpa: number | null;
  revenue: number;
  roas: number;
}

// Channel data extracted from CSV with estimated performance metrics
// Using Month 2 (May) as the reference baseline for balanced allocation
export const CHANNELS: Channel[] = [
  // SEO & Content
  {
    id: 'seo-tech',
    name: 'SEO - Tech Audit & On-Page',
    category: 'seo',
    baseSpend: 500,
    basePercentage: 0,
    cpm: 2.5,
    ctr: 0.8,
    estimatedRoas: 3.2,
  },
  {
    id: 'seo-content',
    name: 'SEO - Content Production',
    category: 'seo',
    baseSpend: 1500,
    basePercentage: 0,
    cpm: 1.8,
    ctr: 1.2,
    estimatedRoas: 4.5,
  },
  {
    id: 'seo-backlinks',
    name: 'SEO - Backlinks / Guest Posts',
    category: 'seo',
    baseSpend: 1000,
    basePercentage: 0,
    cpm: 3.5,
    ctr: 0.5,
    estimatedRoas: 2.8,
  },
  // Paid Media
  {
    id: 'paid-native',
    name: 'Paid - Native Ads (Adult/Crypto)',
    category: 'paid',
    baseSpend: 2500,
    basePercentage: 0,
    cpm: 4.2,
    ctr: 0.35,
    estimatedRoas: 1.8,
  },
  {
    id: 'paid-push',
    name: 'Paid - Push Notifications',
    category: 'paid',
    baseSpend: 1500,
    basePercentage: 0,
    cpm: 1.2,
    ctr: 2.5,
    estimatedRoas: 2.2,
  },
  {
    id: 'paid-programmatic',
    name: 'Paid - Programmatic / Display',
    category: 'paid',
    baseSpend: 1000,
    basePercentage: 0,
    cpm: 5.5,
    ctr: 0.15,
    estimatedRoas: 1.5,
  },
  {
    id: 'paid-retargeting',
    name: 'Paid - Retargeting (Pixel)',
    category: 'paid',
    baseSpend: 500,
    basePercentage: 0,
    cpm: 8.0,
    ctr: 1.8,
    estimatedRoas: 4.2,
  },
  // Affiliates
  {
    id: 'affiliate-listing',
    name: 'Affiliate - Listing Fees (Fixed)',
    category: 'affiliate',
    baseSpend: 1000,
    basePercentage: 0,
    cpm: 15.0,
    ctr: 3.5,
    estimatedRoas: 2.0,
  },
  {
    id: 'affiliate-cpa',
    name: 'Affiliate - CPA Commissions',
    category: 'affiliate',
    baseSpend: 8500,
    basePercentage: 0,
    cpm: 25.0,
    ctr: 4.2,
    estimatedRoas: 3.5,
  },
  // Influencers
  {
    id: 'influencer-retainers',
    name: 'Influencer - Monthly Retainers',
    category: 'influencer',
    baseSpend: 2000,
    basePercentage: 0,
    cpm: 12.0,
    ctr: 1.5,
    estimatedRoas: 2.5,
  },
  {
    id: 'influencer-funds',
    name: 'Influencer - Play Funds (Bal)',
    category: 'influencer',
    baseSpend: 1500,
    basePercentage: 0,
    cpm: 10.0,
    ctr: 2.0,
    estimatedRoas: 3.0,
  },
];

// Calculate base percentages
const totalBaseSpend = CHANNELS.reduce((sum, ch) => sum + ch.baseSpend, 0);
CHANNELS.forEach((ch) => {
  ch.basePercentage = (ch.baseSpend / totalBaseSpend) * 100;
});

// Budget type presets
export const BUDGET_PRESETS = {
  aggressive: {
    name: 'Aggressive',
    description: 'Higher paid media allocation for rapid growth',
    multipliers: {
      seo: 0.8,
      paid: 1.5,
      affiliate: 1.2,
      influencer: 0.8,
    },
  },
  balanced: {
    name: 'Balanced',
    description: 'Equal distribution across all channels',
    multipliers: {
      seo: 1.0,
      paid: 1.0,
      affiliate: 1.0,
      influencer: 1.0,
    },
  },
  brand: {
    name: 'Brand',
    description: 'Focus on organic and influencer reach',
    multipliers: {
      seo: 1.5,
      paid: 0.6,
      affiliate: 0.8,
      influencer: 1.6,
    },
  },
  custom: {
    name: 'Custom',
    description: 'Manual allocation control',
    multipliers: {
      seo: 1.0,
      paid: 1.0,
      affiliate: 1.0,
      influencer: 1.0,
    },
  },
} as const;

export type BudgetPresetKey = keyof typeof BUDGET_PRESETS;

// Category metadata
export const CATEGORY_INFO: Record<ChannelCategory, { name: string; color: string; icon: string }> = {
  seo: { name: 'SEO & Content', color: 'hsl(var(--chart-1))', icon: 'Search' },
  paid: { name: 'Paid Media', color: 'hsl(var(--chart-2))', icon: 'Megaphone' },
  affiliate: { name: 'Affiliates', color: 'hsl(var(--chart-3))', icon: 'Users' },
  influencer: { name: 'Influencers', color: 'hsl(var(--chart-4))', icon: 'Star' },
};

// Utility functions
// NOTE: This is a legacy function kept for backwards compatibility
// For new code, use useCurrency().format() hook instead
export function formatCurrency(value: number, compact = false): string {
  // Import the store state directly for non-React contexts
  const currencyStore = (window as any).__CURRENCY_STORE_STATE__;
  const currency = currencyStore?.currency || 'EUR';
  const currencies: Record<string, { symbol: string; locale: string; symbolPosition: 'before' | 'after' }> = {
    EUR: { symbol: '€', locale: 'de-DE', symbolPosition: 'after' },
    USD: { symbol: '$', locale: 'en-US', symbolPosition: 'before' },
    GBP: { symbol: '£', locale: 'en-GB', symbolPosition: 'before' },
    CHF: { symbol: 'CHF', locale: 'de-CH', symbolPosition: 'after' },
    CAD: { symbol: 'C$', locale: 'en-CA', symbolPosition: 'before' },
    AUD: { symbol: 'A$', locale: 'en-AU', symbolPosition: 'before' },
    JPY: { symbol: '¥', locale: 'ja-JP', symbolPosition: 'before' },
    CNY: { symbol: '¥', locale: 'zh-CN', symbolPosition: 'before' },
  };
  
  const info = currencies[currency] || currencies.EUR;
  
  if (compact) {
    let formatted: string;
    if (value >= 1000000) {
      formatted = `${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      formatted = `${(value / 1000).toFixed(1)}K`;
    } else {
      formatted = value.toFixed(0);
    }
    return info.symbolPosition === 'before' 
      ? `${info.symbol}${formatted}` 
      : `${formatted}${info.symbol}`;
  }
  
  const formatter = new Intl.NumberFormat(info.locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  
  const formatted = formatter.format(value);
  return info.symbolPosition === 'before' 
    ? `${info.symbol}${formatted}` 
    : `${formatted} ${info.symbol}`;
}

export function formatNumber(value: number, compact = false): string {
  if (compact) {
    if (value >= 1000000000) {
      return `${(value / 1000000000).toFixed(1)}B`;
    }
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}K`;
    }
  }
  return new Intl.NumberFormat('de-DE').format(Math.round(value));
}

export function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`;
}

// Calculate metrics for a channel given spend
export function calculateChannelMetrics(
  channel: Channel,
  spend: number
): CalculatedMetrics {
  const cpm = channel.cpm || 5;
  const ctr = channel.ctr || 1;
  const roas = channel.estimatedRoas || 2;

  const impressions = (spend / cpm) * 1000;
  const clicks = impressions * (ctr / 100);
  const conversionRate = 0.025; // 2.5% average conversion rate
  const conversions = clicks * conversionRate;
  const cpa = conversions > 0 ? spend / conversions : null;
  const revenue = spend * roas;

  return {
    spend,
    impressions,
    clicks,
    conversions,
    cpa,
    revenue,
    roas,
  };
}

// Calculate blended metrics across all channels
export function calculateBlendedMetrics(
  channels: Channel[],
  allocations: Record<string, number>,
  totalBudget: number
): {
  totalSpend: number;
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
  blendedCpa: number | null;
  projectedRevenue: number;
  blendedRoas: number;
} {
  let totalSpend = 0;
  let totalImpressions = 0;
  let totalClicks = 0;
  let totalConversions = 0;
  let totalRevenue = 0;

  channels.forEach((channel) => {
    const percentage = allocations[channel.id] ?? channel.basePercentage;
    const spend = (percentage / 100) * totalBudget;
    const metrics = calculateChannelMetrics(channel, spend);

    totalSpend += metrics.spend;
    totalImpressions += metrics.impressions;
    totalClicks += metrics.clicks;
    totalConversions += metrics.conversions;
    totalRevenue += metrics.revenue;
  });

  const blendedCpa = totalConversions > 0 ? totalSpend / totalConversions : null;
  const blendedRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

  return {
    totalSpend,
    totalImpressions,
    totalClicks,
    totalConversions,
    blendedCpa,
    projectedRevenue: totalRevenue,
    blendedRoas,
  };
}

// Local storage helpers
const STORAGE_KEY = 'mediaplan-scenarios';

export function saveScenario(scenario: BudgetScenario): void {
  const existing = loadScenarios();
  const updated = [...existing.filter((s) => s.id !== scenario.id), scenario];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export function loadScenarios(): BudgetScenario[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    return JSON.parse(data).map((s: BudgetScenario) => ({
      ...s,
      createdAt: new Date(s.createdAt),
    }));
  } catch {
    return [];
  }
}

export function deleteScenario(id: string): void {
  const existing = loadScenarios();
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(existing.filter((s) => s.id !== id))
  );
}
