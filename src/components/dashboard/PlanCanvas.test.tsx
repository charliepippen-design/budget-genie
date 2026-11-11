import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CurrencyProvider } from '@/contexts/CurrencyContext';
import { computePlanResult } from '@/engine';
import { useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { generatePlan } from '@/lib/plan-generator';
import { cleanup, click, mount } from '@/test/mount';
import { PlanCanvas } from './PlanCanvas';

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

const render = (onOpenChannels = () => {}) =>
  mount(
    <ThemeProvider>
      <CurrencyProvider>
        <PlanCanvas onOpenChannels={onOpenChannels} />
      </CurrencyProvider>
    </ThemeProvider>
  );

describe('PlanCanvas', () => {
  beforeEach(() => {
    localStorage.clear();
    useMediaPlanStore
      .getState()
      .applyGeneratedPlan(generatePlan({ industry: 'ecommerce', monthlyBudget: 40000, markets: ['DE'] }));
  });
  afterEach(cleanup);

  it('lists every channel with the engine figures and the payback month', async () => {
    const el = await render();
    const result = computePlanResult(useMediaPlanStore.getState());
    for (const channel of result.channels) expect(el.textContent).toContain(channel.name);
    expect(el.querySelectorAll('[role="slider"]').length).toBeGreaterThan(0);
    const payback = result.customerValue.paybackMonth;
    expect(el.textContent).toContain(
      payback === null ? 'No payback within 12 months' : `Pays back in month ${payback}`
    );
    for (const scenario of result.scenarios) expect(el.textContent).toContain(scenario.scenario);
  });

  it('turning a channel off removes its spend from the plan', async () => {
    const el = await render();
    const first = useMediaPlanStore.getState().channels[0];
    await click(el.querySelector(`[aria-label="Turn off ${first.name}"]`));
    const after = computePlanResult(useMediaPlanStore.getState());
    expect(after.channels.find((c) => c.id === first.id)?.metrics.spend).toBe(0);
    expect(el.querySelector(`[aria-label="Turn on ${first.name}"]`)).not.toBeNull();
  });

  it('a budget step changes the budget and keeps it on a round figure', async () => {
    const el = await render();
    const plus20 = [...el.querySelectorAll('button')].find((b) => b.textContent === '+20%')!;
    await click(plus20);
    expect(useMediaPlanStore.getState().totalBudget).toBe(48000);
  });

  it('links to the Channels tab for prices and funnel rates', async () => {
    const open = vi.fn();
    const el = await render(open);
    await click([...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Prices and funnel rates'))!);
    expect(open).toHaveBeenCalled();
  });
});
