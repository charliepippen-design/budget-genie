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
  | 'cpm'           // Cost per Mille (Display)
  | 'cpc'           // Cost per Click (Search)
  | 'cpa'           // Cost per Acquisition (Affiliate Standard)
  | 'cpl'           // Cost per Lead (CRM/sweeps)
  | 'rev_share'     // % of NGR (Affiliate RS)
  | 'hybrid'        // CPA + RevShare (Affiliate Hybrid)
  | 'flat_fee'      // Fixed listing/tenancy (Affiliate/Sponsorship)
  | 'retainer'      // Monthly Agency Fee (SEO/PR)
  | 'unit_based'    // Per Post/Article (Influencer/Content)
  | 'input_based';  // Manual Spend + Manual Traffic input (General)

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
    defaultModel: 'cpm', 
    allowedModels: ['cpm', 'cpc', 'cpa'],
    icon: 'Megaphone',
    color: 'hsl(var(--chart-2))'
  },
  affiliate: { 
    name: 'Affiliates', 
    defaultModel: 'cpa', 
    allowedModels: ['cpa', 'rev_share', 'hybrid', 'flat_fee'],
    icon: 'Users',
    color: 'hsl(var(--chart-3))'
  },
  influencer: { 
    name: 'Influencers', 
    defaultModel: 'unit_based', 
    allowedModels: ['unit_based', 'flat_fee', 'rev_share', 'hybrid'],
    icon: 'Star',
    color: 'hsl(var(--chart-4))'
  },
  seo_content: { 
    name: 'SEO & Content', 
    defaultModel: 'retainer', 
    allowedModels: ['retainer', 'unit_based', 'input_based'],
    icon: 'Search',
    color: 'hsl(var(--chart-1))'
  },
  pr_brand: { 
    name: 'PR & Brand', 
    defaultModel: 'flat_fee', 
    allowedModels: ['flat_fee', 'retainer', 'unit_based'],
    icon: 'Award',
    color: 'hsl(var(--chart-5))'
  },
  email_crm: { 
    name: 'Email & CRM', 
    defaultModel: 'cpl', 
    allowedModels: ['cpl', 'cpm', 'input_based'],
    icon: 'Mail',
    color: 'hsl(var(--chart-6))'
  },
};

export const BUYING_MODEL_INFO: Record<BuyingModel, {
  name: string;
  description: string;
  requiredFields: string[];
}> = {
  cpm: {
    name: 'CPM',
    description: 'Cost per 1,000 impressions',
    requiredFields: ['cpm', 'ctr', 'cr'],
  },
  cpc: {
    name: 'CPC',
    description: 'Cost per click',
    requiredFields: ['cpc', 'cr'],
  },
  cpa: {
    name: 'CPA',
    description: 'Cost per acquisition/FTD',
    requiredFields: ['targetCpa', 'targetFtds'],
  },
  cpl: {
    name: 'CPL',
    description: 'Cost per lead',
    requiredFields: ['cpl', 'leadToFtdRate'],
  },
  rev_share: {
    name: 'Revenue Share',
    description: 'Percentage of player revenue',
    requiredFields: ['revSharePercentage', 'ngrPerFtd', 'targetFtds'],
  },
  hybrid: {
    name: 'Hybrid',
    description: 'CPA + Revenue Share combined',
    requiredFields: ['targetCpa', 'revSharePercentage', 'ngrPerFtd', 'targetFtds'],
  },
  flat_fee: {
    name: 'Flat Fee',
    description: 'Fixed cost listing/tenancy',
    requiredFields: ['fixedCost', 'estFtds'],
  },
  retainer: {
    name: 'Retainer',
    description: 'Monthly fixed agency fee',
    requiredFields: ['fixedCost', 'estTraffic', 'cr'],
  },
  unit_based: {
    name: 'Unit Based',
    description: 'Cost per post/article/video',
    requiredFields: ['unitCount', 'costPerUnit', 'estReachPerUnit', 'ctr', 'cr'],
  },
  input_based: {
    name: 'Manual Input',
    description: 'Manual spend and traffic entry',
    requiredFields: ['fixedCost', 'estFtds'],
  },
};

// ========== EXTENDED CHANNEL INTERFACE ==========

export interface ChannelTypeConfig {
  // Core type info
  family: ChannelFamily;
  buyingModel: BuyingModel;
  
  // Performance Model Fields (CPM/CPC)
  cpm?: number;           // CPM rate
  cpc?: number;           // CPC rate
  ctr?: number;           // Click-through rate %
  cr?: number;            // Conversion/FTD rate %
  
  // Affiliate Fields
  targetCpa?: number;     // CPA amount for CPA deals
  revSharePercentage?: number;  // 0-100 for rev share
  ngrPerFtd?: number;     // Net Gaming Revenue per player
  targetFtds?: number;    // Expected FTDs (reverse calc)
  
  // Production Fields (Influencer/Content)
  unitCount?: number;     // Number of posts/articles
  costPerUnit?: number;   // Fee per unit
  estReachPerUnit?: number;   // Est. impressions per unit
  
  // Retainer/Fixed Fields
  fixedCost?: number;     // Monthly fee or listing cost
  estTraffic?: number;    // Estimated traffic/visits
  estFtds?: number;       // Est. FTDs for fixed cost models
  
  // Lead Fields
  cpl?: number;           // Cost per lead
  leadToFtdRate?: number; // Lead to FTD conversion %
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
  spend: number,
  playerValue: number = 150 // Default LTV per player
): UnifiedMetrics {
  const { buyingModel } = config;
  
  let ftds = 0;
  let impressions = 0;
  let clicks = 0;
  let finalSpend = spend;
  
  switch (buyingModel) {
    // ========== PERFORMANCE MODELS ==========
    case 'cpm': {
      const cpm = config.cpm || 5;
      const ctr = config.ctr || 1;
      const cr = config.cr || 2.5;
      
      impressions = (spend / cpm) * 1000;
      clicks = impressions * (ctr / 100);
      ftds = clicks * (cr / 100);
      break;
    }
    
    case 'cpc': {
      const cpc = config.cpc || 0.5;
      const cr = config.cr || 2.5;
      
      clicks = spend / cpc;
      ftds = clicks * (cr / 100);
      impressions = clicks * 100; // Assume 1% CTR for impression estimate
      break;
    }
    
    // ========== AFFILIATE MODELS (REVERSE CALCULATION) ==========
    case 'cpa': {
      const targetCpa = config.targetCpa || 50;
      const targetFtds = config.targetFtds || 10;
      
      ftds = targetFtds;
      finalSpend = ftds * targetCpa;
      break;
    }
    
    case 'rev_share': {
      const revShare = (config.revSharePercentage || 30) / 100;
      const ngr = config.ngrPerFtd || 150;
      const targetFtds = config.targetFtds || 10;
      
      ftds = targetFtds;
      finalSpend = ftds * ngr * revShare;
      break;
    }
    
    case 'hybrid': {
      const targetCpa = config.targetCpa || 50;
      const revShare = (config.revSharePercentage || 20) / 100;
      const ngr = config.ngrPerFtd || 150;
      const targetFtds = config.targetFtds || 10;
      
      ftds = targetFtds;
      const cpaCost = ftds * targetCpa;
      const revShareCost = ftds * ngr * revShare;
      finalSpend = cpaCost + revShareCost;
      break;
    }
    
    case 'flat_fee': {
      const fixedCost = config.fixedCost || spend;
      const estFtds = config.estFtds || 5;
      
      finalSpend = fixedCost;
      ftds = estFtds;
      break;
    }
    
    // ========== PRODUCTION MODELS ==========
    case 'unit_based': {
      const units = config.unitCount || 1;
      const costPerUnit = config.costPerUnit || 500;
      const reachPerUnit = config.estReachPerUnit || 50000;
      const ctr = config.ctr || 2;
      const cr = config.cr || 1;
      
      finalSpend = units * costPerUnit;
      impressions = units * reachPerUnit;
      clicks = impressions * (ctr / 100);
      ftds = clicks * (cr / 100);
      break;
    }
    
    case 'retainer': {
      const fixedCost = config.fixedCost || spend;
      const estTraffic = config.estTraffic || 5000;
      const cr = config.cr || 2;
      
      finalSpend = fixedCost;
      clicks = estTraffic; // Traffic = "clicks" for organic
      ftds = estTraffic * (cr / 100);
      break;
    }
    
    // ========== INPUT-BASED ==========
    case 'input_based': {
      finalSpend = config.fixedCost || spend;
      ftds = config.estFtds || 0;
      break;
    }
    
    // ========== LEAD MODELS ==========
    case 'cpl': {
      const cpl = config.cpl || 5;
      const leadToFtd = config.leadToFtdRate || 10;
      
      const leads = spend / cpl;
      ftds = leads * (leadToFtd / 100);
      break;
    }
  }
  
  const revenue = ftds * playerValue;
  const cpa = ftds > 0 ? finalSpend / ftds : null;
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
  
  // SEO / Content
  if (lower.includes('seo') || lower.includes('content') || lower.includes('blog') || lower.includes('organic')) {
    return 'seo_content';
  }
  
  // Affiliates
  if (lower.includes('affiliate') || lower.includes('partner') || lower.includes('listing') || lower.includes('cpa commission')) {
    return 'affiliate';
  }
  
  // Influencers
  if (lower.includes('influencer') || lower.includes('twitch') || lower.includes('tiktok') || 
      lower.includes('youtube') || lower.includes('ambassador') || lower.includes('streamer')) {
    return 'influencer';
  }
  
  // PR / Brand
  if (lower.includes('pr') || lower.includes('press') || lower.includes('sponsor') || 
      lower.includes('brand') || lower.includes('offline')) {
    return 'pr_brand';
  }
  
  // Email / CRM
  if (lower.includes('email') || lower.includes('crm') || lower.includes('newsletter') || 
      lower.includes('database') || lower.includes('retention')) {
    return 'email_crm';
  }
  
  // Default to paid media
  return 'paid_media';
}

export function inferBuyingModel(name: string, family: ChannelFamily): BuyingModel {
  const lower = name.toLowerCase();
  
  // Specific patterns
  if (lower.includes('revshare') || lower.includes('rev share') || lower.includes('rs')) {
    return 'rev_share';
  }
  if (lower.includes('hybrid')) {
    return 'hybrid';
  }
  if (lower.includes('listing') || lower.includes('tenancy') || lower.includes('fixed fee')) {
    return 'flat_fee';
  }
  if (lower.includes('retainer')) {
    return 'retainer';
  }
  if (lower.includes('post') || lower.includes('article') || lower.includes('video')) {
    return 'unit_based';
  }
  
  // Fall back to family default
  return FAMILY_INFO[family].defaultModel;
}
