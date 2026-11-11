// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { computePlanSnapshot, useMediaPlanStore, type MediaPlanState } from './use-media-plan-store';
import { TIER_DEFAULTS } from '@/lib/geo-market-data';

type AnyRecord = Record<string, unknown>;
const options = useMediaPlanStore.persist.getOptions();
const migrate = options.migrate as unknown as (s: unknown, v: number) => AnyRecord;
const merge = options.merge as unknown as (s: unknown, c: MediaPlanState) => MediaPlanState;

const savedChannel = {
  id: 'c1',
  name: 'Paid Search',
  category: 'Paid Search',
  allocationPct: 100,
  family: 'paid_media',
  buyingModel: 'CPC',
  typeConfig: { family: 'paid_media', buyingModel: 'CPC', price: 2, baselineMetrics: { ctr: 2, conversionRate: 3 } },
  tier: 'scalable',
  locked: false,
  isActive: true,
};

// N-5: every starting version cascades through all later steps and keeps the user's data.
describe('migrate: table over every version (N-5)', () => {
  const V9_FIELDS = [
    'activeTiers',
    'activeGeos',
    'subscriptionTier',
    'userStatus',
    'geoOverrides',
    'observedLtv',
    'onboardingVertical',
    'onboardingSubvertical',
    'globalMultipliers',
  ];
  const fieldAddedIn: Record<string, number> = {
    activeTiers: 4,
    activeGeos: 4,
    subscriptionTier: 5,
    userStatus: 6,
    geoOverrides: 7,
    observedLtv: 7,
    onboardingVertical: 8,
    onboardingSubvertical: 9,
    globalMultipliers: 9,
  };

  it.each([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])('a v%i save ends with every field its version lacked', (version) => {
    const out = migrate({ totalBudget: 4321, channels: [savedChannel], presets: [] }, version);
    expect(out.totalBudget).toBe(4321);
    expect((out.channels as AnyRecord[])[0]).toMatchObject({ id: 'c1', allocationPct: 100, isActive: true });
    for (const field of V9_FIELDS) {
      if (version < fieldAddedIn[field]) expect(out, `${field} @v${version}`).toHaveProperty(field);
    }
    if (version < 4) expect(out.activeTiers).toEqual(TIER_DEFAULTS);
  });
});

// SA-6: a stored shape the app cannot use never crashes hydration; bad fields fall back to defaults.
describe('merge validates stored state (SA-6)', () => {
  const current = () => useMediaPlanStore.getInitialState();

  it.each<[string, unknown]>([
    ['null', null],
    ['a string', 'garbage'],
    ['an array', [1, 2, 3]],
    ['wrong field types', { totalBudget: 'lots', channels: { a: 1 }, activeTiers: null, activeGeos: 'US' }],
    ['non-object channels', { channels: [1, 'two', null] }],
    ['bad multipliers', { globalMultipliers: { margin: 'x', retentionRate: null, spendMultiplier: 2 } }],
    ['bad enums', { subscriptionTier: 'gold', userStatus: 7 }],
  ])('falls back to defaults for %s', (_label, persisted) => {
    const base = current();
    const merged = merge(persisted, base);
    expect(typeof merged.totalBudget).toBe('number');
    expect(Array.isArray(merged.channels)).toBe(true);
    expect(merged.channels.length).toBeGreaterThan(0);
    expect(Array.isArray(merged.activeGeos)).toBe(true);
    expect(merged.activeTiers).toEqual(base.activeTiers);
    expect(['free', 'pro', 'enterprise']).toContain(merged.subscriptionTier);
    expect(Number.isFinite(merged.globalMultipliers.margin)).toBe(true);
    expect(Number.isFinite(merged.globalMultipliers.retentionRate)).toBe(true);
    expect(typeof merged.setTotalBudget).toBe('function');
    expect(() => computePlanSnapshot(merged)).not.toThrow();
  });

  it('keeps every valid field and drops only the invalid ones', () => {
    const merged = merge(
      { totalBudget: 9000, channels: [savedChannel], activeGeos: 42, globalMultipliers: { spendMultiplier: 2, margin: 'x' } },
      current()
    );
    expect(merged.totalBudget).toBe(9000);
    expect(merged.channels).toEqual([savedChannel]);
    expect(merged.activeGeos).toEqual(current().activeGeos);
    expect(merged.globalMultipliers.spendMultiplier).toBe(2);
    expect(merged.globalMultipliers.margin).toBe(current().globalMultipliers.margin);
  });

  it('drops only the invalid channels and keeps the valid ones unchanged', () => {
    const second = { ...savedChannel, id: 'c2', name: 'Social', allocationPct: 40 };
    const broken = { ...savedChannel, id: 'c3', typeConfig: { ...savedChannel.typeConfig, price: null } };
    const merged = merge({ channels: [savedChannel, broken, second] }, current());
    expect(merged.channels).toEqual([savedChannel, second]);
  });

  it('falls back to default channels when every stored channel is invalid', () => {
    const broken = { ...savedChannel, allocationPct: 'all' };
    const merged = merge({ channels: [broken] }, current());
    expect(merged.channels).toEqual(current().channels);
  });

  it('never lets stored data replace an action', () => {
    const merged = merge({ setTotalBudget: 'nope', totalBudget: 5000 }, current());
    expect(typeof merged.setTotalBudget).toBe('function');
    expect(merged.totalBudget).toBe(5000);
  });

  it('drops malformed presets and keeps good ones', () => {
    const good = { name: 'Good', totalBudget: 1000, channels: [savedChannel], globalMultipliers: {} };
    const merged = merge({ presets: [good, { name: 3 }, 'x', null] }, current());
    expect(merged.presets).toEqual([good]);
  });

  describe('hydration from localStorage', () => {
    beforeEach(() => localStorage.clear());

    it('a corrupt save rehydrates to a usable plan instead of crashing', async () => {
      localStorage.setItem(
        'mediaplan-store-v2',
        JSON.stringify({ state: { totalBudget: 'lots', channels: { not: 'an array' }, observedLtv: 5 }, version: 9 })
      );
      await useMediaPlanStore.persist.rehydrate();
      const state = useMediaPlanStore.getState();
      expect(typeof state.totalBudget).toBe('number');
      expect(Array.isArray(state.channels)).toBe(true);
      expect(state.observedLtv).toEqual({ m1: null, m3: null, m6: null });
      expect(() => computePlanSnapshot(state)).not.toThrow();
    });
  });
});
