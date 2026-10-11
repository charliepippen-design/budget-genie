import type { ChannelCategory } from '@/lib/mediaplan-data';
import { ChannelTypeConfig, inferChannelFamily, inferBuyingModel } from '@/types/channel';
import { DEFAULT_IGAMING_REVENUE_INPUTS } from '@/lib/igaming-revenue-model';
import type { ChannelData, GlobalMultipliers } from './types';

// ========== DEFAULT DATA ==========

export const BASE_CHANNELS_DATA = [
  // SEO & Content (RETAINER — fixed monthly spend, traffic × CR = FTDs)
  {
    id: 'seo-tech',
    name: 'SEO - Tech Audit & On-Page',
    category: 'SEO/Content' as ChannelCategory,
    baseSpend: 500,
    cpm: 2.5,
    ctr: 0.8,
    conversionRate: 0.8, // Organic: lower intent, slower funnel
    roas: 3.2,
  },
  {
    id: 'seo-content',
    name: 'SEO - Content Production',
    category: 'SEO/Content' as ChannelCategory,
    baseSpend: 1500,
    cpm: 1.8,
    ctr: 1.2,
    conversionRate: 1.0, // Content-driven organic converts slightly better
    roas: 4.5,
  },
  {
    id: 'seo-backlinks',
    name: 'SEO - Backlinks / Guest Posts',
    category: 'SEO/Content' as ChannelCategory,
    baseSpend: 1000,
    cpm: 3.5,
    ctr: 0.5,
    conversionRate: 0.8,
    roas: 2.8,
  },
  // Paid Media (CPM — impressions → clicks → FTDs)
  {
    id: 'paid-native',
    name: 'Paid - Native Ads',
    category: 'Display/Programmatic' as ChannelCategory,
    baseSpend: 2500,
    // CPM $4.2, CTR 0.35%, CR 1.2% → linear ROAS ≈ 1.5x (cold display, moderate intent)
    cpm: 4.2,
    ctr: 0.35,
    conversionRate: 1.2,
    roas: 1.8,
  },
  {
    id: 'paid-push',
    name: 'Paid - Push Notifications',
    category: 'Display/Programmatic' as ChannelCategory,
    baseSpend: 1500,
    // CPM raised $1.2 → $5.0; CR cut 1.2% → 0.3%
    // Push clickers are low-intent: high CTR but poor click-to-deposit rate.
    // Linear ROAS: (1000/5) × 0.025 × 0.003 × 150 ≈ 2.25x ✓
    cpm: 5.0,
    ctr: 2.5,
    conversionRate: 0.3,
    roas: 2.2,
  },
  {
    id: 'paid-programmatic',
    name: 'Paid - Programmatic / Display',
    category: 'Display/Programmatic' as ChannelCategory,
    baseSpend: 1000,
    // CTR raised 0.15% → 0.25%; CR raised 0.8% → 2.5%
    // Previous values gave 0.33x ROAS — unprofitable out of the box.
    // Linear ROAS: (1000/5.5) × 0.0025 × 0.025 × 150 ≈ 1.7x ✓
    cpm: 5.5,
    ctr: 0.25,
    conversionRate: 2.5,
    roas: 1.5,
  },
  {
    id: 'paid-retargeting',
    name: 'Paid - Retargeting (Pixel)',
    category: 'Display/Programmatic' as ChannelCategory,
    baseSpend: 500,
    // CPM raised $8 → $25 — retargeting premium inventory in iGaming is expensive.
    // Linear ROAS: (1000/25) × 0.018 × 0.045 × 150 ≈ 4.86x ✓ (warm audience deserves premium)
    cpm: 25.0,
    ctr: 1.8,
    conversionRate: 4.5,
    roas: 4.2,
  },
  // Affiliates
  {
    id: 'affiliate-listing',
    name: 'Affiliate - Listing Fees (Fixed)',
    category: 'Affiliate' as ChannelCategory,
    baseSpend: 1000,
    cpm: 15.0,
    ctr: 3.5,
    conversionRate: 3.0, // Affiliate referral traffic is pre-qualified
    roas: 2.0,
  },
  {
    id: 'affiliate-cpa',
    name: 'Affiliate - CPA Commissions',
    category: 'Affiliate' as ChannelCategory,
    baseSpend: 8500,
    cpm: 25.0,
    ctr: 4.2,
    conversionRate: 15.0, // CPA model: FTD = spend/CPA; CR only used for click back-calc
    roas: 3.5,
  },
  // Influencers (RETAINER / FLAT_FEE — fixed spend, estimated traffic × CR)
  {
    id: 'influencer-retainers',
    name: 'Influencer - Monthly Retainers',
    category: 'Paid Social' as ChannelCategory,
    baseSpend: 2000,
    cpm: 12.0,
    ctr: 1.5,
    conversionRate: 2.0, // Engaged community, medium conversion
    roas: 2.5,
  },
  {
    id: 'influencer-funds',
    name: 'Influencer - Play Funds (Balance)',
    category: 'Paid Social' as ChannelCategory,
    baseSpend: 1500,
    cpm: 10.0,
    ctr: 2.0,
    conversionRate: 2.5, // Bonus-incentivised traffic converts well
    roas: 3.0,
  },
];

export const DEFAULT_MULTIPLIERS: GlobalMultipliers = {
  spendMultiplier: 1.0,
  defaultCpmOverride: null,
  ctrBump: 0,
  cpaTarget: null,
  roasTarget: null,
  playerValue: 150, // Default LTV per FTD
  retentionRate: DEFAULT_IGAMING_REVENUE_INPUTS.retentionRate,
  regToFtdCvr: DEFAULT_IGAMING_REVENUE_INPUTS.regToFtdCvr,
  turnoverRate: DEFAULT_IGAMING_REVENUE_INPUTS.turnoverRate,
  margin: DEFAULT_IGAMING_REVENUE_INPUTS.margin,
  bonusRate: DEFAULT_IGAMING_REVENUE_INPUTS.bonusRate,
};

// Helper to create type config from legacy channel data
export function createTypeConfigFromLegacy(ch: (typeof BASE_CHANNELS_DATA)[0]): ChannelTypeConfig {
  const family = inferChannelFamily(ch.name);
  const buyingModel = inferBuyingModel(ch.name, family);

  let price = 0;
  const secondaryPrice = 0;

  // Map legacy values to new Price field
  switch (buyingModel) {
    case 'CPM':
      price = ch.cpm;
      break;
    case 'CPC':
      price = ch.cpm / 10;
      break; // Rough est
    case 'CPA':
      price = 50;
      break; // Default CPA
    case 'FLAT_FEE':
      price = ch.baseSpend;
      break;
    case 'RETAINER':
      price = ch.baseSpend;
      break;
    default:
      price = ch.cpm;
  }

  return {
    family,
    buyingModel,
    price,
    secondaryPrice,
    baselineMetrics: {
      ctr: ch.ctr,
      // Use channel-specific conversion rate so each channel type produces
      // credible metrics on first load rather than a uniform 2.5% across the board.
      conversionRate: ch.conversionRate ?? 2.5,
      aov: 150,
      trafficPerUnit: 1000,
      // Saturation ceiling at 3× base spend is a reasonable starting point.
      // Retargeting and affiliate CPA have naturally lower ceilings (tighter audiences).
      saturationCeiling: ch.baseSpend * 3,
    },
  };
}

export function createInitialChannels(): ChannelData[] {
  const totalBaseSpend = BASE_CHANNELS_DATA.reduce((sum, ch) => sum + ch.baseSpend, 0);

  return BASE_CHANNELS_DATA.map((ch) => {
    const family = inferChannelFamily(ch.name);
    const buyingModel = inferBuyingModel(ch.name, family);
    const typeConfig = createTypeConfigFromLegacy(ch);

    // Auto-detect tier based on buying model
    let tier: 'fixed' | 'scalable' | 'capped' = 'scalable';
    if (buyingModel === 'RETAINER' || buyingModel === 'FLAT_FEE') {
      tier = 'fixed';
    }

    return {
      id: ch.id,
      name: ch.name,
      category: ch.category,
      allocationPct: (ch.baseSpend / totalBaseSpend) * 100,

      family,
      buyingModel,
      typeConfig,

      tier,
      maxSpendLimit: 0, // 0 = no limit

      locked: false,
      isActive: true,
    };
  });
}
