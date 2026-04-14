import { ChannelCategory } from '@/lib/mediaplan-data';
import { DistributionStrategy } from '@/lib/distribution-logic';
import { BuyingModel, ChannelFamily } from '@/types/channel';

export type Vertical = 'igaming' | 'ecommerce' | 'saas' | 'lead_gen' | 'other';
export type IgamingSubvertical = 'casino' | 'sportsbook' | 'crypto_casino';

export interface VerticalPreset {
  label: string;
  description: string;
  emoji: string;
  defaultPlayerValue: number;
  defaultCpaTarget: number;
  defaultRoasTarget: number;
  suggestedStrategy: DistributionStrategy;
  channels: Array<{
    name: string;
    category: ChannelCategory;
    family: ChannelFamily;
    buyingModel: BuyingModel;
    allocationPct: number;
    typeConfig: {
      price: number;
      secondaryPrice?: number;
      baselineMetrics: {
        ctr?: number;
        conversionRate?: number;
        aov?: number;
        trafficPerUnit?: number;
        saturationCeiling?: number;
      };
    };
  }>;
}

export const VERTICAL_PRESETS: Record<Vertical, VerticalPreset> = {
  igaming: {
    label: 'iGaming / Betting',
    description: 'Sports betting, casino, poker',
    emoji: '🎰',
    defaultPlayerValue: 220,
    defaultCpaTarget: 80,
    defaultRoasTarget: 2.5,
    suggestedStrategy: 'affiliate_dominant',
    channels: [
      {
        name: 'Affiliate CPA Network',
        category: 'Affiliate',
        family: 'affiliate',
        buyingModel: 'CPA',
        allocationPct: 35,
        typeConfig: {
          price: 75,
          baselineMetrics: { conversionRate: 8, saturationCeiling: 50000 },
        },
      },
      {
        name: 'Paid Social (Meta/TikTok)',
        category: 'Paid Social',
        family: 'paid_media',
        buyingModel: 'CPM',
        allocationPct: 25,
        typeConfig: {
          price: 12,
          baselineMetrics: { ctr: 1.8, conversionRate: 3.5 },
        },
      },
      {
        name: 'Display / Programmatic',
        category: 'Display/Programmatic',
        family: 'paid_media',
        buyingModel: 'CPM',
        allocationPct: 20,
        typeConfig: {
          price: 6,
          baselineMetrics: { ctr: 0.8, conversionRate: 2.0 },
        },
      },
      {
        name: 'SEO & Content',
        category: 'SEO/Content',
        family: 'seo_content',
        buyingModel: 'RETAINER',
        allocationPct: 10,
        typeConfig: {
          price: 0,
          baselineMetrics: { trafficPerUnit: 800, conversionRate: 1.5 },
        },
      },
      {
        name: 'Email / CRM',
        category: 'Email/SMS',
        family: 'email_crm',
        buyingModel: 'FLAT_FEE',
        allocationPct: 10,
        typeConfig: {
          price: 0,
          baselineMetrics: { trafficPerUnit: 5000, conversionRate: 0.8 },
        },
      },
    ],
  },

  ecommerce: {
    label: 'eCommerce',
    description: 'Online retail, DTC brands',
    emoji: '🛍️',
    defaultPlayerValue: 120,
    defaultCpaTarget: 35,
    defaultRoasTarget: 3.5,
    suggestedStrategy: 'conversion_max',
    channels: [
      {
        name: 'Google Shopping / Search',
        category: 'Paid Search',
        family: 'paid_media',
        buyingModel: 'CPC',
        allocationPct: 35,
        typeConfig: {
          price: 1.2,
          baselineMetrics: { ctr: 3.5, conversionRate: 4.5 },
        },
      },
      {
        name: 'Meta Ads',
        category: 'Paid Social',
        family: 'paid_media',
        buyingModel: 'CPM',
        allocationPct: 25,
        typeConfig: {
          price: 14,
          baselineMetrics: { ctr: 1.5, conversionRate: 2.8 },
        },
      },
      {
        name: 'Retargeting',
        category: 'Display/Programmatic',
        family: 'paid_media',
        buyingModel: 'CPM',
        allocationPct: 20,
        typeConfig: {
          price: 8,
          baselineMetrics: { ctr: 2.5, conversionRate: 5.0 },
        },
      },
      {
        name: 'Influencer / UGC',
        category: 'Paid Social',
        family: 'influencer',
        buyingModel: 'FLAT_FEE',
        allocationPct: 12,
        typeConfig: {
          price: 0,
          baselineMetrics: { trafficPerUnit: 3000, conversionRate: 2.0 },
        },
      },
      {
        name: 'Email & SMS',
        category: 'Email/SMS',
        family: 'email_crm',
        buyingModel: 'FLAT_FEE',
        allocationPct: 8,
        typeConfig: {
          price: 0,
          baselineMetrics: { trafficPerUnit: 8000, conversionRate: 3.5 },
        },
      },
    ],
  },

  saas: {
    label: 'SaaS / Software',
    description: 'B2B or B2C subscription software',
    emoji: '💻',
    defaultPlayerValue: 800,
    defaultCpaTarget: 150,
    defaultRoasTarget: 2.0,
    suggestedStrategy: 'seo_foundation',
    channels: [
      {
        name: 'Google Ads (Search)',
        category: 'Paid Search',
        family: 'paid_media',
        buyingModel: 'CPC',
        allocationPct: 30,
        typeConfig: {
          price: 4.5,
          baselineMetrics: { ctr: 4.0, conversionRate: 3.0 },
        },
      },
      {
        name: 'LinkedIn Ads',
        category: 'Paid Social',
        family: 'paid_media',
        buyingModel: 'CPM',
        allocationPct: 25,
        typeConfig: {
          price: 28,
          baselineMetrics: { ctr: 0.6, conversionRate: 1.8 },
        },
      },
      {
        name: 'SEO & Content Marketing',
        category: 'SEO/Content',
        family: 'seo_content',
        buyingModel: 'RETAINER',
        allocationPct: 25,
        typeConfig: {
          price: 0,
          baselineMetrics: { trafficPerUnit: 1200, conversionRate: 2.5 },
        },
      },
      {
        name: 'Retargeting',
        category: 'Display/Programmatic',
        family: 'paid_media',
        buyingModel: 'CPM',
        allocationPct: 12,
        typeConfig: {
          price: 7,
          baselineMetrics: { ctr: 2.0, conversionRate: 4.0 },
        },
      },
      {
        name: 'Email Nurture',
        category: 'Email/SMS',
        family: 'email_crm',
        buyingModel: 'FLAT_FEE',
        allocationPct: 8,
        typeConfig: {
          price: 0,
          baselineMetrics: { trafficPerUnit: 2000, conversionRate: 5.0 },
        },
      },
    ],
  },

  lead_gen: {
    label: 'Lead Generation',
    description: 'Finance, insurance, real estate',
    emoji: '🎯',
    defaultPlayerValue: 180,
    defaultCpaTarget: 55,
    defaultRoasTarget: 3.0,
    suggestedStrategy: 'hybrid_growth',
    channels: [
      {
        name: 'Google Search Ads',
        category: 'Paid Search',
        family: 'paid_media',
        buyingModel: 'CPC',
        allocationPct: 40,
        typeConfig: {
          price: 3.5,
          baselineMetrics: { ctr: 5.0, conversionRate: 5.5 },
        },
      },
      {
        name: 'Facebook / Meta Ads',
        category: 'Paid Social',
        family: 'paid_media',
        buyingModel: 'CPM',
        allocationPct: 30,
        typeConfig: {
          price: 11,
          baselineMetrics: { ctr: 1.2, conversionRate: 3.0 },
        },
      },
      {
        name: 'Display & Native',
        category: 'Display/Programmatic',
        family: 'paid_media',
        buyingModel: 'CPM',
        allocationPct: 15,
        typeConfig: {
          price: 5,
          baselineMetrics: { ctr: 0.6, conversionRate: 1.5 },
        },
      },
      {
        name: 'Affiliate Leads',
        category: 'Affiliate',
        family: 'affiliate',
        buyingModel: 'CPA',
        allocationPct: 15,
        typeConfig: {
          price: 45,
          baselineMetrics: { conversionRate: 6.0 },
        },
      },
    ],
  },

  other: {
    label: 'Other / Mixed',
    description: 'General digital marketing',
    emoji: '📊',
    defaultPlayerValue: 150,
    defaultCpaTarget: 60,
    defaultRoasTarget: 2.5,
    suggestedStrategy: 'balanced',
    channels: [
      {
        name: 'Paid Search',
        category: 'Paid Search',
        family: 'paid_media',
        buyingModel: 'CPC',
        allocationPct: 30,
        typeConfig: {
          price: 2.0,
          baselineMetrics: { ctr: 3.5, conversionRate: 4.0 },
        },
      },
      {
        name: 'Paid Social',
        category: 'Paid Social',
        family: 'paid_media',
        buyingModel: 'CPM',
        allocationPct: 30,
        typeConfig: {
          price: 10,
          baselineMetrics: { ctr: 1.2, conversionRate: 2.5 },
        },
      },
      {
        name: 'Affiliate / Partnerships',
        category: 'Affiliate',
        family: 'affiliate',
        buyingModel: 'CPA',
        allocationPct: 20,
        typeConfig: {
          price: 50,
          baselineMetrics: { conversionRate: 5.0 },
        },
      },
      {
        name: 'SEO & Content',
        category: 'SEO/Content',
        family: 'seo_content',
        buyingModel: 'RETAINER',
        allocationPct: 20,
        typeConfig: {
          price: 0,
          baselineMetrics: { trafficPerUnit: 600, conversionRate: 2.0 },
        },
      },
    ],
  },
};
