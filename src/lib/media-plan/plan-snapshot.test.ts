// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  computeCategoryTotals,
  computePlanSnapshot,
  computePoolAwareSpend,
  getSpendSharePct,
  isFixedCostChannel,
  type PlanInputs,
} from './plan-snapshot';
import { createInitialChannels, DEFAULT_MULTIPLIERS } from './defaults';
import type { ChannelData } from './types';

function channel(overrides: Partial<ChannelData> = {}, price?: number): ChannelData {
  const base = createInitialChannels().find((c) => c.id === 'paid-native') as ChannelData;
  return {
    ...base,
    ...overrides,
    typeConfig: { ...base.typeConfig, ...(overrides.typeConfig ?? {}), ...(price === undefined ? {} : { price }) },
  };
}

const MULT = { spendMultiplier: 1 };

describe('isFixedCostChannel', () => {
  it('is true for FLAT_FEE, RETAINER and tier fixed', () => {
    expect(isFixedCostChannel(channel({ buyingModel: 'FLAT_FEE', tier: 'scalable' }))).toBe(true);
    expect(isFixedCostChannel(channel({ buyingModel: 'RETAINER', tier: 'scalable' }))).toBe(true);
    expect(isFixedCostChannel(channel({ buyingModel: 'CPM', tier: 'fixed' }))).toBe(true);
  });

  it('is false for variable buying models on scalable or capped tiers', () => {
    expect(isFixedCostChannel(channel({ buyingModel: 'CPM', tier: 'scalable' }))).toBe(false);
    expect(isFixedCostChannel(channel({ buyingModel: 'CPA', tier: 'capped' }))).toBe(false);
  });
});

describe('computePoolAwareSpend', () => {
  it('returns 0 for an inactive channel', () => {
    expect(computePoolAwareSpend(channel({ isActive: false }), 10000, 100, MULT)).toBe(0);
  });

  it('fixed-cost channels use typeConfig.price and ignore the multiplier', () => {
    const ch = channel({ buyingModel: 'RETAINER', tier: 'fixed' }, 700);
    expect(computePoolAwareSpend(ch, 10000, 100, { spendMultiplier: 3 })).toBe(700);
    const flat = channel({ buyingModel: 'FLAT_FEE', tier: 'scalable' }, 450);
    expect(computePoolAwareSpend(flat, 10000, 100, MULT)).toBe(450);
    const tierFixed = channel({ buyingModel: 'CPM', tier: 'fixed' }, 300);
    expect(computePoolAwareSpend(tierFixed, 10000, 100, MULT)).toBe(300);
  });

  it('variable channels take their normalised share of the pool', () => {
    const ch = channel({ buyingModel: 'CPM', tier: 'scalable', allocationPct: 25 });
    expect(computePoolAwareSpend(ch, 8000, 50, MULT)).toBeCloseTo(4000, 9);
  });

  it('applies spendMultiplier to variable channels only', () => {
    const ch = channel({ buyingModel: 'CPM', tier: 'scalable', allocationPct: 50 });
    expect(computePoolAwareSpend(ch, 1000, 100, { spendMultiplier: 1.5 })).toBeCloseTo(750, 9);
  });

  it('gives 0 when variableAllocTotal is 0', () => {
    const ch = channel({ buyingModel: 'CPM', tier: 'scalable', allocationPct: 50 });
    expect(computePoolAwareSpend(ch, 1000, 0, MULT)).toBe(0);
  });
});

function inputs(channels: ChannelData[], totalBudget = 100000): PlanInputs {
  return {
    totalBudget,
    channels,
    globalMultipliers: { ...DEFAULT_MULTIPLIERS },
    activeTiers: { tier1: 100, tier2: 0, tier3: 0 },
    activeGeos: [],
    geoOverrides: {},
  };
}

describe('computePlanSnapshot', () => {
  it('blended totals equal the sum of channel metrics', () => {
    const snap = computePlanSnapshot(inputs(createInitialChannels()));
    const sum = (f: (c: (typeof snap.channels)[number]) => number) =>
      snap.channels.reduce((s, c) => s + f(c), 0);
    expect(snap.blended.totalSpend).toBeCloseTo(sum((c) => c.metrics.spend), 6);
    expect(snap.blended.totalImpressions).toBeCloseTo(sum((c) => c.metrics.impressions), 6);
    expect(snap.blended.totalClicks).toBeCloseTo(sum((c) => c.metrics.clicks), 6);
    expect(snap.blended.totalConversions).toBeCloseTo(sum((c) => c.metrics.conversions), 6);
    expect(snap.blended.projectedRevenue).toBeCloseTo(sum((c) => c.metrics.revenue), 6);
  });

  it('has null blended CPA and 0 ROAS with no channels', () => {
    const snap = computePlanSnapshot(inputs([]));
    expect(snap.channels).toEqual([]);
    expect(snap.blended.blendedCpa).toBeNull();
    expect(snap.blended.blendedRoas).toBe(0);
  });

  it('has null blended CPA when every channel is inactive', () => {
    const channels = createInitialChannels().map((c) => ({ ...c, isActive: false }));
    const snap = computePlanSnapshot(inputs(channels));
    expect(snap.blended.totalConversions).toBe(0);
    expect(snap.blended.blendedCpa).toBeNull();
  });

  it('flags channels above the CPA target and below the ROAS target', () => {
    const base = inputs(createInitialChannels());
    const tight = computePlanSnapshot({
      ...base,
      globalMultipliers: { ...DEFAULT_MULTIPLIERS, cpaTarget: 0.0001, roasTarget: 1e9 },
    });
    const active = tight.channels.filter((c) => c.isActive && c.metrics.spend > 0);
    expect(active.length).toBeGreaterThan(0);
    expect(active.every((c) => c.aboveCpaTarget && c.belowRoasTarget)).toBe(true);

    const loose = computePlanSnapshot({
      ...base,
      globalMultipliers: { ...DEFAULT_MULTIPLIERS, cpaTarget: 1e9, roasTarget: 0.0001 },
    });
    expect(loose.channels.some((c) => c.aboveCpaTarget || c.belowRoasTarget)).toBe(false);
  });

  it('sets no flags when targets are null', () => {
    const snap = computePlanSnapshot(inputs(createInitialChannels()));
    expect(snap.channels.some((c) => c.aboveCpaTarget || c.belowRoasTarget)).toBe(false);
  });
});

describe('getSpendSharePct and computeCategoryTotals', () => {
  it('shares sum to 100 across channels', () => {
    const snap = computePlanSnapshot(inputs(createInitialChannels()));
    const total = snap.channels.reduce((s, c) => s + getSpendSharePct(c, snap.blended), 0);
    expect(total).toBeCloseTo(100, 6);
  });

  it('returns 0 share when total spend is 0', () => {
    const snap = computePlanSnapshot(inputs(createInitialChannels(), 0));
    const fixedOnly = snap.channels.filter((c) => !isFixedCostChannel(c));
    expect(snap.blended.totalSpend).toBeGreaterThanOrEqual(0);
    const zero = computePlanSnapshot(inputs([], 0));
    expect(getSpendSharePct(fixedOnly[0], zero.blended)).toBe(0);
  });

  it('category totals add up to total spend and 100 percent', () => {
    const snap = computePlanSnapshot(inputs(createInitialChannels()));
    const totals = computeCategoryTotals(snap);
    const spend = Object.values(totals).reduce((s, t) => s + t.spend, 0);
    const pct = Object.values(totals).reduce((s, t) => s + t.percentage, 0);
    expect(spend).toBeCloseTo(snap.blended.totalSpend, 6);
    expect(pct).toBeCloseTo(100, 6);
  });

  it('seeds known categories at zero and adds unknown ones', () => {
    const odd = channel({ category: 'Mystery' as unknown as ChannelData['category'] });
    const snap = computePlanSnapshot(inputs([odd]));
    const totals = computeCategoryTotals(snap);
    expect(totals['Mystery'].spend).toBeGreaterThan(0);
    expect(totals['Mystery'].percentage).toBeCloseTo(100, 6);
  });

  it('empty snapshot yields only zeroed categories', () => {
    const totals = computeCategoryTotals(computePlanSnapshot(inputs([])));
    expect(Object.values(totals).every((t) => t.spend === 0 && t.percentage === 0)).toBe(true);
  });
});
