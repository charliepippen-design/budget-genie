// ========== CHANNEL TYPE DEFINITIONS ==========
// Polymorphic channel model for multi-model media planning

export type ChannelFamily =
  | 'paid_media' // PPC, Display, Social
  | 'affiliate' // Networks, Partners
  | 'influencer' // Creators, Streamers
  | 'seo_content' // Organic Search, Blog
  | 'pr_brand' // Offline, Press, Sponsorships
  | 'email_crm'; // Database marketing

export type BuyingModel = 'CPM' | 'CPC' | 'CPA' | 'REV_SHARE' | 'HYBRID' | 'FLAT_FEE' | 'RETAINER';

// ========== FAMILY METADATA ==========

export const FAMILY_INFO: Record<
  ChannelFamily,
  {
    name: string;
    defaultModel: BuyingModel;
    allowedModels: BuyingModel[];
    icon: string;
    color: string;
  }
> = {
  paid_media: {
    name: 'Paid Media',
    defaultModel: 'CPM',
    allowedModels: ['CPM', 'CPC', 'CPA'],
    icon: 'Megaphone',
    color: 'hsl(var(--chart-2))',
  },
  affiliate: {
    name: 'Affiliates',
    defaultModel: 'CPA',
    allowedModels: ['CPA', 'REV_SHARE', 'HYBRID', 'FLAT_FEE'],
    icon: 'Users',
    color: 'hsl(var(--chart-3))',
  },
  influencer: {
    name: 'Influencers',
    defaultModel: 'FLAT_FEE',
    allowedModels: ['FLAT_FEE', 'REV_SHARE', 'HYBRID', 'CPM'],
    icon: 'Star',
    color: 'hsl(var(--chart-4))',
  },
  seo_content: {
    name: 'SEO & Content',
    defaultModel: 'RETAINER',
    allowedModels: ['RETAINER', 'FLAT_FEE'],
    icon: 'Search',
    color: 'hsl(var(--chart-1))',
  },
  pr_brand: {
    name: 'PR & Brand',
    defaultModel: 'FLAT_FEE',
    allowedModels: ['FLAT_FEE', 'RETAINER'],
    icon: 'Award',
    color: 'hsl(var(--chart-5))',
  },
  email_crm: {
    name: 'Email & CRM',
    defaultModel: 'CPM',
    allowedModels: ['CPM', 'FLAT_FEE'],
    icon: 'Mail',
    color: 'hsl(var(--chart-6))',
  },
};

export const BUYING_MODEL_INFO: Record<
  BuyingModel,
  {
    name: string;
    description: string;
  }
> = {
  CPM: {
    name: 'CPM',
    description: 'Cost per 1,000 impressions',
  },
  CPC: {
    name: 'CPC',
    description: 'Cost per click',
  },
  CPA: {
    name: 'CPA',
    description: 'Cost per acquisition',
  },
  REV_SHARE: {
    name: 'Rev Share',
    description: 'Percentage of revenue',
  },
  HYBRID: {
    name: 'Hybrid',
    description: 'CPA + RevShare combined',
  },
  FLAT_FEE: {
    name: 'Flat Fee',
    description: 'Fixed cost',
  },
  RETAINER: {
    name: 'Retainer',
    description: 'Monthly fixed fee',
  },
};

// ========== EXTENDED CHANNEL INTERFACE ==========

export interface ChannelTypeConfig {
  family: ChannelFamily;
  buyingModel: BuyingModel;

  // The DNA: Unifying all cost models into one flexible structure
  price: number; // Acts as CPM, CPC, CPA, Monthly Fee, or Base CPA
  secondaryPrice?: number; // Used as RevShare % for HYBRID/REV_SHARE (0-100)

  baselineMetrics: {
    ctr?: number; // % Click Through Rate
    conversionRate?: number; // % Conversion Rate (or Lead -> FTD)
    aov?: number; // Average Order Value / LTV / NGR per FTD
    trafficPerUnit?: number; // Est. Traffic for Flat Fee / Retainer
    saturationCeiling?: number; // Spend level where returns diminish significantly (Half-Efficiency point in Michaelis-Menten)
    /**
     * CPC channels only. Ratio of impressions per click for this channel.
     * If omitted, impressions are back-calculated from CTR (clicks / (ctr / 100)).
     * Explicit ratio overrides the back-calculation. Example: 50 means 1 click per 50 impressions.
     */
    cpcImpressionRatio?: number;
  };
}

// ========== UNIFIED OUTPUT SCHEMA ==========

export interface UnifiedMetrics {
  spend: number; // The final money out
  ftds: number; // The final conversions
  revenue: number; // FTDs * Player Value or Spend * ROAS
  cpa: number | null; // Spend / FTDs
  roas: number; // Revenue / Spend
  impressions: number; // For display channels
  clicks: number; // Calculated clicks
}

// ========== CALCULATION HELPER ==========

export function calculateUnifiedMetrics(
  config: ChannelTypeConfig,
  spend: number, // Total annual/input spend
  playerValue: number = 150 // Default LTV per player
): UnifiedMetrics {
  const { buyingModel, price, secondaryPrice, baselineMetrics } = config;

  // Defaults — use nullish coalescing (??) so an explicitly-set 0 is honoured
  // rather than being silently replaced by the fallback value (a || b behaviour
  // would incorrectly treat 0 the same as undefined/null).
  const ctr = baselineMetrics.ctr ?? 1;
  const cr = baselineMetrics.conversionRate ?? 2.5;
  const aov = baselineMetrics.aov ?? playerValue;

  let ftds = 0;
  let impressions = 0;
  let clicks = 0;
  let finalSpend = spend; // Default to input spend for budget-based models

  switch (buyingModel) {
    case 'CPM': // price = CPM
      // Math: Budget -> Impr -> Clicks -> Conv
      // Impressions = (Spend / CPM) * 1000
      impressions = price > 0 ? (spend / price) * 1000 : 0;
      clicks = impressions * (ctr / 100);
      ftds = clicks * (cr / 100);
      break;

    case 'CPC': // price = CPC
      // Math: Budget -> Clicks -> Conv
      clicks = price > 0 ? spend / price : 0;
      ftds = clicks * (cr / 100);
      // Impressions: use explicit ratio if provided, otherwise back-calculate from CTR.
      // Back-calculation: impressions = clicks / (ctr / 100). Guard against ctr = 0.
      if (baselineMetrics.cpcImpressionRatio && baselineMetrics.cpcImpressionRatio > 0) {
        impressions = clicks * baselineMetrics.cpcImpressionRatio;
      } else {
        impressions = ctr > 0 ? clicks / (ctr / 100) : 0;
      }
      break;

    case 'CPA': // price = Target CPA
      // Math: Budget / CPA = Conv
      ftds = price > 0 ? spend / price : 0;
      // Reverse calculate impressions for reference
      clicks = cr > 0 ? ftds / (cr / 100) : 0;
      impressions = ctr > 0 ? clicks / (ctr / 100) : 0;
      break;

    case 'REV_SHARE':
      // Revenue share model: the advertiser pays a % of revenue generated per FTD.
      // secondaryPrice holds the rev-share percentage (0–100).
      // Formula: costPerFtd = aov × (revSharePct / 100)
      //          ftds        = spend / costPerFtd
      // If secondaryPrice is missing or 0, the cost per FTD is indeterminate — return 0
      // rather than producing a division-by-zero or an infinite FTD count.
      {
        const revSharePct = secondaryPrice ?? 0; // intentional: 0 means unconfigured
        if (revSharePct <= 0) {
          // Channel is misconfigured or intentionally zero-rate — no conversions can be modelled.
          ftds = 0;
        } else {
          const costPerFtd = aov * (revSharePct / 100);
          ftds = costPerFtd > 0 ? spend / costPerFtd : 0;
        }
      }
      break;

    case 'HYBRID': // price = Base CPA, secondaryPrice = RevShare % (0 is valid — means no revshare component)
      {
        const baseCpa = price;
        const revSharePct = secondaryPrice ?? 0;
        const totalCostPerFtd = baseCpa + aov * (revSharePct / 100);
        // Guard: if both components are 0 the model is unconfigured.
        ftds = totalCostPerFtd > 0 ? spend / totalCostPerFtd : 0;
      }
      break;

    case 'FLAT_FEE': // price = Monthly Cost.
      // Budget is FIXED to this amount.
      // logic: spend = price.
      // But here we take 'spend' as arg.
      // Usually the store will force spend = price.
      // So here we assume spend IS price.
      finalSpend = price;
      // Traffic ? baselineMetris.trafficPerUnit?
      {
        const traffic = baselineMetrics.trafficPerUnit ?? 0;
        clicks = traffic; // Visits
        ftds = clicks * (cr / 100);
      }
      break;

    case 'RETAINER':
      // Same as Flat Fee
      finalSpend = price;
      {
        const traffic = baselineMetrics.trafficPerUnit ?? 0;
        clicks = traffic;
        ftds = clicks * (cr / 100);
      }
      break;
  }

  // 1. Calculate Linear Revenue (Pre-Saturation)
  let revenue = ftds * playerValue;

  // 2. Apply Diminishing Returns (Saturation — Michaelis-Menten decay)
  // Formula: Revenue = LinearRevenue × (1 / (1 + Spend / SaturationCeiling))
  // SaturationCeiling is the spend level where efficiency is exactly halved.
  // NOTE: If saturationCeiling is 0 or undefined, the decay is intentionally skipped.
  // Set a meaningful saturationCeiling on each channel to model real-world diminishing returns.
  const saturation = baselineMetrics.saturationCeiling;

  if (saturation && saturation > 0 && finalSpend > 0) {
    const decayFactor = 1 / (1 + finalSpend / saturation);
    revenue = revenue * decayFactor;
  }

  const cpa = ftds > 0 ? finalSpend / ftds : null;
  // Recalculate ROAS based on decayed revenue
  const roas = finalSpend > 0 ? revenue / finalSpend : 0;

  return {
    spend: finalSpend,
    ftds,
    revenue,
    cpa,
    roas,
    impressions,
    clicks,
  };
}

// ========== FAMILY DETECTION FROM NAME ==========

export function inferChannelFamily(name: string): ChannelFamily {
  const lower = name.toLowerCase();

  if (lower.includes('seo') || lower.includes('content') || lower.includes('blog'))
    return 'seo_content';
  if (lower.includes('affiliate') || lower.includes('partner') || lower.includes('cpa'))
    return 'affiliate';
  if (lower.includes('influencer') || lower.includes('twitch') || lower.includes('tiktok'))
    return 'influencer';
  if (lower.includes('pr') || lower.includes('brand')) return 'pr_brand';
  if (lower.includes('email') || lower.includes('crm')) return 'email_crm';

  return 'paid_media';
}

export function inferBuyingModel(name: string, family: ChannelFamily): BuyingModel {
  const lower = name.toLowerCase();

  if (lower.includes('revshare') || lower.includes('rs')) return 'REV_SHARE';
  if (lower.includes('hybrid')) return 'HYBRID';
  if (lower.includes('fixed') || lower.includes('listing')) return 'FLAT_FEE';
  if (lower.includes('retainer')) return 'RETAINER';
  if (lower.includes('cpa')) return 'CPA';
  if (lower.includes('cpc')) return 'CPC';
  if (lower.includes('cpm')) return 'CPM';

  return FAMILY_INFO[family].defaultModel;
}

// ========== DEFAULTS HELPER ==========

export function getLikelyModel(category: string): BuyingModel {
  const lower = category.toLowerCase();

  // Paid Search / Native / Listings: Default to CPC
  if (
    lower.includes('paid') ||
    lower.includes('search') ||
    lower.includes('native') ||
    lower.includes('programmatic')
  ) {
    // Broad check for PPC style
    return 'CPC'; // Or CPM depending on specific sub-channel, but generic default requested
  }

  // Social / Display / Pop: Default to CPM
  if (lower.includes('social') || lower.includes('display')) {
    return 'CPM';
  }

  // Affiliates: Default to CPA
  if (lower.includes('affiliate')) {
    return 'CPA';
  }

  // SEO / PR: Default to RETAINER
  if (lower.includes('seo') || lower.includes('pr') || lower.includes('brand')) {
    return 'RETAINER';
  }

  // Influencers: Default to FLAT_FEE
  if (lower.includes('influencer')) {
    return 'FLAT_FEE';
  }

  return 'CPM'; // Fallback
}
