import { describe, expect, it } from 'vitest';
import {
  computePlanSnapshot,
  useMediaPlanStore,
  type ChannelData,
  type GlobalMultipliers,
  type MediaPlanState,
} from '@/hooks/use-media-plan-store';
import { TIER_DEFAULTS } from '@/lib/geo-market-data';

type Migrate = (persisted: unknown, version: number) => Record<string, unknown>;
type Merge = (persisted: unknown, current: MediaPlanState) => MediaPlanState;

const options = useMediaPlanStore.persist.getOptions();
const migrate = options.migrate as unknown as Migrate;
const merge = options.merge as unknown as Merge;

function makeChannel(
  id: string,
  overrides: Partial<ChannelData> & { price?: number } = {}
): ChannelData {
  const { price = 10, ...rest } = overrides;
  return {
    id,
    name: id,
    category: 'Paid Search',
    allocationPct: 50,
    family: 'paid_media',
    buyingModel: 'CPM',
    typeConfig: {
      family: 'paid_media',
      buyingModel: 'CPM',
      price,
      baselineMetrics: { ctr: 1, conversionRate: 2 },
    },
    tier: 'scalable',
    locked: false,
    isActive: true,
    ...rest,
  };
}

// Old saves: channel without isActive, partial multipliers.
const legacyChannel = { id: 'old', name: 'old', allocationPct: 100 };
const customMultipliers = { spendMultiplier: 1.5 };

function fixture(extra: Record<string, unknown> = {}) {
  return {
    totalBudget: 12345,
    channels: [legacyChannel],
    globalMultipliers: customMultipliers,
    presets: [],
    ...extra,
  };
}

describe('persist config', () => {
  it('pins name and version', () => {
    expect(options.name).toBe('mediaplan-store-v2');
    expect(options.version).toBe(9);
  });

  it('pins the exact partialize key list', () => {
    const state = useMediaPlanStore.getState();
    const partial = options.partialize!(state) as Record<string, unknown>;
    expect(Object.keys(partial)).toEqual([
      'totalBudget',
      'channels',
      'globalMultipliers',
      'presets',
      'activeTiers',
      'activeGeos',
      'geoOverrides',
      'observedLtv',
      'subscriptionTier',
      'userStatus',
      'hasCompletedOnboarding',
      'onboardingVertical',
      'onboardingSubvertical',
      'brief',
      'planRationale',
      'planWarnings',
    ]);
    for (const key of Object.keys(partial)) {
      expect(key in state).toBe(true);
    }
  });
});

describe('merge', () => {
  it('returns current state for null/undefined persisted', () => {
    const current = useMediaPlanStore.getState();
    for (const persisted of [null, undefined]) {
      const merged = merge(persisted, current);
      expect(merged).toEqual({
        ...current,
        globalMultipliers: { ...current.globalMultipliers },
      });
    }
  });

  it('fills missing multipliers from current and lets saved values win', () => {
    const current = useMediaPlanStore.getState();
    const merged = merge({ totalBudget: 777, globalMultipliers: { spendMultiplier: 2 } }, current);
    expect(merged.totalBudget).toBe(777);
    expect(merged.globalMultipliers).toEqual({
      ...current.globalMultipliers,
      spendMultiplier: 2,
    });
    // Untouched keys come from current.
    expect(merged.channels).toBe(current.channels);
    expect(merged.projectName).toBe(current.projectName);
  });

  it('uses current multipliers when saved state has none', () => {
    const current = useMediaPlanStore.getState();
    const merged = merge({ totalBudget: 5 }, current);
    expect(merged.globalMultipliers).toEqual(current.globalMultipliers);
    expect(merged.globalMultipliers).not.toBe(current.globalMultipliers);
  });

  it('saved top-level keys overwrite current wholesale', () => {
    const current = useMediaPlanStore.getState();
    const merged = merge({ activeTiers: { tier1: 100, tier2: 0, tier3: 0 } }, current);
    expect(merged.activeTiers).toEqual({ tier1: 100, tier2: 0, tier3: 0 });
  });
});

describe('migrate', () => {
  it('v1 hard-resets to defaults and drops saved data', () => {
    const out = migrate(fixture({ projectName: 'keep?' }), 1);
    const initial = useMediaPlanStore.getInitialState();
    expect(out.totalBudget).toBe(50000);
    expect(out.presets).toEqual([]);
    expect(out.onboardingSubvertical).toBeNull();
    expect(out.projectName).toBeUndefined();
    expect(out.channels).toEqual(initial.channels);
    expect(out.globalMultipliers).toEqual(initial.globalMultipliers);
    expect(Object.keys(out).sort()).toEqual([
      'channels',
      'globalMultipliers',
      'onboardingSubvertical',
      'presets',
      'totalBudget',
    ]);
  });

  it('v2 backfills isActive, tiers and geos, then returns early', () => {
    const out = migrate(fixture(), 2);
    expect(out.totalBudget).toBe(12345);
    expect(out.channels).toEqual([{ ...legacyChannel, isActive: true }]);
    expect(out.activeTiers).toEqual(TIER_DEFAULTS);
    expect(out.activeGeos).toEqual([]);
    expect((out.globalMultipliers as GlobalMultipliers).spendMultiplier).toBe(1.5);
    expect(out.onboardingSubvertical).toBeNull();
    // Early-return quirk: later blocks never run.
    for (const key of ['subscriptionTier', 'userStatus', 'geoOverrides', 'observedLtv', 'onboardingVertical']) {
      expect(out[key]).toBeUndefined();
    }
  });

  it('v2 keeps an existing isActive=false', () => {
    const out = migrate(fixture({ channels: [{ ...legacyChannel, isActive: false }] }), 2);
    expect(out.channels).toEqual([{ ...legacyChannel, isActive: false }]);
  });

  it('v3 backfills tiers, geos, subscriptionTier, userStatus and returns early', () => {
    const out = migrate(fixture({ activeTiers: { tier1: 10, tier2: 10, tier3: 80 } }), 3);
    expect(out.activeTiers).toEqual({ tier1: 10, tier2: 10, tier3: 80 });
    expect(out.activeGeos).toEqual([]);
    expect(out.subscriptionTier).toBe('free');
    expect(out.userStatus).toBe('demo');
    expect(out.channels).toEqual([legacyChannel]);
    for (const key of ['geoOverrides', 'observedLtv', 'onboardingVertical']) {
      expect(out[key]).toBeUndefined();
    }
  });

  it('v3 fills missing tier keys from defaults', () => {
    const out = migrate(fixture({ activeTiers: { tier1: 99 } }), 3);
    expect(out.activeTiers).toEqual({ ...TIER_DEFAULTS, tier1: 99 });
  });

  it('v4 backfills subscriptionTier and userStatus only', () => {
    const out = migrate(fixture({ subscriptionTier: 'pro' }), 4);
    expect(out.subscriptionTier).toBe('pro');
    expect(out.userStatus).toBe('demo');
    expect(out.activeTiers).toBeUndefined();
    expect(out.geoOverrides).toBeUndefined();
    expect(out.observedLtv).toBeUndefined();
    expect(out.onboardingVertical).toBeUndefined();
  });

  it('v5 backfills userStatus only', () => {
    const out = migrate(fixture(), 5);
    expect(out.userStatus).toBe('demo');
    expect(out.subscriptionTier).toBeUndefined();
    expect(out.geoOverrides).toBeUndefined();
    expect(out.observedLtv).toBeUndefined();
    expect(out.onboardingVertical).toBeUndefined();
  });

  it('v6 backfills geoOverrides and observedLtv only', () => {
    const out = migrate(fixture(), 6);
    expect(out.geoOverrides).toEqual({});
    expect(out.observedLtv).toEqual({ m1: null, m3: null, m6: null });
    expect(out.userStatus).toBeUndefined();
    expect(out.onboardingVertical).toBeUndefined();
  });

  it('v7 backfills onboardingVertical only', () => {
    const out = migrate(fixture(), 7);
    expect(out.onboardingVertical).toBeNull();
    expect(out.onboardingSubvertical).toBeNull();
    expect(out.geoOverrides).toBeUndefined();
    expect(out.observedLtv).toBeUndefined();
  });

  it('v8 only applies revenue model defaults', () => {
    const out = migrate(fixture({ onboardingSubvertical: 'x' }), 8);
    expect(out.onboardingSubvertical).toBe('x');
    expect(out.onboardingVertical).toBeUndefined();
    expect(out.channels).toEqual([legacyChannel]);
  });

  it('v9 only applies revenue model defaults', () => {
    const out = migrate(fixture(), 9);
    expect(out.totalBudget).toBe(12345);
    expect(out.onboardingSubvertical).toBeNull();
    expect(out.channels).toEqual([legacyChannel]);
    expect(out.globalMultipliers).toEqual({
      ...useMediaPlanStore.getInitialState().globalMultipliers,
      spendMultiplier: 1.5,
    });
  });

  it('treats null/undefined persisted state as empty', () => {
    const out = migrate(null, 9);
    expect(out.onboardingSubvertical).toBeNull();
    expect(out.globalMultipliers).toEqual(useMediaPlanStore.getInitialState().globalMultipliers);
    const v2 = migrate(undefined, 2);
    expect(v2.channels).toEqual([]);
    expect(v2.activeTiers).toEqual(TIER_DEFAULTS);
  });

  it('pins the output key set for each starting version', () => {
    const shape = (v: number) => Object.keys(migrate(fixture(), v)).sort();
    expect(shape(1)).toMatchInlineSnapshot(`
      [
        "channels",
        "globalMultipliers",
        "onboardingSubvertical",
        "presets",
        "totalBudget",
      ]
    `);
    expect(shape(2)).toMatchInlineSnapshot(`
      [
        "activeGeos",
        "activeTiers",
        "channels",
        "globalMultipliers",
        "onboardingSubvertical",
        "presets",
        "totalBudget",
      ]
    `);
    expect(shape(3)).toMatchInlineSnapshot(`
      [
        "activeGeos",
        "activeTiers",
        "channels",
        "globalMultipliers",
        "onboardingSubvertical",
        "presets",
        "subscriptionTier",
        "totalBudget",
        "userStatus",
      ]
    `);
    expect(shape(4)).toMatchInlineSnapshot(`
      [
        "channels",
        "globalMultipliers",
        "onboardingSubvertical",
        "presets",
        "subscriptionTier",
        "totalBudget",
        "userStatus",
      ]
    `);
    expect(shape(5)).toMatchInlineSnapshot(`
      [
        "channels",
        "globalMultipliers",
        "onboardingSubvertical",
        "presets",
        "totalBudget",
        "userStatus",
      ]
    `);
    expect(shape(6)).toMatchInlineSnapshot(`
      [
        "channels",
        "geoOverrides",
        "globalMultipliers",
        "observedLtv",
        "onboardingSubvertical",
        "presets",
        "totalBudget",
      ]
    `);
    expect(shape(7)).toMatchInlineSnapshot(`
      [
        "channels",
        "globalMultipliers",
        "onboardingSubvertical",
        "onboardingVertical",
        "presets",
        "totalBudget",
      ]
    `);
    expect(shape(8)).toMatchInlineSnapshot(`
      [
        "channels",
        "globalMultipliers",
        "onboardingSubvertical",
        "presets",
        "totalBudget",
      ]
    `);
    expect(shape(9)).toMatchInlineSnapshot(`
      [
        "channels",
        "globalMultipliers",
        "onboardingSubvertical",
        "presets",
        "totalBudget",
      ]
    `);
  });

  it('pins the full v9 output', () => {
    expect(migrate(fixture(), 9)).toMatchInlineSnapshot(`
      {
        "channels": [
          {
            "allocationPct": 100,
            "id": "old",
            "name": "old",
          },
        ],
        "globalMultipliers": {
          "bonusRate": 0.25,
          "cpaTarget": null,
          "ctrBump": 0,
          "defaultCpmOverride": null,
          "margin": 0.06,
          "playerValue": 150,
          "regToFtdCvr": 0.2,
          "retentionRate": 0.55,
          "roasTarget": null,
          "spendMultiplier": 1.5,
          "turnoverRate": 1,
        },
        "onboardingSubvertical": null,
        "presets": [],
        "totalBudget": 12345,
      }
    `);
  });
});

describe('computePlanSnapshot', () => {
  const base = useMediaPlanStore.getInitialState();
  const mults: GlobalMultipliers = { ...base.globalMultipliers, cpaTarget: null, roasTarget: null };
  const input = (over: Partial<Parameters<typeof computePlanSnapshot>[0]> = {}) => ({
    totalBudget: 10000,
    channels: [makeChannel('a', { allocationPct: 60 }), makeChannel('b', { allocationPct: 40, price: 20 })],
    globalMultipliers: mults,
    activeTiers: base.activeTiers,
    activeGeos: base.activeGeos,
    geoOverrides: base.geoOverrides,
    ...over,
  });

  it('blended totals equal the sum of channel metrics', () => {
    const { channels, blended } = computePlanSnapshot(input());
    const sum = (k: 'spend' | 'impressions' | 'clicks' | 'conversions' | 'revenue') =>
      channels.reduce((s, c) => s + c.metrics[k], 0);
    expect(blended.totalSpend).toBeCloseTo(sum('spend'), 6);
    expect(blended.totalImpressions).toBeCloseTo(sum('impressions'), 6);
    expect(blended.totalClicks).toBeCloseTo(sum('clicks'), 6);
    expect(blended.totalConversions).toBeCloseTo(sum('conversions'), 6);
    expect(blended.projectedRevenue).toBeCloseTo(sum('revenue'), 6);
    expect(blended.totalSpend).toBeCloseTo(10000, 6);
    expect(blended.blendedCpa).toBeCloseTo(blended.totalSpend / blended.totalConversions, 6);
    expect(blended.blendedRoas).toBeCloseTo(blended.projectedRevenue / blended.totalSpend, 6);
  });

  it('returns null CPA and zero ROAS when there are no conversions', () => {
    const { blended } = computePlanSnapshot(input({ channels: [] }));
    expect(blended).toEqual({
      totalSpend: 0,
      totalImpressions: 0,
      totalClicks: 0,
      totalConversions: 0,
      blendedCpa: null,
      projectedRevenue: 0,
      blendedRoas: 0,
    });
  });

  it('tolerates non-array channels', () => {
    const { channels } = computePlanSnapshot(input({ channels: undefined as unknown as ChannelData[] }));
    expect(channels).toEqual([]);
  });

  it('sets aboveCpaTarget / belowRoasTarget from the multiplier targets', () => {
    const open = computePlanSnapshot(input());
    expect(open.channels.every((c) => !c.aboveCpaTarget && !c.belowRoasTarget)).toBe(true);

    const strict = computePlanSnapshot(input({ globalMultipliers: { ...mults, cpaTarget: 0.0001, roasTarget: 1e9 } }));
    expect(strict.channels.every((c) => c.aboveCpaTarget && c.belowRoasTarget)).toBe(true);

    const lax = computePlanSnapshot(input({ globalMultipliers: { ...mults, cpaTarget: 1e9, roasTarget: 0.0001 } }));
    expect(lax.channels.every((c) => !c.aboveCpaTarget && !c.belowRoasTarget)).toBe(true);
  });

  it('gives inactive channels zero spend and subtracts fixed-cost price from the pool', () => {
    const { channels } = computePlanSnapshot(
      input({
        channels: [
          makeChannel('var', { allocationPct: 100 }),
          makeChannel('off', { allocationPct: 100, isActive: false }),
          makeChannel('fix', {
            allocationPct: 0,
            tier: 'fixed',
            buyingModel: 'FLAT_FEE',
            price: 2000,
          }),
        ],
      })
    );
    expect(channels.map((c) => c.metrics.spend)).toEqual([8000, 0, 2000]);
  });
});
