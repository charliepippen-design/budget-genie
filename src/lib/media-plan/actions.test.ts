// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  applyChannelType,
  clampBudget,
  createResetChannels,
  reallocateChannel,
  rebalanceTiers,
  translatePriceForModel,
} from './actions';
import { createInitialChannels } from './defaults';
import { GLOBAL_BUDGET_CAP, MIN_BUDGET_CAP } from './constants';
import type { ChannelWithMetrics } from './types';

describe('pure media plan actions', () => {
  it('clampBudget keeps the budget within the caps', () => {
    expect(clampBudget(0)).toBe(MIN_BUDGET_CAP);
    expect(clampBudget(1e12)).toBe(GLOBAL_BUDGET_CAP);
    expect(clampBudget(25000)).toBe(25000);
  });

  it('rebalanceTiers keeps the three tiers summing to 100', () => {
    const next = rebalanceTiers({ tier1: 50, tier2: 30, tier3: 20 }, 'tier1', 80);
    expect(next.tier1).toBe(80);
    expect(next.tier2 + next.tier3).toBeCloseTo(20, 6);
    expect(next.tier2 / next.tier3).toBeCloseTo(1.5, 1);
    const fromZero = rebalanceTiers({ tier1: 100, tier2: 0, tier3: 0 }, 'tier1', 40);
    expect(fromZero).toEqual({ tier1: 40, tier2: 30, tier3: 30 });
  });

  it('reallocateChannel takes the difference from absorbing channels and never goes negative', () => {
    const channels = createInitialChannels();
    const target = channels.find((c) => c.isActive !== false && c.tier !== 'fixed' && c.buyingModel === 'CPM')!;
    const next = reallocateChannel(channels, target.id, 100);
    expect(next.every((c) => c.allocationPct >= 0)).toBe(true);
    expect(next.find((c) => c.id === target.id)!.allocationPct).toBeGreaterThan(target.allocationPct);
    expect(reallocateChannel(channels, 'missing', 50)).toBe(channels);
  });

  it('translatePriceForModel converts CPM economics into a CPA price', () => {
    const ch = {
      ...createInitialChannels()[0],
      buyingModel: 'CPM',
      typeConfig: { ...createInitialChannels()[0].typeConfig, price: 6 },
      metrics: { spend: 1000, impressions: 200000, clicks: 2000, conversions: 20 },
    } as unknown as ChannelWithMetrics;
    expect(translatePriceForModel(ch, 'CPA')).toBe(50);
    expect(translatePriceForModel(ch, 'CPC')).toBe(0.5);
    expect(translatePriceForModel(ch, 'CPM')).toBe(6);
  });

  it('applyChannelType marks fixed-fee models as the fixed tier and rounds the price', () => {
    const [first] = createInitialChannels();
    const [next] = applyChannelType([first], first.id, first.family, 'FLAT_FEE', 1234.567);
    expect(next.tier).toBe('fixed');
    expect(next.typeConfig.price).toBe(1234.57);
  });

  it('createResetChannels zeroes allocation and price; programmatic is paid media (N-6)', () => {
    const reset = createResetChannels();
    expect(reset).toHaveLength(5);
    expect(reset.every((c) => c.allocationPct === 0 && c.typeConfig.price === 0)).toBe(true);
    expect(reset.find((c) => c.name === 'Display / Programmatic')!.family).toBe('paid_media');
  });
});
