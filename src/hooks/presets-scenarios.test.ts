import { beforeEach, describe, expect, it } from 'vitest';
import { useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { useMultiMonthStore } from '@/hooks/use-multi-month-store';

describe('media plan presets', () => {
  beforeEach(() => {
    localStorage.clear();
    useMediaPlanStore.setState({ presets: [] });
  });

  it('save then load restores budget, channels, settings and markets', () => {
    const s = useMediaPlanStore.getState();
    s.setTotalBudget(80000);
    s.setGlobalMultipliers({ playerValue: 222, cpaTarget: 40 });
    s.setGeoOverride('Germany', { cpa: 123 });
    s.addActiveGeo('Germany');
    const savedIds = useMediaPlanStore.getState().channels.map((c) => c.id);
    const savedAlloc = useMediaPlanStore.getState().channels.map((c) => c.allocationPct);
    s.savePreset('  Q1 plan ');

    // Change everything, then load.
    const t = useMediaPlanStore.getState();
    t.setTotalBudget(5000);
    t.setGlobalMultipliers({ playerValue: 10, cpaTarget: null });
    t.clearGeoOverride('Germany');
    t.clearActiveGeos();
    t.deleteChannel(savedIds[0]);
    t.toggleChannelActive(savedIds[1]);

    useMediaPlanStore.getState().loadPreset('Q1 plan');
    const r = useMediaPlanStore.getState();
    expect(r.totalBudget).toBe(80000);
    expect(r.globalMultipliers.playerValue).toBe(222);
    expect(r.globalMultipliers.cpaTarget).toBe(40);
    expect(r.channels.map((c) => c.id)).toEqual(savedIds);
    expect(r.channels.map((c) => c.allocationPct)).toEqual(savedAlloc);
    expect(r.channels.every((c) => c.isActive)).toBe(true);
    expect(r.activeGeos).toEqual(['Germany']);
    expect(r.geoOverrides.Germany).toEqual({ cpa: 123 });
  });

  it('a loaded preset is a copy, later edits do not mutate the saved one', () => {
    useMediaPlanStore.getState().savePreset('A');
    useMediaPlanStore.getState().loadPreset('A');
    const id = useMediaPlanStore.getState().channels[0].id;
    useMediaPlanStore.getState().toggleChannelLock(id);
    expect(useMediaPlanStore.getState().presets[0].channels[0].locked).toBe(false);
  });

  it('saving under an existing name overwrites; blank names are ignored; unknown loads are no-ops', () => {
    const s = useMediaPlanStore.getState();
    s.savePreset('A');
    s.setTotalBudget(12345);
    s.savePreset('A');
    s.savePreset('   ');
    expect(useMediaPlanStore.getState().presets).toHaveLength(1);
    expect(useMediaPlanStore.getState().presets[0].totalBudget).toBe(12345);
    useMediaPlanStore.getState().loadPreset('missing');
    expect(useMediaPlanStore.getState().totalBudget).toBe(12345);
  });

  it('delete removes the preset', () => {
    useMediaPlanStore.getState().savePreset('A');
    useMediaPlanStore.getState().deletePreset('A');
    expect(useMediaPlanStore.getState().presets).toEqual([]);
  });

  it('presets survive a reload', async () => {
    useMediaPlanStore.getState().setTotalBudget(64000);
    useMediaPlanStore.getState().savePreset('Persisted');
    const raw = localStorage.getItem('mediaplan-store-v2');
    expect(raw).toBeTruthy();

    // Simulate a fresh page: in-memory state gone, storage intact.
    useMediaPlanStore.setState({ presets: [], totalBudget: 1000 });
    localStorage.setItem('mediaplan-store-v2', raw as string);
    await useMediaPlanStore.persist.rehydrate();

    expect(useMediaPlanStore.getState().presets.map((p) => p.name)).toEqual(['Persisted']);
    useMediaPlanStore.getState().loadPreset('Persisted');
    expect(useMediaPlanStore.getState().totalBudget).toBe(64000);
  });
});

describe('multi-month scenarios', () => {
  beforeEach(() => {
    localStorage.clear();
    useMultiMonthStore.setState({ scenarios: [], activeScenarioId: null });
    useMultiMonthStore.getState().generateMonths();
  });

  it('save then load restores planning settings and months', () => {
    const s = useMultiMonthStore.getState();
    s.setPlanningMonths(4);
    s.generateMonths();
    const savedMonths = JSON.parse(JSON.stringify(useMultiMonthStore.getState().months));
    useMultiMonthStore.getState().saveScenario('Four months');
    const id = useMultiMonthStore.getState().scenarios[0].id;

    useMultiMonthStore.getState().setPlanningMonths(2);
    useMultiMonthStore.getState().generateMonths();
    expect(useMultiMonthStore.getState().months).not.toHaveLength(savedMonths.length);

    useMultiMonthStore.getState().loadScenario(id);
    const r = useMultiMonthStore.getState();
    expect(r.planningMonths).toBe(4);
    expect(r.months).toEqual(savedMonths);
    expect(r.activeScenarioId).toBe(id);
    // The month panel must not regenerate over a loaded scenario.
    expect(r.monthsCustomized).toBe(true);
  });

  it('scenarios survive a reload with createdAt as a Date', async () => {
    useMultiMonthStore.getState().saveScenario('Keep me');
    const raw = localStorage.getItem('multi-month-plan-store');
    expect(raw).toBeTruthy();

    useMultiMonthStore.setState({ scenarios: [] });
    localStorage.setItem('multi-month-plan-store', raw as string);
    await useMultiMonthStore.persist.rehydrate();

    const [sc] = useMultiMonthStore.getState().scenarios;
    expect(sc.name).toBe('Keep me');
    expect(sc.createdAt).toBeInstanceOf(Date);
    useMultiMonthStore.getState().loadScenario(sc.id);
    expect(useMultiMonthStore.getState().activeScenarioId).toBe(sc.id);
  });
});
