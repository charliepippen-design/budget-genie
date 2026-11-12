import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlanCanvas } from '@/components/dashboard/PlanCanvas';
import { CurrencyProvider, formatMoney } from '@/contexts/CurrencyContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import {
  computeOptimisedMix,
  computePlanResult,
  placeholderEngine,
  responseCurveEngine,
  selectEngineInput,
  setEngine,
} from '@/engine';
import { useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { generatePlan } from '@/lib/plan-generator';
import { byText, cleanup, click, mount } from '@/test/mount';

const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { success: toastSuccess } }));

// Recharts needs a measured container; the chart itself is not under test here.
vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>();
  return { ...actual, ResponsiveContainer: () => null };
});

// The slider measures itself; jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const render = () =>
  mount(
    <ThemeProvider>
      <CurrencyProvider>
        <PlanCanvas onOpenChannels={() => {}} />
      </CurrencyProvider>
    </ThemeProvider>
  );

const state = () => useMediaPlanStore.getState();
const shares = () => Object.fromEntries(state().channels.map((c) => [c.id, c.allocationPct]));
const dialog = () => document.querySelector('[data-testid="optimise-mix"]');
const button = (label: string) => byText(dialog()!, 'button', label);
const open = async (el: HTMLElement) => click(byText(el, 'button', 'Optimise mix'));
const whole = (value: number) => Math.round(value).toLocaleString('en-US');
const money = (value: number) => formatMoney(value, 'EUR');

describe('Optimise mix', () => {
  beforeEach(() => {
    localStorage.clear();
    toastSuccess.mockClear();
    state().applyGeneratedPlan(generatePlan({ industry: 'igaming', monthlyBudget: 100000, markets: ['DE'] }));
    setEngine(responseCurveEngine);
  });
  afterEach(async () => {
    await cleanup();
    setEngine(placeholderEngine);
  });

  it('is not offered by an engine without an optimiser', async () => {
    setEngine(placeholderEngine);
    const el = await render();
    expect(byText(el, 'button', 'Optimise mix')).toBeNull();
    expect(computeOptimisedMix(state(), { goal: 'conversions' })).toBeNull();
  });

  it('previews the engine result: headline figures and the channels whose share moves', async () => {
    const el = await render();
    await open(el);
    expect(dialog()!.textContent).toContain('Locked and switched-off channels stay as they are.');
    expect([...dialog()!.querySelectorAll('[role="radio"]')].map((b) => b.textContent)).toEqual([
      'More FTDs',
      'More customer value',
      'More net value',
    ]);

    const before = shares();
    const expected = responseCurveEngine.optimise!(selectEngineInput(state()), {
      goal: 'conversions',
      constraints: { maxCostPerConversion: null },
    });
    const mix = computeOptimisedMix(state(), { goal: 'conversions', constraints: { maxCostPerConversion: null } })!;
    expect(mix.result).toEqual(expected);
    expect(mix.material).toBe(true);

    await click(button('Preview'));
    const rows = [...dialog()!.querySelectorAll('[data-testid="optimise-row"]')].map((row) =>
      [...row.children].map((cell) => cell.textContent).filter(Boolean)
    );
    expect(rows).toEqual([
      ['FTDs', whole(expected.before.conversions), whole(expected.after.conversions)],
      ['Customer value', money(expected.before.value), money(expected.after.value)],
      ['Cost per FTD', money(expected.before.costPerConversion!), money(expected.after.costPerConversion!)],
      ['Net value', money(expected.before.net), money(expected.after.net)],
    ]);
    const changes = [...dialog()!.querySelectorAll('[data-testid="optimise-change"]')].map((row) =>
      [...row.children].map((cell) => cell.textContent).filter(Boolean)
    );
    expect(changes.length).toBeGreaterThan(0);
    expect(changes).toEqual(
      mix.changes.map((change) => [change.name, `${change.beforePct.toFixed(1)}%`, `${change.afterPct.toFixed(1)}%`])
    );
    for (const change of mix.changes) expect(Math.abs(change.afterPct - change.beforePct)).toBeGreaterThan(1);
    // A preview changes nothing.
    expect(shares()).toEqual(before);
  });

  it('Cancel leaves the plan as it was', async () => {
    const el = await render();
    const before = shares();
    const budget = state().totalBudget;
    await open(el);
    await click(button('Preview'));
    await click(button('Cancel'));
    expect(dialog()).toBeNull();
    expect(shares()).toEqual(before);
    expect(state().totalBudget).toBe(budget);
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('Apply writes the optimiser shares and the plan then shows its figures', async () => {
    const el = await render();
    const before = shares();
    const expected = responseCurveEngine.optimise!(selectEngineInput(state()), {
      goal: 'conversions',
      constraints: { maxCostPerConversion: null },
    });
    await open(el);
    await click(button('Preview'));
    await click(button('Apply'));

    expect(dialog()).toBeNull();
    // The store holds the optimiser's split: each moved channel spends what the optimiser said.
    expect(expected.movedChannelIds.length).toBeGreaterThan(1);
    expect(shares()).not.toEqual(before);
    for (const channel of computePlanResult(state()).channels) {
      expect(channel.metrics.spend).toBeCloseTo(expected.spend[channel.id], 6);
    }
    expect(state().channels.reduce((total, c) => total + (c.isActive === false ? 0 : c.allocationPct), 0)).toBeCloseTo(
      Object.values(before).reduce((total, pct) => total + pct, 0),
      6
    );
    const after = computePlanResult(state());
    expect(after.totals.totalConversions).toBeCloseTo(expected.after.conversions, 6);
    expect(after.totals.totalSpend).toBeCloseTo(expected.after.spend, 6);
    expect(toastSuccess).toHaveBeenCalledWith('Mix optimised. Undo with Ctrl+Z.');
  });

  it('says so when the mix is already close to the best split', async () => {
    const first = computeOptimisedMix(state(), { goal: 'conversions', constraints: { maxCostPerConversion: null } })!;
    state().setAllocations(first.shares);
    const before = shares();

    const el = await render();
    await open(el);
    await click(button('Preview'));
    expect(dialog()!.textContent).toContain('This mix is already close to the best split for that goal.');
    expect(button('Apply')).toBeNull();
    await click(button('Close'));
    expect(shares()).toEqual(before);
  });

  it('leaves a locked channel and a switched-off channel untouched', async () => {
    const [locked, off] = state().channels.filter((c) => c.tier !== 'fixed');
    state().toggleChannelLock(locked.id);
    state().toggleChannelActive(off.id);
    const start = computePlanResult(state());
    const lockedBefore = state().channels.find((c) => c.id === locked.id)!;
    const offBefore = state().channels.find((c) => c.id === off.id)!;

    const el = await render();
    await open(el);
    await click(button('Preview'));
    await click(button('Apply'));

    const lockedAfter = state().channels.find((c) => c.id === locked.id)!;
    const offAfter = state().channels.find((c) => c.id === off.id)!;
    expect(lockedAfter.locked).toBe(true);
    expect(lockedAfter.allocationPct).toBe(lockedBefore.allocationPct);
    expect(offAfter.isActive).toBe(false);
    expect(offAfter.allocationPct).toBe(offBefore.allocationPct);
    const end = computePlanResult(state());
    const spend = (result: typeof end, id: string) => result.channels.find((c) => c.id === id)!.metrics.spend;
    expect(spend(end, locked.id)).toBeCloseTo(spend(start, locked.id), 6);
    expect(spend(end, off.id)).toBe(0);
  });

  it('prefills the cost limit from the plan target', async () => {
    state().setGlobalMultipliers({ cpaTarget: 180 });
    const el = await render();
    await open(el);
    expect(dialog()!.querySelector<HTMLInputElement>('input')!.value).toBe('180');
  });
});
