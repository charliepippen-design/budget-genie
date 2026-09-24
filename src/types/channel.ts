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
    conversionRate?: number;  // % Overall Click-to-FTD (fallback)
    clickToReg?: number;      // % Click-to-Registration (e.g. 5-10%)
    regToFtd?: number;        // % Registration-to-FTD (e.g. 15-25%)
    aov?: number;             // Average Order Value / LTV / NGR per FTD
    expectedLtv?: number;     // Expected Lifetime Value per user (iGaming specific)
    trafficPerUnit?: number;  // Est. Traffic for Flat Fee / Retainer
    saturationCeiling?: number; // Spend level where returns diminish significantly
  };
}

// ========== UNIFIED OUTPUT SCHEMA ==========

export interface UnifiedMetrics {
  spend: number;          // The final money out
  impressions: number;    // Impressions
  clicks: number;         // Calculated clicks
  registrations: number;  // Registrations (Leads)
  ftds: number;           // The final conversions (FTDs)
  cpl: number | null;     // Cost Per Lead / Registration
  cpa: number | null;     // Cost Per Acquisition (Spend / FTDs)
  revenue: number;        // FTDs * Player Value or Spend * ROAS
  roas: number;           // Revenue / Spend
  effectiveCr: number;    // Click-to-FTD CR %
}

// ========== CALCULATION HELPER ==========

export function calculateUnifiedMetrics(
  config: ChannelTypeConfig,
  spend: number, // Total annual/input spend
  playerValue: number = 150 // Default LTV per player
): UnifiedMetrics {
  const { buyingModel, price, secondaryPrice, baselineMetrics } = config;

  // Defaults & Funnel Rates
  const ctr = baselineMetrics.ctr || 1;
  const clickToReg = baselineMetrics.clickToReg ?? (baselineMetrics.conversionRate ? Math.min(100, baselineMetrics.conversionRate * 3.5) : 6);
  const regToFtd = baselineMetrics.regToFtd ?? (baselineMetrics.conversionRate ? (baselineMetrics.conversionRate / (clickToReg / 100)) : 15);
  const effectiveCr = (clickToReg / 100) * (regToFtd / 100) * 100;
  const effectiveLtv = baselineMetrics.expectedLtv || baselineMetrics.aov || playerValue;

  let ftds = 0;
  let registrations = 0;
  let impressions = 0;
  let clicks = 0;
  let finalSpend = spend;

  switch (buyingModel) {
    case 'CPM': // price = CPM
      // Math: Budget -> Impr -> Clicks -> Regs -> FTDs
      impressions = price > 0 ? (spend / price) * 1000 : 0;
      clicks = impressions * (ctr / 100);
      registrations = clicks * (clickToReg / 100);
      ftds = registrations * (regToFtd / 100);
      break;

    case 'CPC': // price = CPC
      // Math: Budget -> Clicks -> Regs -> FTDs
      clicks = price > 0 ? spend / price : 0;
      registrations = clicks * (clickToReg / 100);
      ftds = registrations * (regToFtd / 100);
      impressions = ctr > 0 ? (clicks / (ctr / 100)) : clicks * 100;
      break;

    case 'CPA': // price = Target CPA
      // Math: Budget / CPA = FTDs
      ftds = price > 0 ? spend / price : 0;
      registrations = regToFtd > 0 ? ftds / (regToFtd / 100) : ftds * 5;
      clicks = clickToReg > 0 ? registrations / (clickToReg / 100) : registrations * 15;
      impressions = ctr > 0 ? clicks / (ctr / 100) : clicks * 100;
      break;

    case 'REV_SHARE':
      {
        const rs = (secondaryPrice || price || 25) / 100;
        const costPerFtd = effectiveLtv * rs;
        ftds = costPerFtd > 0 ? spend / costPerFtd : 0;
        registrations = regToFtd > 0 ? ftds / (regToFtd / 100) : ftds * 5;
        clicks = clickToReg > 0 ? registrations / (clickToReg / 100) : registrations * 15;
        impressions = ctr > 0 ? clicks / (ctr / 100) : clicks * 100;
      }
      break;

    case 'HYBRID': // price = Base CPA, secondaryPrice = RevShare %
      {
        const baseCpa = price;
        const rs = (secondaryPrice || 0) / 100;
        const totalCostPerFtd = baseCpa + (effectiveLtv * rs);

        ftds = totalCostPerFtd > 0 ? spend / totalCostPerFtd : 0;
        registrations = regToFtd > 0 ? ftds / (regToFtd / 100) : ftds * 5;
        clicks = clickToReg > 0 ? registrations / (clickToReg / 100) : registrations * 15;
        impressions = ctr > 0 ? clicks / (ctr / 100) : clicks * 100;
      }
      break;

    case 'FLAT_FEE':
    case 'RETAINER':
      finalSpend = price;
      {
        const traffic = baselineMetrics.trafficPerUnit ?? (price > 0 ? Math.round(price * 1.5) : 1000);
        clicks = traffic;
        impressions = clicks * 20;
        registrations = clicks * (clickToReg / 100);
        ftds = registrations * (regToFtd / 100);
      }
      break;
  }

  // 1. Calculate Diminishing Returns (Saturation)
  let effectiveFtds = ftds;
  let effectiveRegs = registrations;
  const saturation = baselineMetrics.saturationCeiling;

  if (saturation && saturation > 0 && finalSpend > 0) {
    const decayFactor = 1 / (1 + (finalSpend / saturation));
    effectiveFtds = ftds * decayFactor;
    effectiveRegs = registrations * Math.sqrt(decayFactor);
  }

  // 2. Revenue derives directly from effective conversions * player LTV
  const revenue = effectiveFtds * effectiveLtv;

  const cpl = effectiveRegs > 0 ? finalSpend / effectiveRegs : null;
  const cpa = effectiveFtds > 0 ? finalSpend / effectiveFtds : null;
  const roas = finalSpend > 0 ? revenue / finalSpend : 0;

  return {
    spend: finalSpend,
    impressions,
    clicks,
    registrations: effectiveRegs,
    ftds: effectiveFtds,
    cpl,
    cpa,
    revenue,
    roas,
    effectiveCr,
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

  if (/\b(rev_?share|revshare|rs)\b/i.test(lower) || lower.includes('rev share') || lower.includes('revenue share')) return 'REV_SHARE';
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
