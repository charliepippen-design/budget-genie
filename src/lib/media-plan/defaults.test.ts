// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { BASE_CHANNELS_DATA, DEFAULT_MULTIPLIERS, createInitialChannels } from './defaults';

describe('createInitialChannels', () => {
  it('creates one channel per base entry with unique ids', () => {
    const channels = createInitialChannels();
    expect(channels).toHaveLength(BASE_CHANNELS_DATA.length);
    expect(new Set(channels.map((c) => c.id)).size).toBe(channels.length);
  });

  it('allocation percentages sum to 100', () => {
    const total = createInitialChannels().reduce((sum, c) => sum + c.allocationPct, 0);
    expect(total).toBeCloseTo(100, 9);
  });

  it('starts active, unlocked and uncapped', () => {
    for (const c of createInitialChannels()) {
      expect(c.isActive).toBe(true);
      expect(c.locked).toBe(false);
      expect(c.maxSpendLimit).toBe(0);
    }
  });

  it('marks retainer and flat-fee channels as fixed tier, others scalable', () => {
    for (const c of createInitialChannels()) {
      const fixed = c.buyingModel === 'RETAINER' || c.buyingModel === 'FLAT_FEE';
      expect(c.tier).toBe(fixed ? 'fixed' : 'scalable');
    }
  });

  it('returns fresh objects on each call', () => {
    expect(createInitialChannels()).not.toBe(createInitialChannels());
    expect(createInitialChannels()[0]).not.toBe(createInitialChannels()[0]);
  });
});

describe('DEFAULT_MULTIPLIERS', () => {
  it('has neutral spend and CTR adjustments', () => {
    expect(DEFAULT_MULTIPLIERS.spendMultiplier).toBe(1);
    expect(DEFAULT_MULTIPLIERS.ctrBump).toBe(0);
    expect(DEFAULT_MULTIPLIERS.defaultCpmOverride).toBeNull();
    expect(DEFAULT_MULTIPLIERS.playerValue).toBe(150);
  });
});
