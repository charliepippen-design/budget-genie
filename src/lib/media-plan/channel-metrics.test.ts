// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { calculateChannelMetricsWithGeo } from './channel-metrics';
import { createInitialChannels, DEFAULT_MULTIPLIERS } from './defaults';
import { TIER1_REFERENCE } from '@/lib/geo-market-data';
import type { ChannelData, GeoMarketProfile } from './types';

const TIER1_PROFILE: GeoMarketProfile = {
  mode: 'tiers',
  blendedCpa: TIER1_REFERENCE.cpa,
  blendedLtv: TIER1_REFERENCE.ltv,
};

function channelById(id: string): ChannelData {
  const ch = createInitialChannels().find((c) => c.id === id);
  if (!ch) throw new Error(`missing channel ${id}`);
  return ch;
}

function withModel(base: ChannelData, buyingModel: ChannelData['buyingModel'], price: number): ChannelData {
  return { ...base, buyingModel, typeConfig: { ...base.typeConfig, buyingModel, price } };
}

describe('calculateChannelMetricsWithGeo', () => {
  it('returns zeroed metrics for an inactive channel', () => {
    const ch = { ...channelById('paid-native'), isActive: false };
    const m = calculateChannelMetricsWithGeo(ch, 100000, DEFAULT_MULTIPLIERS, 5000, TIER1_PROFILE);
    expect(m).toEqual({
      spend: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      cpa: 0,
      revenue: 0,
      roas: 0,
      effectivePrice: 0,
      effectiveCtr: 0,
      effectiveCr: 0,
    });
  });

  it('uses the spend override when given', () => {
    const ch = channelById('paid-native');
    const m = calculateChannelMetricsWithGeo(ch, 100000, DEFAULT_MULTIPLIERS, 1234, TIER1_PROFILE);
    expect(m.spend).toBe(1234);
  });

  it('falls back to allocationPct x budget x spendMultiplier without an override', () => {
    const ch = { ...channelById('paid-native'), allocationPct: 10 };
    const m = calculateChannelMetricsWithGeo(
      ch,
      50000,
      { ...DEFAULT_MULTIPLIERS, spendMultiplier: 2 },
      undefined,
      TIER1_PROFILE
    );
    expect(m.spend).toBeCloseTo(10000, 6);
  });

  it('gives zero spend and zero volume at zero budget', () => {
    const ch = channelById('paid-native');
    const m = calculateChannelMetricsWithGeo(ch, 0, DEFAULT_MULTIPLIERS, undefined, TIER1_PROFILE);
    expect(m.spend).toBe(0);
    expect(m.impressions).toBe(0);
    expect(m.clicks).toBe(0);
    expect(m.conversions).toBe(0);
    expect(m.revenue).toBe(0);
  });

  it('CPM channel: more spend yields proportionally more impressions', () => {
    const ch = withModel(channelById('paid-native'), 'CPM', 4);
    const a = calculateChannelMetricsWithGeo(ch, 0, DEFAULT_MULTIPLIERS, 4000, TIER1_PROFILE);
    const b = calculateChannelMetricsWithGeo(ch, 0, DEFAULT_MULTIPLIERS, 8000, TIER1_PROFILE);
    expect(a.impressions).toBeGreaterThan(0);
    expect(b.impressions / a.impressions).toBeCloseTo(2, 6);
    expect(a.effectivePrice).toBe(4);
  });

  it('CPM override replaces the price for CPM channels and skips market scaling', () => {
    const ch = withModel(channelById('paid-native'), 'CPM', 4);
    const geo: GeoMarketProfile = { mode: 'tiers', blendedCpa: TIER1_REFERENCE.cpa * 2, blendedLtv: TIER1_REFERENCE.ltv };
    const m = calculateChannelMetricsWithGeo(
      ch,
      0,
      { ...DEFAULT_MULTIPLIERS, defaultCpmOverride: 10 },
      4000,
      geo
    );
    expect(m.effectivePrice).toBe(10);
  });

  it('market cost index scales the price of CPM channels', () => {
    const ch = withModel(channelById('paid-native'), 'CPM', 4);
    const geo: GeoMarketProfile = { mode: 'tiers', blendedCpa: TIER1_REFERENCE.cpa * 2, blendedLtv: TIER1_REFERENCE.ltv };
    const m = calculateChannelMetricsWithGeo(ch, 0, DEFAULT_MULTIPLIERS, 4000, geo);
    expect(m.effectivePrice).toBeCloseTo(8, 6);
  });

  it('CPA channel: conversions are positive, capped by spend over price, and CPA is spend per conversion', () => {
    const ch = withModel(channelById('affiliate-cpa'), 'CPA', 50);
    const m = calculateChannelMetricsWithGeo(ch, 0, DEFAULT_MULTIPLIERS, 5000, TIER1_PROFILE);
    expect(m.effectivePrice).toBe(50);
    expect(m.conversions).toBeGreaterThan(0);
    expect(m.conversions).toBeLessThanOrEqual(5000 / 50 + 1e-9);
    expect(m.cpa).toBeCloseTo(m.spend / m.conversions, 6);
  });

  it('fixed-cost channel: price is not scaled by the market', () => {
    const ch = withModel(channelById('seo-content'), 'RETAINER', 1500);
    const geo: GeoMarketProfile = { mode: 'tiers', blendedCpa: TIER1_REFERENCE.cpa * 3, blendedLtv: TIER1_REFERENCE.ltv };
    const m = calculateChannelMetricsWithGeo(ch, 0, DEFAULT_MULTIPLIERS, 1500, geo);
    expect(m.effectivePrice).toBe(1500);
    expect(m.spend).toBe(1500);
  });

  it('ctrBump is added to CTR and CTR is floored at 0.01', () => {
    const ch = channelById('paid-native');
    const base = ch.typeConfig.baselineMetrics.ctr ?? 1;
    const up = calculateChannelMetricsWithGeo(ch, 0, { ...DEFAULT_MULTIPLIERS, ctrBump: 1 }, 1000, TIER1_PROFILE);
    expect(up.effectiveCtr).toBeCloseTo(base + 1, 9);
    const down = calculateChannelMetricsWithGeo(ch, 0, { ...DEFAULT_MULTIPLIERS, ctrBump: -100 }, 1000, TIER1_PROFILE);
    expect(down.effectiveCtr).toBe(0.01);
  });
});
