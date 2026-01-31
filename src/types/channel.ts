// ========== CHANNEL TYPE DEFINITIONS ==========
// Polymorphic channel model for multi-model media planning

export type ChannelFamily =
  | 'paid_media'    // PPC, Display, Social
  | 'affiliate'     // Networks, Partners
  | 'influencer'    // Creators, Streamers
  | 'seo_content'   // Organic Search, Blog
  | 'pr_brand'      // Offline, Press, Sponsorships
  | 'email_crm';    // Database marketing

export type BuyingModel =
  | 'CPM'
  | 'CPC'
  | 'CPA'
  | 'REV_SHARE'
  | 'HYBRID'
  | 'FLAT_FEE'
  | 'RETAINER';

// ========== FAMILY METADATA ==========

export const FAMILY_INFO: Record<ChannelFamily, {
  name: string;
  defaultModel: BuyingModel;
  allowedModels: BuyingModel[];
  icon: string;
  color: string;
}> = {
  paid_media: {
    name: 'Paid Media',
    defaultModel: 'CPM',
    allowedModels: ['CPM', 'CPC', 'CPA'],
    icon: 'Megaphone',
    color: 'hsl(var(--chart-2))'
  },
  affiliate: {
    name: 'Affiliates',
    defaultModel: 'CPA',
    allowedModels: ['CPA', 'REV_SHARE', 'HYBRID', 'FLAT_FEE'],
    icon: 'Users',
    color: 'hsl(var(--chart-3))'
  },
  influencer: {
    name: 'Influencers',
    defaultModel: 'FLAT_FEE',
    allowedModels: ['FLAT_FEE', 'REV_SHARE', 'HYBRID', 'CPM'],
    icon: 'Star',
    color: 'hsl(var(--chart-4))'
  },
  seo_content: {
    name: 'SEO & Content',
    defaultModel: 'RETAINER',
    allowedModels: ['RETAINER', 'FLAT_FEE'],
    icon: 'Search',
    color: 'hsl(var(--chart-1))'
  },
  pr_brand: {
    name: 'PR & Brand',
    defaultModel: 'FLAT_FEE',
    allowedModels: ['FLAT_FEE', 'RETAINER'],
    icon: 'Award',
    color: 'hsl(var(--chart-5))'
  },
  email_crm: {
    name: 'Email & CRM',
    defaultModel: 'CPM',
    allowedModels: ['CPM', 'FLAT_FEE'],
    icon: 'Mail',
    color: 'hsl(var(--chart-6))'
  },
};

export const BUYING_MODEL_INFO: Record<BuyingModel, {
  name: string;
  description: string;
}> = {
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
    name: 'Revenue Share',
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
  price: number;              // Acts as CPM, CPC, CPA, Monthly Fee, or Base CPA
  secondaryPrice?: number;    // Used as RevShare % for HYBRID/REV_SHARE (0-100)

  baselineMetrics: {
    ctr?: number;             // % Click Through Rate
    conversionRate?: number;  // % Conversion Rate (or Lead -> FTD)
    aov?: number;             // Average Order Value / LTV / NGR per FTD
    trafficPerUnit?: number;  // Est. Traffic for Flat Fee / Retainer
    saturationCeiling?: number; // Spend level where returns diminish significantly (Half-Efficiency point in Michaelis-Menten)
  };
}

// ========== UNIFIED OUTPUT SCHEMA ==========

export interface UnifiedMetrics {
  spend: number;          // The final money out
  ftds: number;           // The final conversions
  revenue: number;        // FTDs * Player Value or Spend * ROAS
  cpa: number | null;     // Spend / FTDs
  roas: number;           // Revenue / Spend
  impressions: number;    // For display channels
  clicks: number;         // Calculated clicks
}

// ========== CALCULATION HELPER ==========

export function calculateUnifiedMetrics(
  config: ChannelTypeConfig,
  spend: number, // Total annual/input spend
  playerValue: number = 150 // Default LTV per player
): UnifiedMetrics {
  const { buyingModel, price, secondaryPrice, baselineMetrics } = config;

  // Defaults
  const ctr = baselineMetrics.ctr || 1;
  const cr = baselineMetrics.conversionRate || 2.5;
  const aov = baselineMetrics.aov || playerValue;

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
      impressions = clicks * 100; // Estimate
      break;

    case 'CPA': // price = Target CPA
      // Math: Budget / CPA = Conv
      ftds = price > 0 ? spend / price : 0;
      // Reverse calculate impressions for reference
      clicks = cr > 0 ? (ftds / (cr / 100)) : 0;
      impressions = ctr > 0 ? (clicks / (ctr / 100)) : 0;
      break;

    case 'REV_SHARE': // price = % (Wait, secondaryPrice is %) - Let's use price as dummy or 0? 
      // The user spec said "secondaryPrice: number (Used ONLY for Hybrid RevShare %)".
      // But for Pure RevShare, we need a percentage. 
      // Let's assume price is the percentage if model is REV_SHARE? 
      // Or maybe secondaryPrice is widely used for percentage.
      // User Spec: "Add secondaryPrice: number (Used ONLY for Hybrid RevShare %)."
      // Re-reading user Step 1: "Add price: number (Acts as the CPA, CPM, CPC, or Monthly Fee...)"
      // For RevShare, usually there is no fixed price, just %. 
      // Maybe price = 0? And secondaryPrice = %. 
      // OR price = %. Let's use secondaryPrice for % as per spec for Hybrid.
      // PROPOSAL: For pure RevShare, stick to secondaryPrice for consistency or use price as the %.
      // Let's us price as % for purity if secondaryPrice is ONLY for hybrid.
      // Actually, let's use secondaryPrice for consistency of "Revenue Share %".
      // But wait, "price" is required.
      // Let's set price = 0 for Rev Share? 
      // And use secondaryPrice for the %.
      // Calculation: Est Revenue -> Cost.
      // For RevShare, Spend depends on performance. It's usually output driven.
      // But here we likely input Budget = Estimated Spend.
      // ftds = (Spend / (AOV * RevShare%)) ? 
      // Spend = FTDs * AOV * RevShare%
      // ftds = Spend / (AOV * (secondaryPrice/100))
      {
        const rs = (secondaryPrice || 0) / 100;
        const revenuePerFtd = aov;
        const costPerFtd = revenuePerFtd * rs;
        ftds = costPerFtd > 0 ? spend / costPerFtd : 0;
      }
      break;

    case 'HYBRID': // price = Base CPA, secondaryPrice = RevShare %
      {
        const baseCpa = price;
        const rs = (secondaryPrice || 0) / 100;
        const revenuePerFtd = aov;
        const totalCostPerFtd = baseCpa + (revenuePerFtd * rs);

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
        const traffic = baselineMetrics.trafficPerUnit || 1000;
        clicks = traffic; // Visits
        ftds = clicks * (cr / 100);
      }
      break;

    case 'RETAINER':
      // Same as Flat Fee
      finalSpend = price;
      {
        const traffic = baselineMetrics.trafficPerUnit || 1000;
        clicks = traffic;
        ftds = clicks * (cr / 100);
      }
      break;
  }

  // 1. Calculate Linear Revenue (Pre-Saturation)
  let revenue = ftds * playerValue;

  // 2. Apply Diminishing Returns (Saturation)
  // Formula: Revenue = LinearRevenue * (1 / (1 + (Spend / Saturation)))
  // Ideally, SaturationCeiling is the point where efficiency is halved.
  const saturation = baselineMetrics.saturationCeiling;

  if (saturation && saturation > 0 && finalSpend > 0) {
    const decayFactor = 1 / (1 + (finalSpend / saturation));
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

  if (lower.includes('seo') || lower.includes('content') || lower.includes('blog')) return 'seo_content';
  if (lower.includes('affiliate') || lower.includes('partner') || lower.includes('cpa')) return 'affiliate';
  if (lower.includes('influencer') || lower.includes('twitch') || lower.includes('tiktok')) return 'influencer';
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
  if (lower.includes('paid') || lower.includes('search') || lower.includes('native') || lower.includes('programmatic')) {
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
