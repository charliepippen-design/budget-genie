// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { useMultiMonthStore, type MultiMonthState } from './use-multi-month-store';

const options = useMultiMonthStore.persist.getOptions();
const KEY = 'multi-month-plan-store';

const month = (i: number) => ({
  id: `month-${i}`,
  label: `M${i}`,
  monthIndex: i,
  isSoftLaunch: false,
  budget: 1000 * (i + 1),
  budgetMultiplier: 1,
  budgetLocked: false,
  spendMultiplier: null,
  cpmOverride: null,
  ctrBump: null,
  channels: [{ channelId: 'a', name: 'A', category: 'Paid Search', allocationPct: 100, cpm: 5, ctr: 1, cr: 2, roas: 1, impressionMode: 'CPM', fixedImpressions: 0, locked: false }],
  useGlobalChannels: true,
});

// SA-6: the multi-month store is versioned, migrates old saves and validates what it loads.
describe('multi-month persistence (SA-6)', () => {
  beforeEach(() => localStorage.clear());

  it('keeps the storage key, and has a version and a migrate function', () => {
    expect(options.name).toBe(KEY);
    expect(options.version).toBe(1);
    expect(typeof options.migrate).toBe('function');
  });

  it('an unversioned (v0) save still loads', async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ state: { planningMonths: 9, startMonth: '2026-03', months: [month(0), month(1)], userNotes: 'keep me' }, version: 0 })
    );
    await useMultiMonthStore.persist.rehydrate();
    const s = useMultiMonthStore.getState();
    expect(s.planningMonths).toBe(9);
    expect(s.startMonth).toBe('2026-03');
    expect(s.months.map((m) => m.budget)).toEqual([1000, 2000]);
    expect(s.userNotes).toBe('keep me');
  });

  it('bad stored shapes fall back to defaults instead of crashing', () => {
    const merge = options.merge as unknown as (p: unknown, c: MultiMonthState) => MultiMonthState;
    const current = useMultiMonthStore.getInitialState();
    for (const persisted of [
      null,
      'garbage',
      { months: 'x', scenarios: 'y', startMonth: 5, globalSettings: null, pdfSections: [] },
      { months: [{ id: 1 }], progressionPattern: 'zigzag', planningMonths: 'six' },
    ]) {
      const merged = merge(persisted, current);
      expect(Array.isArray(merged.months)).toBe(true);
      expect(Array.isArray(merged.scenarios)).toBe(true);
      expect(merged.startMonth).toBe(current.startMonth);
      expect(merged.globalSettings).toEqual(current.globalSettings);
      expect(merged.progressionPattern).toBe(current.progressionPattern);
      expect(merged.planningMonths).toBe(current.planningMonths);
      expect(typeof merged.generateMonths).toBe('function');
    }
  });

  it('skips malformed scenarios, keeps good ones and revives createdAt as a Date', () => {
    const merge = options.merge as unknown as (p: unknown, c: MultiMonthState) => MultiMonthState;
    const good = { id: 's1', name: 'Good', createdAt: '2026-01-02T00:00:00.000Z', months: [month(0)] };
    const merged = merge({ scenarios: [good, { id: 's2' }, null] }, useMultiMonthStore.getInitialState());
    expect(merged.scenarios.map((s) => s.id)).toEqual(['s1']);
    expect(merged.scenarios[0].createdAt).toBeInstanceOf(Date);
  });
});
