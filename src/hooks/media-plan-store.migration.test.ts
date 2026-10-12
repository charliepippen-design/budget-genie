// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useMediaPlanStore } from './use-media-plan-store';

type AnyRecord = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const migrate = useMediaPlanStore.persist.getOptions().migrate as (
  state: unknown,
  version: number
) => AnyRecord;

const channel = (id: string, name: string, pct: number): AnyRecord => ({
  id,
  name,
  category: 'Affiliate',
  allocationPct: pct,
  family: 'AFFILIATE',
  buyingModel: 'CPA',
  typeConfig: {
    family: 'AFFILIATE',
    buyingModel: 'CPA',
    price: 42,
    baselineMetrics: { ctr: 2, conversionRate: 3 },
  },
  tier: 'scalable',
  locked: true,
  isActive: false,
});

const preset = {
  name: 'My preset',
  totalBudget: 12345,
  channels: [channel('p1', 'Preset channel', 100)],
  globalMultipliers: { spendMultiplier: 1.2, playerValue: 99 },
};

/** A save as it looked at `version`: only the fields that existed back then. */
function fixture(version: number): AnyRecord {
  const channels = [channel('a', 'Affiliate - CPA', 60), channel('b', 'SEO - Content', 40)];
  if (version < 3) channels.forEach((ch) => delete ch.isActive);
  const state: AnyRecord = {
    totalBudget: 23456,
    channels,
    globalMultipliers: {
      spendMultiplier: 1.5,
      defaultCpmOverride: null,
      ctrBump: 0,
      cpaTarget: 80,
      roasTarget: null,
      playerValue: 321,
    },
    presets: [preset],
  };
  if (version >= 3) {
    state.activeTiers = { tier1: 10, tier2: 20, tier3: 70 };
    state.activeGeos = ['Germany'];
  }
  if (version >= 4) state.subscriptionTier = 'pro';
  if (version >= 5) state.userStatus = 'active';
  if (version >= 7) {
    state.geoOverrides = { Germany: { cpa: 100 } };
    state.observedLtv = { m1: 10, m3: null, m6: null };
  }
  if (version >= 8) state.onboardingVertical = 'saas';
  return state;
}

describe('media plan store migration cascade', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])('migrates a v%i save to a complete v9 state', (version) => {
    const out = migrate(fixture(version), version);

    // Every field a v9 state needs
    expect(out.activeTiers).toEqual({
      tier1: expect.any(Number),
      tier2: expect.any(Number),
      tier3: expect.any(Number),
    });
    expect(Array.isArray(out.activeGeos)).toBe(true);
    expect(['free', 'pro', 'enterprise']).toContain(out.subscriptionTier);
    expect(['demo', 'active']).toContain(out.userStatus);
    expect(out.geoOverrides).toEqual(expect.any(Object));
    expect(Object.keys(out.observedLtv ?? {}).sort()).toEqual(['m1', 'm3', 'm6']);
    expect(out.onboardingVertical).not.toBeUndefined();
    expect(out.onboardingSubvertical).toBeNull();
    for (const key of ['retentionRate', 'regToFtdCvr', 'turnoverRate', 'margin', 'bonusRate']) {
      expect(typeof out.globalMultipliers[key]).toBe('number');
    }
    for (const ch of out.channels) {
      expect(typeof ch.isActive).toBe('boolean');
      expect(ch.typeConfig).toBeTruthy();
    }

    // User data survives
    expect(out.totalBudget).toBe(23456);
    expect(out.channels.map((c: AnyRecord) => [c.id, c.name, c.allocationPct])).toEqual([
      ['a', 'Affiliate - CPA', 60],
      ['b', 'SEO - Content', 40],
    ]);
    expect(out.channels[0].locked).toBe(true);
    expect(out.presets).toEqual([preset]);
    expect(out.globalMultipliers.playerValue).toBe(321);
    expect(out.globalMultipliers.cpaTarget).toBe(80);
  });

  it('keeps values that already existed at the source version', () => {
    const out = migrate(fixture(8), 8);
    expect(out.subscriptionTier).toBe('pro');
    expect(out.userStatus).toBe('active');
    expect(out.geoOverrides).toEqual({ Germany: { cpa: 100 } });
    expect(out.observedLtv).toEqual({ m1: 10, m3: null, m6: null });
    expect(out.onboardingVertical).toBe('saas');
    expect(out.activeTiers).toEqual({ tier1: 10, tier2: 20, tier3: 70 });
  });

  it('defaults only the fields missing from an old save', () => {
    const out = migrate(fixture(2), 2);
    expect(out.subscriptionTier).toBe('free');
    expect(out.userStatus).toBe('demo');
    expect(out.geoOverrides).toEqual({});
    expect(out.observedLtv).toEqual({ m1: null, m3: null, m6: null });
    expect(out.onboardingVertical).toBeNull();
    expect(out.activeGeos).toEqual([]);
  });

  it('leaves the user data of a v9 save untouched', () => {
    const state = fixture(8);
    const out = migrate(state, 9);
    expect(out.totalBudget).toBe(23456);
    expect(out.subscriptionTier).toBe('pro');
    expect(out.channels).toEqual(state.channels);
  });
});
