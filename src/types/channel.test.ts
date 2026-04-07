/**
 * Regression tests for calculateUnifiedMetrics in src/types/channel.ts.
 *
 * Each test targets a specific bug or edge case identified during the
 * mathematical stability audit. Test names reference the audit bug IDs
 * for traceability.
 */
import { describe, expect, it } from 'vitest';
import { calculateUnifiedMetrics, type ChannelTypeConfig } from './channel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCpmConfig(overrides?: Partial<ChannelTypeConfig['baselineMetrics']>): ChannelTypeConfig {
  return {
    family: 'paid_media',
    buyingModel: 'CPM',
    price: 10, // $10 CPM
    baselineMetrics: {
      ctr: 2,           // 2%
      conversionRate: 5, // 5%
      saturationCeiling: 100_000,
      ...overrides,
    },
  };
}

// ---------------------------------------------------------------------------
// CPM model
// ---------------------------------------------------------------------------

describe('CPM model', () => {
  it('calculates impressions, clicks, and FTDs correctly', () => {
    const config = makeCpmConfig();
    const result = calculateUnifiedMetrics(config, 10_000, 150);

    // Impressions = (10000 / 10) * 1000 = 1,000,000
    expect(result.impressions).toBeCloseTo(1_000_000);
    // Clicks = 1,000,000 * 0.02 = 20,000
    expect(result.clicks).toBeCloseTo(20_000);
    // FTDs = 20,000 * 0.05 = 1,000
    expect(result.ftds).toBeCloseTo(1_000);
  });

  it('returns 0 impressions when CPM price is 0 (division-by-zero guard)', () => {
    const config: ChannelTypeConfig = {
      family: 'paid_media',
      buyingModel: 'CPM',
      price: 0,
      baselineMetrics: { ctr: 2, conversionRate: 5 },
    };
    const result = calculateUnifiedMetrics(config, 10_000, 150);
    expect(result.impressions).toBe(0);
    expect(result.clicks).toBe(0);
    expect(result.ftds).toBe(0);
  });

  it('sets cpa to null when ftds is 0', () => {
    const config: ChannelTypeConfig = {
      family: 'paid_media',
      buyingModel: 'CPM',
      price: 0, // zero CPM → no impressions → no FTDs
      baselineMetrics: {},
    };
    const result = calculateUnifiedMetrics(config, 1_000, 150);
    expect(result.cpa).toBeNull();
  });

  it('returns roas of 0 when spend is 0', () => {
    const config = makeCpmConfig();
    const result = calculateUnifiedMetrics(config, 0, 150);
    expect(result.roas).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// CPC model — Bug #3: CPC impressions must be configurable (not hardcoded ×100)
// ---------------------------------------------------------------------------

describe('CPC model', () => {
  it('back-calculates impressions from CTR when no cpcImpressionRatio is set', () => {
    const config: ChannelTypeConfig = {
      family: 'paid_media',
      buyingModel: 'CPC',
      price: 1, // $1 CPC
      baselineMetrics: { ctr: 2, conversionRate: 5 },
    };
    const result = calculateUnifiedMetrics(config, 1_000, 150);
    // clicks = 1000 / 1 = 1000
    expect(result.clicks).toBeCloseTo(1_000);
    // impressions = clicks / (ctr / 100) = 1000 / 0.02 = 50,000
    expect(result.impressions).toBeCloseTo(50_000);
    // Old hardcoded behaviour was clicks * 100 = 100,000 — must NOT be that anymore
    expect(result.impressions).not.toBeCloseTo(100_000);
  });

  it('uses explicit cpcImpressionRatio when provided', () => {
    const config: ChannelTypeConfig = {
      family: 'paid_media',
      buyingModel: 'CPC',
      price: 2,
      baselineMetrics: { ctr: 2, conversionRate: 5, cpcImpressionRatio: 200 },
    };
    const result = calculateUnifiedMetrics(config, 1_000, 150);
    // clicks = 1000 / 2 = 500
    // impressions = clicks * 200 = 100,000
    expect(result.impressions).toBeCloseTo(100_000);
  });

  it('returns 0 impressions when CTR is 0 and no ratio is set', () => {
    const config: ChannelTypeConfig = {
      family: 'paid_media',
      buyingModel: 'CPC',
      price: 1,
      baselineMetrics: { ctr: 0, conversionRate: 5 },
    };
    const result = calculateUnifiedMetrics(config, 1_000, 150);
    expect(result.impressions).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// CPA model
// ---------------------------------------------------------------------------

describe('CPA model', () => {
  it('derives FTDs from spend and target CPA', () => {
    const config: ChannelTypeConfig = {
      family: 'affiliate',
      buyingModel: 'CPA',
      price: 50, // $50 target CPA
      baselineMetrics: { ctr: 2, conversionRate: 10 },
    };
    const result = calculateUnifiedMetrics(config, 5_000, 150);
    // FTDs = 5000 / 50 = 100
    expect(result.ftds).toBeCloseTo(100);
    // CPA = 5000 / 100 = 50
    expect(result.cpa).toBeCloseTo(50);
  });

  it('returns 0 FTDs when CPA price is 0', () => {
    const config: ChannelTypeConfig = {
      family: 'affiliate',
      buyingModel: 'CPA',
      price: 0,
      baselineMetrics: {},
    };
    const result = calculateUnifiedMetrics(config, 5_000, 150);
    expect(result.ftds).toBe(0);
    expect(result.cpa).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// REV_SHARE model — Bug #7: silent FTD zeroing when secondaryPrice is missing
// ---------------------------------------------------------------------------

describe('REV_SHARE model', () => {
  it('calculates FTDs correctly when secondaryPrice is provided', () => {
    const config: ChannelTypeConfig = {
      family: 'affiliate',
      buyingModel: 'REV_SHARE',
      price: 0,
      secondaryPrice: 20, // 20% rev share
      baselineMetrics: { aov: 200 },
    };
    const result = calculateUnifiedMetrics(config, 4_000, 200);
    // costPerFtd = 200 * 0.20 = 40
    // ftds = 4000 / 40 = 100
    expect(result.ftds).toBeCloseTo(100);
  });

  it('returns 0 FTDs when secondaryPrice is undefined (misconfigured channel)', () => {
    const config: ChannelTypeConfig = {
      family: 'affiliate',
      buyingModel: 'REV_SHARE',
      price: 0,
      // secondaryPrice intentionally omitted
      baselineMetrics: { aov: 200 },
    };
    const result = calculateUnifiedMetrics(config, 4_000, 200);
    // Previously this silently defaulted to 0% revshare, zeroing FTDs.
    // The fix makes this behaviour explicit: 0 FTDs when unconfigured.
    expect(result.ftds).toBe(0);
    expect(result.cpa).toBeNull();
  });

  it('returns 0 FTDs when secondaryPrice is 0 (zero-rate rev share)', () => {
    const config: ChannelTypeConfig = {
      family: 'affiliate',
      buyingModel: 'REV_SHARE',
      price: 0,
      secondaryPrice: 0,
      baselineMetrics: { aov: 200 },
    };
    const result = calculateUnifiedMetrics(config, 4_000, 200);
    expect(result.ftds).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// HYBRID model
// ---------------------------------------------------------------------------

describe('HYBRID model', () => {
  it('combines base CPA and rev share to calculate FTDs', () => {
    const config: ChannelTypeConfig = {
      family: 'affiliate',
      buyingModel: 'HYBRID',
      price: 30,       // $30 base CPA
      secondaryPrice: 10, // 10% rev share
      baselineMetrics: { aov: 200 },
    };
    const result = calculateUnifiedMetrics(config, 5_000, 200);
    // totalCostPerFtd = 30 + 200 * 0.10 = 50
    // ftds = 5000 / 50 = 100
    expect(result.ftds).toBeCloseTo(100);
  });

  it('treats missing secondaryPrice as 0 rev share (pure CPA behaviour)', () => {
    const config: ChannelTypeConfig = {
      family: 'affiliate',
      buyingModel: 'HYBRID',
      price: 50, // base CPA only
      // secondaryPrice omitted — should behave like CPA
      baselineMetrics: { aov: 200 },
    };
    const result = calculateUnifiedMetrics(config, 5_000, 200);
    // totalCostPerFtd = 50 + 200 * 0 = 50
    // ftds = 5000 / 50 = 100
    expect(result.ftds).toBeCloseTo(100);
  });

  it('returns 0 FTDs when both price and secondaryPrice are 0', () => {
    const config: ChannelTypeConfig = {
      family: 'affiliate',
      buyingModel: 'HYBRID',
      price: 0,
      secondaryPrice: 0,
      baselineMetrics: { aov: 200 },
    };
    const result = calculateUnifiedMetrics(config, 5_000, 200);
    expect(result.ftds).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Saturation decay — Bug #6: saturation = 0 must skip decay (documented)
// ---------------------------------------------------------------------------

describe('Saturation decay', () => {
  it('applies Michaelis-Menten decay when saturationCeiling is set', () => {
    const config: ChannelTypeConfig = {
      family: 'paid_media',
      buyingModel: 'CPA',
      price: 50,
      baselineMetrics: { saturationCeiling: 5_000 },
    };
    const spend = 5_000;
    const result = calculateUnifiedMetrics(config, spend, 150);
    // ftds = 100, linearRevenue = 100 * 150 = 15,000
    // decayFactor = 1 / (1 + 5000 / 5000) = 0.5
    // revenue = 15,000 * 0.5 = 7,500
    expect(result.revenue).toBeCloseTo(7_500);
    expect(result.roas).toBeCloseTo(7_500 / 5_000);
  });

  it('skips decay when saturationCeiling is 0 (fully linear revenue)', () => {
    const config: ChannelTypeConfig = {
      family: 'paid_media',
      buyingModel: 'CPA',
      price: 50,
      baselineMetrics: { saturationCeiling: 0 },
    };
    const spend = 5_000;
    const result = calculateUnifiedMetrics(config, spend, 150);
    // No decay — revenue = 100 * 150 = 15,000
    expect(result.revenue).toBeCloseTo(15_000);
  });

  it('skips decay when saturationCeiling is undefined', () => {
    const config: ChannelTypeConfig = {
      family: 'paid_media',
      buyingModel: 'CPA',
      price: 50,
      baselineMetrics: {},
    };
    const spend = 5_000;
    const result = calculateUnifiedMetrics(config, spend, 150);
    expect(result.revenue).toBeCloseTo(15_000);
  });
});
