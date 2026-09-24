import type { ChannelTemplate, IndustryPack } from './types';

// Benchmarks are planning estimates for Tier-1 markets (EUR, monthly).
// They are starting points: real campaign data should override them.

type T = ChannelTemplate;
const fit = (acquisition: number, retention: number, branding: number) => ({ acquisition, retention, branding });

// ========== iGAMING ==========

const IGAMING_CHANNELS: T[] = [
  { key: 'affiliate-cpa', name: 'Affiliates - CPA', category: 'Affiliate', family: 'affiliate', buyingModel: 'CPA', price: 200, ctr: 4, clickToLead: 8, leadToConversion: 25, ltv: 250, saturationCeiling: 80000, fit: fit(1, 0.1, 0.2), baseWeight: 1.4, tags: ['proven'], note: 'Pay only per FTD; backbone of most casino/sportsbook plans.' },
  { key: 'affiliate-hybrid', name: 'Affiliates - Hybrid (CPA + RevShare)', category: 'Affiliate', family: 'affiliate', buyingModel: 'HYBRID', price: 100, secondaryPrice: 25, ctr: 4, clickToLead: 8, leadToConversion: 25, ltv: 250, saturationCeiling: 50000, fit: fit(0.9, 0.2, 0.2), baseWeight: 0.8, tags: ['proven'], note: 'Lower upfront CPA, long-tail revshare cost.' },
  { key: 'affiliate-listing', name: 'Affiliates - Listing Fees (Fixed)', category: 'Affiliate', family: 'affiliate', buyingModel: 'FLAT_FEE', price: 1000, ctr: 3.5, clickToLead: 12, leadToConversion: 20, ltv: 220, trafficPerUnit: 800, saturationCeiling: 4000, fit: fit(0.7, 0, 0.5), baseWeight: 0.5, minBudget: 10000, tags: ['fixed_cost'], note: 'Top-3 positions on comparison sites.' },
  { key: 'google-search', name: 'Google Search (Licensed)', category: 'Paid Search', family: 'paid_media', buyingModel: 'CPC', price: 6, ctr: 4, clickToLead: 10, leadToConversion: 25, ltv: 280, saturationCeiling: 40000, fit: fit(1, 0.2, 0.3), baseWeight: 1, minBudget: 15000, tags: ['restricted', 'proven'], note: 'Needs Google gambling certification in each market.' },
  { key: 'meta-social', name: 'Meta Ads (Licensed)', category: 'Paid Social', family: 'paid_media', buyingModel: 'CPM', price: 9, ctr: 0.9, clickToLead: 4, leadToConversion: 18, ltv: 200, saturationCeiling: 30000, fit: fit(0.7, 0.3, 0.7), baseWeight: 0.7, tags: ['restricted'], note: 'Only with written Meta approval for gambling.' },
  { key: 'native', name: 'Native Ads', category: 'Display/Programmatic', family: 'paid_media', buyingModel: 'CPM', price: 3.8, ctr: 0.45, clickToLead: 3, leadToConversion: 10, ltv: 160, saturationCeiling: 15000, fit: fit(0.7, 0, 0.3), baseWeight: 0.6, note: 'Scalable but lower player quality.' },
  { key: 'push', name: 'Push Notifications', category: 'Display/Programmatic', family: 'paid_media', buyingModel: 'CPM', price: 1.5, ctr: 1.2, clickToLead: 2.5, leadToConversion: 6, ltv: 90, saturationCeiling: 6000, fit: fit(0.5, 0, 0.1), baseWeight: 0.3, tags: ['experimental'], note: 'Cheap volume, low LTV; keep as a test budget.' },
  { key: 'programmatic', name: 'Programmatic Display', category: 'Display/Programmatic', family: 'paid_media', buyingModel: 'CPM', price: 5.5, ctr: 0.25, clickToLead: 4, leadToConversion: 10, ltv: 180, saturationCeiling: 25000, fit: fit(0.3, 0.1, 0.9), baseWeight: 0.5, note: 'Reach and brand recall more than direct FTDs.' },
  { key: 'retargeting', name: 'Retargeting (Pixel)', category: 'Display/Programmatic', family: 'paid_media', buyingModel: 'CPM', price: 7.5, ctr: 1.5, clickToLead: 8, leadToConversion: 20, ltv: 220, saturationCeiling: 4000, fit: fit(0.6, 0.8, 0.2), baseWeight: 0.4, tags: ['proven'], note: 'Small but very efficient; limited by site traffic.' },
  { key: 'seo-content', name: 'SEO - Content & Links', category: 'SEO/Content', family: 'seo_content', buyingModel: 'RETAINER', price: 2500, ctr: 1, clickToLead: 8, leadToConversion: 18, ltv: 300, trafficPerUnit: 2500, saturationCeiling: 10000, fit: fit(0.8, 0.1, 0.6), baseWeight: 0.6, tags: ['fixed_cost'], note: 'Slow ramp (3-6 months), best long-term CPA.' },
  { key: 'streamers', name: 'Streamers & Influencers', category: 'Paid Social', family: 'influencer', buyingModel: 'FLAT_FEE', price: 3000, ctr: 1.5, clickToLead: 6, leadToConversion: 14, ltv: 180, trafficPerUnit: 3000, saturationCeiling: 15000, fit: fit(0.6, 0.1, 0.9), baseWeight: 0.5, minBudget: 20000, tags: ['fixed_cost', 'experimental'], note: 'Twitch/Kick streamers; high variance.' },
  { key: 'crm', name: 'CRM - Email/SMS Reactivation', category: 'Email/SMS', family: 'email_crm', buyingModel: 'RETAINER', price: 1200, ctr: 3, clickToLead: 15, leadToConversion: 20, ltv: 150, trafficPerUnit: 4000, saturationCeiling: 3000, fit: fit(0.1, 1, 0.2), baseWeight: 0.4, tags: ['fixed_cost', 'proven'], note: 'Reactivates dormant players; counts re-deposits.' },
  { key: 'sponsorship', name: 'Sports Sponsorship', category: 'Offline/TV', family: 'pr_brand', buyingModel: 'FLAT_FEE', price: 10000, ctr: 1, clickToLead: 3, leadToConversion: 15, ltv: 250, trafficPerUnit: 5000, saturationCeiling: 50000, fit: fit(0.2, 0.1, 1), baseWeight: 0.6, minBudget: 60000, tags: ['fixed_cost'], note: 'Brand play; weak short-term attribution.' },
];

// ========== FOREX / CFD ==========

const FOREX_CHANNELS: T[] = [
  { key: 'google-search', name: 'Google Search (Verified)', category: 'Paid Search', family: 'paid_media', buyingModel: 'CPC', price: 5, ctr: 3.5, clickToLead: 12, leadToConversion: 12, ltv: 1300, saturationCeiling: 40000, fit: fit(1, 0.1, 0.3), baseWeight: 1.2, tags: ['restricted', 'proven'], note: 'Requires Google financial services verification.' },
  { key: 'affiliate-cpa', name: 'Affiliates - CPA', category: 'Affiliate', family: 'affiliate', buyingModel: 'CPA', price: 500, ctr: 3, clickToLead: 10, leadToConversion: 12, ltv: 1200, saturationCeiling: 80000, fit: fit(1, 0.1, 0.2), baseWeight: 1.2, tags: ['proven'], note: 'CPA on first funded account.' },
  { key: 'ib-revshare', name: 'Introducing Brokers (RevShare)', category: 'Affiliate', family: 'affiliate', buyingModel: 'REV_SHARE', price: 30, secondaryPrice: 30, ctr: 3, clickToLead: 15, leadToConversion: 15, ltv: 1400, saturationCeiling: 50000, fit: fit(0.9, 0.4, 0.2), baseWeight: 0.8, tags: ['proven'], note: 'Pay a share of spread/commission; aligns with trader quality.' },
  { key: 'meta-social', name: 'Meta Ads (Financial)', category: 'Paid Social', family: 'paid_media', buyingModel: 'CPM', price: 12, ctr: 0.8, clickToLead: 5, leadToConversion: 8, ltv: 900, saturationCeiling: 30000, fit: fit(0.7, 0.2, 0.6), baseWeight: 0.7, tags: ['restricted'], note: 'Special ad category; strict creative rules.' },
  { key: 'youtube', name: 'YouTube Video', category: 'Paid Social', family: 'paid_media', buyingModel: 'CPM', price: 10, ctr: 0.5, clickToLead: 4, leadToConversion: 8, ltv: 1000, saturationCeiling: 30000, fit: fit(0.4, 0.1, 0.9), baseWeight: 0.5, minBudget: 20000, note: 'Education-led video builds trust.' },
  { key: 'native', name: 'Native Ads (Finance Publishers)', category: 'Display/Programmatic', family: 'paid_media', buyingModel: 'CPM', price: 4, ctr: 0.4, clickToLead: 3, leadToConversion: 7, ltv: 800, saturationCeiling: 20000, fit: fit(0.6, 0, 0.4), baseWeight: 0.5 },
  { key: 'programmatic', name: 'Programmatic Display', category: 'Display/Programmatic', family: 'paid_media', buyingModel: 'CPM', price: 6, ctr: 0.2, clickToLead: 3, leadToConversion: 8, ltv: 900, saturationCeiling: 25000, fit: fit(0.3, 0.1, 0.9), baseWeight: 0.4 },
  { key: 'retargeting', name: 'Retargeting', category: 'Display/Programmatic', family: 'paid_media', buyingModel: 'CPM', price: 9, ctr: 1.2, clickToLead: 10, leadToConversion: 15, ltv: 1100, saturationCeiling: 5000, fit: fit(0.6, 0.8, 0.2), baseWeight: 0.4, tags: ['proven'] },
  { key: 'seo-content', name: 'SEO - Education Content', category: 'SEO/Content', family: 'seo_content', buyingModel: 'RETAINER', price: 3500, ctr: 1, clickToLead: 8, leadToConversion: 10, ltv: 1300, trafficPerUnit: 3000, saturationCeiling: 12000, fit: fit(0.8, 0.2, 0.7), baseWeight: 0.6, tags: ['fixed_cost'], note: 'Slow ramp, compounding.' },
  { key: 'finfluencers', name: 'Finfluencers', category: 'Paid Social', family: 'influencer', buyingModel: 'FLAT_FEE', price: 4000, ctr: 1.5, clickToLead: 6, leadToConversion: 8, ltv: 1000, trafficPerUnit: 2500, saturationCeiling: 20000, fit: fit(0.6, 0.1, 0.9), baseWeight: 0.5, minBudget: 20000, tags: ['fixed_cost', 'experimental'], note: 'Check local regulator rules on paid promotion.' },
  { key: 'webinars', name: 'Webinars & Trading Academy', category: 'Other', family: 'pr_brand', buyingModel: 'FLAT_FEE', price: 1500, ctr: 2, clickToLead: 30, leadToConversion: 15, ltv: 1500, trafficPerUnit: 600, saturationCeiling: 6000, fit: fit(0.6, 0.7, 0.5), baseWeight: 0.4, tags: ['fixed_cost'], note: 'High-intent leads, strong for activation.' },
  { key: 'crm', name: 'CRM - Email & Account Managers', category: 'Email/SMS', family: 'email_crm', buyingModel: 'RETAINER', price: 1500, ctr: 3, clickToLead: 10, leadToConversion: 8, ltv: 1000, trafficPerUnit: 5000, saturationCeiling: 4000, fit: fit(0.2, 1, 0.1), baseWeight: 0.4, tags: ['fixed_cost', 'proven'], note: 'Converts demo accounts and re-activates traders.' },
  { key: 'sponsorship', name: 'Sports Sponsorship', category: 'Offline/TV', family: 'pr_brand', buyingModel: 'FLAT_FEE', price: 15000, ctr: 1, clickToLead: 3, leadToConversion: 8, ltv: 1200, trafficPerUnit: 5000, saturationCeiling: 60000, fit: fit(0.2, 0.1, 1), baseWeight: 0.6, minBudget: 80000, tags: ['fixed_cost'] },
];

// ========== FINTECH (neobank, payments, investing app) ==========

const FINTECH_CHANNELS: T[] = [
  { key: 'apple-search-ads', name: 'Apple Search Ads', category: 'Paid Search', family: 'paid_media', buyingModel: 'CPC', price: 2, ctr: 8, clickToLead: 25, leadToConversion: 20, ltv: 240, saturationCeiling: 20000, fit: fit(1, 0.2, 0.2), baseWeight: 0.9, tags: ['proven'], note: 'High-intent iOS installs.' },
  { key: 'google-app', name: 'Google App Campaigns', category: 'Paid Search', family: 'paid_media', buyingModel: 'CPC', price: 0.9, ctr: 2, clickToLead: 15, leadToConversion: 18, ltv: 200, saturationCeiling: 40000, fit: fit(1, 0.2, 0.3), baseWeight: 1, tags: ['proven'] },
  { key: 'meta-social', name: 'Meta Ads', category: 'Paid Social', family: 'paid_media', buyingModel: 'CPM', price: 9, ctr: 1, clickToLead: 8, leadToConversion: 18, ltv: 200, saturationCeiling: 40000, fit: fit(0.8, 0.3, 0.7), baseWeight: 0.9 },
  { key: 'tiktok', name: 'TikTok Ads', category: 'Paid Social', family: 'paid_media', buyingModel: 'CPM', price: 6, ctr: 0.8, clickToLead: 6, leadToConversion: 15, ltv: 160, saturationCeiling: 25000, fit: fit(0.7, 0.1, 0.8), baseWeight: 0.6, tags: ['experimental'], note: 'Strong for under-30 audiences.' },
  { key: 'referral', name: 'Referral Program', category: 'Other', family: 'affiliate', buyingModel: 'CPA', price: 35, ctr: 5, clickToLead: 30, leadToConversion: 35, ltv: 260, saturationCeiling: 15000, fit: fit(0.8, 0.6, 0.3), baseWeight: 0.7, tags: ['proven'], note: 'Refer-a-friend bonus; volume limited by user base.' },
  { key: 'affiliate-cpa', name: 'Comparison Sites & Affiliates', category: 'Affiliate', family: 'affiliate', buyingModel: 'CPA', price: 70, ctr: 3, clickToLead: 12, leadToConversion: 30, ltv: 230, saturationCeiling: 40000, fit: fit(0.9, 0.1, 0.3), baseWeight: 0.8, tags: ['proven'] },
  { key: 'seo-content', name: 'SEO - Content', category: 'SEO/Content', family: 'seo_content', buyingModel: 'RETAINER', price: 3000, ctr: 1, clickToLead: 6, leadToConversion: 25, ltv: 240, trafficPerUnit: 3500, saturationCeiling: 12000, fit: fit(0.7, 0.2, 0.7), baseWeight: 0.5, tags: ['fixed_cost'] },
  { key: 'influencers', name: 'Creators & Influencers', category: 'Paid Social', family: 'influencer', buyingModel: 'FLAT_FEE', price: 3000, ctr: 1.5, clickToLead: 5, leadToConversion: 15, ltv: 180, trafficPerUnit: 3000, saturationCeiling: 20000, fit: fit(0.6, 0.1, 0.9), baseWeight: 0.5, minBudget: 15000, tags: ['fixed_cost', 'experimental'] },
  { key: 'pr', name: 'PR & Media Relations', category: 'Other', family: 'pr_brand', buyingModel: 'RETAINER', price: 4000, ctr: 1, clickToLead: 5, leadToConversion: 20, ltv: 240, trafficPerUnit: 1500, saturationCeiling: 12000, fit: fit(0.2, 0.1, 1), baseWeight: 0.4, minBudget: 25000, tags: ['fixed_cost'] },
  { key: 'ooh-tv', name: 'OOH / TV', category: 'Offline/TV', family: 'pr_brand', buyingModel: 'FLAT_FEE', price: 20000, ctr: 1, clickToLead: 4, leadToConversion: 15, ltv: 220, trafficPerUnit: 8000, saturationCeiling: 80000, fit: fit(0.2, 0, 1), baseWeight: 0.6, minBudget: 100000, tags: ['fixed_cost'] },
  { key: 'crm', name: 'CRM - Push & Email Activation', category: 'Email/SMS', family: 'email_crm', buyingModel: 'RETAINER', price: 1000, ctr: 4, clickToLead: 10, leadToConversion: 15, ltv: 200, trafficPerUnit: 6000, saturationCeiling: 3000, fit: fit(0.2, 1, 0.1), baseWeight: 0.4, tags: ['fixed_cost', 'proven'], note: 'Moves sign-ups through KYC to first funding.' },
  { key: 'retargeting', name: 'Retargeting', category: 'Display/Programmatic', family: 'paid_media', buyingModel: 'CPM', price: 7, ctr: 1.2, clickToLead: 12, leadToConversion: 20, ltv: 220, saturationCeiling: 5000, fit: fit(0.6, 0.8, 0.2), baseWeight: 0.3, tags: ['proven'] },
];

// ========== E-COMMERCE / DTC ==========

const ECOMMERCE_CHANNELS: T[] = [
  { key: 'google-shopping', name: 'Google Shopping / PMax', category: 'Paid Search', family: 'paid_media', buyingModel: 'CPC', price: 0.7, ctr: 1.5, clickToLead: 8, leadToConversion: 35, ltv: 140, saturationCeiling: 50000, fit: fit(1, 0.3, 0.3), baseWeight: 1.3, tags: ['proven'] },
  { key: 'search-brand', name: 'Google Search - Brand', category: 'Paid Search', family: 'paid_media', buyingModel: 'CPC', price: 0.4, ctr: 8, clickToLead: 12, leadToConversion: 40, ltv: 160, saturationCeiling: 3000, fit: fit(0.6, 0.7, 0.3), baseWeight: 0.3, tags: ['proven'], note: 'Protects brand queries; capped by brand demand.' },
  { key: 'search-generic', name: 'Google Search - Generic', category: 'Paid Search', family: 'paid_media', buyingModel: 'CPC', price: 1.1, ctr: 3, clickToLead: 6, leadToConversion: 30, ltv: 130, saturationCeiling: 30000, fit: fit(0.9, 0.1, 0.3), baseWeight: 0.7 },
  { key: 'meta-social', name: 'Meta Ads', category: 'Paid Social', family: 'paid_media', buyingModel: 'CPM', price: 8, ctr: 1.1, clickToLead: 5, leadToConversion: 30, ltv: 130, saturationCeiling: 60000, fit: fit(0.9, 0.4, 0.8), baseWeight: 1.2, tags: ['proven'] },
  { key: 'tiktok', name: 'TikTok Ads', category: 'Paid Social', family: 'paid_media', buyingModel: 'CPM', price: 5, ctr: 0.9, clickToLead: 4, leadToConversion: 25, ltv: 110, saturationCeiling: 30000, fit: fit(0.7, 0.1, 0.9), baseWeight: 0.6, tags: ['experimental'] },
  { key: 'retargeting', name: 'Retargeting (Dynamic Product Ads)', category: 'Display/Programmatic', family: 'paid_media', buyingModel: 'CPM', price: 6, ctr: 1.4, clickToLead: 10, leadToConversion: 40, ltv: 150, saturationCeiling: 5000, fit: fit(0.6, 0.9, 0.1), baseWeight: 0.4, tags: ['proven'] },
  { key: 'marketplace', name: 'Marketplace Ads (Amazon)', category: 'Paid Search', family: 'paid_media', buyingModel: 'CPC', price: 0.9, ctr: 2, clickToLead: 10, leadToConversion: 40, ltv: 90, saturationCeiling: 30000, fit: fit(0.9, 0.2, 0.3), baseWeight: 0.5, note: 'Only if you sell on marketplaces.' },
  { key: 'affiliate-cpa', name: 'Affiliates & Coupon Sites', category: 'Affiliate', family: 'affiliate', buyingModel: 'CPA', price: 18, ctr: 3, clickToLead: 10, leadToConversion: 35, ltv: 120, saturationCeiling: 20000, fit: fit(0.8, 0.2, 0.2), baseWeight: 0.5, tags: ['proven'] },
  { key: 'influencers', name: 'Creators & UGC', category: 'Paid Social', family: 'influencer', buyingModel: 'FLAT_FEE', price: 2000, ctr: 1.5, clickToLead: 4, leadToConversion: 25, ltv: 120, trafficPerUnit: 3000, saturationCeiling: 20000, fit: fit(0.6, 0.1, 0.9), baseWeight: 0.5, minBudget: 10000, tags: ['fixed_cost', 'experimental'] },
  { key: 'crm', name: 'Email & SMS Flows', category: 'Email/SMS', family: 'email_crm', buyingModel: 'RETAINER', price: 800, ctr: 3, clickToLead: 8, leadToConversion: 30, ltv: 110, trafficPerUnit: 5000, saturationCeiling: 3000, fit: fit(0.2, 1, 0.2), baseWeight: 0.4, tags: ['fixed_cost', 'proven'], note: 'Abandoned cart, win-back, repeat purchase.' },
  { key: 'seo-content', name: 'SEO - Category & Content', category: 'SEO/Content', family: 'seo_content', buyingModel: 'RETAINER', price: 2000, ctr: 1, clickToLead: 5, leadToConversion: 30, ltv: 140, trafficPerUnit: 4000, saturationCeiling: 10000, fit: fit(0.8, 0.2, 0.5), baseWeight: 0.5, tags: ['fixed_cost'] },
  { key: 'youtube', name: 'YouTube / CTV', category: 'Offline/TV', family: 'paid_media', buyingModel: 'CPM', price: 12, ctr: 0.4, clickToLead: 3, leadToConversion: 25, ltv: 140, saturationCeiling: 40000, fit: fit(0.3, 0.1, 1), baseWeight: 0.5, minBudget: 30000 },
];

// ========== B2B SaaS ==========

const SAAS_CHANNELS: T[] = [
  { key: 'google-search', name: 'Google Search - High Intent', category: 'Paid Search', family: 'paid_media', buyingModel: 'CPC', price: 7, ctr: 4, clickToLead: 8, leadToConversion: 12, ltv: 3000, saturationCeiling: 40000, fit: fit(1, 0.1, 0.3), baseWeight: 1.3, tags: ['proven'] },
  { key: 'linkedin', name: 'LinkedIn Ads', category: 'Paid Social', family: 'paid_media', buyingModel: 'CPM', price: 35, ctr: 0.6, clickToLead: 6, leadToConversion: 10, ltv: 3500, saturationCeiling: 40000, fit: fit(0.8, 0.2, 0.8), baseWeight: 1, note: 'Precise job-title targeting, expensive reach.' },
  { key: 'meta-social', name: 'Meta Ads', category: 'Paid Social', family: 'paid_media', buyingModel: 'CPM', price: 10, ctr: 0.8, clickToLead: 3, leadToConversion: 8, ltv: 2000, saturationCeiling: 25000, fit: fit(0.6, 0.2, 0.6), baseWeight: 0.4, tags: ['experimental'], note: 'Works for SMB/self-serve products.' },
  { key: 'review-sites', name: 'Review Sites (G2, Capterra)', category: 'Affiliate', family: 'affiliate', buyingModel: 'CPC', price: 12, ctr: 3, clickToLead: 15, leadToConversion: 18, ltv: 3000, saturationCeiling: 15000, fit: fit(0.9, 0.1, 0.5), baseWeight: 0.6, tags: ['proven'] },
  { key: 'retargeting', name: 'Retargeting', category: 'Display/Programmatic', family: 'paid_media', buyingModel: 'CPM', price: 9, ctr: 0.8, clickToLead: 6, leadToConversion: 15, ltv: 3000, saturationCeiling: 5000, fit: fit(0.6, 0.7, 0.3), baseWeight: 0.4, tags: ['proven'] },
  { key: 'seo-content', name: 'SEO & Content Marketing', category: 'SEO/Content', family: 'seo_content', buyingModel: 'RETAINER', price: 4000, ctr: 1, clickToLead: 3, leadToConversion: 12, ltv: 3000, trafficPerUnit: 3000, saturationCeiling: 15000, fit: fit(0.8, 0.3, 0.8), baseWeight: 0.7, tags: ['fixed_cost'] },
  { key: 'webinars', name: 'Webinars & Events', category: 'Other', family: 'pr_brand', buyingModel: 'FLAT_FEE', price: 2500, ctr: 2, clickToLead: 40, leadToConversion: 10, ltv: 3500, trafficPerUnit: 400, saturationCeiling: 10000, fit: fit(0.6, 0.6, 0.7), baseWeight: 0.4, minBudget: 10000, tags: ['fixed_cost'] },
  { key: 'partners', name: 'Partners & Resellers (RevShare)', category: 'Affiliate', family: 'affiliate', buyingModel: 'REV_SHARE', price: 20, secondaryPrice: 20, ctr: 3, clickToLead: 10, leadToConversion: 20, ltv: 3000, saturationCeiling: 30000, fit: fit(0.8, 0.3, 0.3), baseWeight: 0.5 },
  { key: 'crm', name: 'Email Nurture & Lifecycle', category: 'Email/SMS', family: 'email_crm', buyingModel: 'RETAINER', price: 800, ctr: 3, clickToLead: 10, leadToConversion: 10, ltv: 2500, trafficPerUnit: 2000, saturationCeiling: 3000, fit: fit(0.3, 1, 0.2), baseWeight: 0.4, tags: ['fixed_cost', 'proven'], note: 'Trial-to-paid and expansion.' },
  { key: 'abm', name: 'ABM / Programmatic', category: 'Display/Programmatic', family: 'paid_media', buyingModel: 'CPM', price: 20, ctr: 0.3, clickToLead: 3, leadToConversion: 10, ltv: 5000, saturationCeiling: 30000, fit: fit(0.4, 0.2, 0.9), baseWeight: 0.5, minBudget: 30000, note: 'Target named accounts; long sales cycles.' },
  { key: 'podcasts', name: 'Podcast Sponsorships', category: 'Offline/TV', family: 'pr_brand', buyingModel: 'FLAT_FEE', price: 5000, ctr: 1, clickToLead: 3, leadToConversion: 10, ltv: 3000, trafficPerUnit: 1500, saturationCeiling: 20000, fit: fit(0.2, 0, 1), baseWeight: 0.4, minBudget: 40000, tags: ['fixed_cost'] },
];

const ESTIMATE_SOURCE = 'Planning estimates (Tier-1 markets) — replace with your own campaign data';

export const INDUSTRY_PACKS: IndustryPack[] = [
  {
    id: 'igaming',
    label: 'iGaming (Casino, Sportsbook)',
    description: 'Real-money gaming: affiliates-led acquisition, strict ad policies, value measured as NGR.',
    funnel: { lead: 'Registration', leadShort: 'Reg', conversion: 'First Deposit (FTD)', conversionShort: 'FTD', value: 'NGR', costPerLead: 'CPL', costPerConversion: 'CPA (FTD)' },
    defaultLtv: 250,
    netValueShare: 0.41,
    netValueNote: 'GGR minus bonus 30%, platform 15%, payments 4%, tax 10%.',
    benchmarks: { cpl: 45, cpa: 250, ctr: 1, conversionRate: 2, source: ESTIMATE_SOURCE },
    complianceNotes: ['Google/Meta gambling ads need certification per market.', 'Responsible-gambling messaging required in most EU markets.', 'Some markets (e.g. Italy) ban gambling advertising almost entirely.'],
    channels: IGAMING_CHANNELS,
  },
  {
    id: 'forex',
    label: 'Forex & CFD Brokers',
    description: 'Trading platforms: high CPA, high LTV, education-driven funnel, regulated advertising.',
    funnel: { lead: 'Registration / Demo', leadShort: 'Reg', conversion: 'Funded Account (FTD)', conversionShort: 'FTD', value: 'Net Revenue', costPerLead: 'CPL', costPerConversion: 'CPA (FTD)' },
    defaultLtv: 1200,
    netValueShare: 0.75,
    netValueNote: 'Spread/commission revenue minus IB payouts and payment costs.',
    benchmarks: { cpl: 60, cpa: 500, ctr: 0.9, conversionRate: 1.2, source: ESTIMATE_SOURCE },
    complianceNotes: ['CFD risk warning required on all ads (ESMA/FCA).', 'Google requires financial services verification.', 'Retail leverage limits affect messaging in the EU/UK.'],
    channels: FOREX_CHANNELS,
  },
  {
    id: 'fintech',
    label: 'Fintech (Neobank, Payments, Investing App)',
    description: 'App-first acquisition: install → sign-up → KYC → first funding.',
    funnel: { lead: 'Sign-up', leadShort: 'Sign-up', conversion: 'Verified & Funded', conversionShort: 'Funded', value: 'LTV', costPerLead: 'Cost per Sign-up', costPerConversion: 'CAC' },
    defaultLtv: 220,
    netValueShare: 0.6,
    netValueNote: 'Interchange/fees minus rewards, KYC and servicing costs.',
    benchmarks: { cpl: 12, cpa: 60, ctr: 1.5, conversionRate: 3, source: ESTIMATE_SOURCE },
    complianceNotes: ['Financial promotions must be approved (e.g. FCA s21 in the UK).', 'KYC drop-off is usually the biggest funnel leak.'],
    channels: FINTECH_CHANNELS,
  },
  {
    id: 'ecommerce',
    label: 'E-commerce / DTC',
    description: 'Online retail: shopping ads, social, retargeting and CRM-driven repeat purchases.',
    funnel: { lead: 'Add to Cart', leadShort: 'ATC', conversion: 'Purchase', conversionShort: 'Sale', value: 'Revenue', costPerLead: 'Cost per ATC', costPerConversion: 'CPA (Sale)' },
    defaultLtv: 140,
    netValueShare: 0.35,
    netValueNote: 'Revenue minus COGS, shipping, returns and payment fees (≈ gross margin).',
    benchmarks: { cpl: 8, cpa: 30, ctr: 1.3, conversionRate: 2, source: ESTIMATE_SOURCE },
    complianceNotes: ['Product feeds must match landing page prices (Google Merchant Center).'],
    channels: ECOMMERCE_CHANNELS,
  },
  {
    id: 'saas',
    label: 'B2B SaaS',
    description: 'Software sold to businesses: trials/demos, long cycles, very high LTV.',
    funnel: { lead: 'Trial / Demo Request', leadShort: 'Trial', conversion: 'Paying Customer', conversionShort: 'Customer', value: 'LTV', costPerLead: 'Cost per Trial', costPerConversion: 'CAC' },
    defaultLtv: 3000,
    netValueShare: 0.8,
    netValueNote: 'Subscription revenue minus hosting, support and payment costs.',
    benchmarks: { cpl: 150, cpa: 900, ctr: 0.8, conversionRate: 0.8, source: ESTIMATE_SOURCE },
    complianceNotes: ['GDPR consent needed for lead forms and nurture emails in the EU.'],
    channels: SAAS_CHANNELS,
  },
];
