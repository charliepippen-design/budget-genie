import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlanCanvas } from '@/components/dashboard/PlanCanvas';
import { PlanKpiBar } from '@/components/dashboard/PlanKpiBar';
import { CurrencyProvider, formatMoney } from '@/contexts/CurrencyContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import {
  computePlanResult,
  placeholderEngine,
  responseCurveEngine,
  selectProjectionBand,
  setEngine,
} from '@/engine';
import { useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { RANGE_HINT, formatRange, paybackRangeLabel } from '@/lib/plan-ranges';
import { generatePlan } from '@/lib/plan-generator';
import { byText, cleanup, click, mount } from '@/test/mount';

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
        <PlanKpiBar />
        <PlanCanvas onOpenChannels={() => {}} />
      </CurrencyProvider>
    </ThemeProvider>
  );

const rangeLines = (el: ParentNode) => [...el.querySelectorAll('[data-testid="range-line"]')];
const whole = (value: number) => Math.round(value).toLocaleString('en-US');
const times = (value: number) => `${value.toFixed(2)}x`;

describe('plan ranges on the Overview', () => {
  beforeEach(() => {
    localStorage.clear();
    useMediaPlanStore
      .getState()
      .applyGeneratedPlan(generatePlan({ industry: 'igaming', monthlyBudget: 100000, markets: ['DE'] }));
  });
  afterEach(async () => {
    await cleanup();
    setEngine(placeholderEngine);
  });

  it('shows no range, optimiser or assumptions link with the standard engine', async () => {
    const el = await render();
    const result = computePlanResult(useMediaPlanStore.getState());
    expect(result.ranges).toBeUndefined();
    expect(selectProjectionBand(result)).toBeNull();
    expect(rangeLines(el)).toHaveLength(0);
    expect(el.querySelectorAll('[data-range]')).toHaveLength(0);
    expect(el.textContent).not.toMatch(/Optimise mix|How these ranges are estimated|likely/i);
    const payback = result.customerValue.paybackMonth;
    expect(el.textContent).toContain(
      payback === null ? 'No payback within 12 months' : `Pays back in month ${payback}`
    );
  });

  it('shows the engine ranges under the headline figures with the response-curve engine', async () => {
    setEngine(responseCurveEngine);
    const el = await render();
    const { ranges, totals } = computePlanResult(useMediaPlanStore.getState());
    const money = (value: number) => formatMoney(value, 'EUR');

    const lines = rangeLines(el.querySelector('[data-testid="plan-kpi-bar"]')!);
    expect(lines.map((line) => line.textContent)).toEqual([
      formatRange(ranges!.totals.revenue, money),
      formatRange(ranges!.totals.costPerConversion!, money),
      formatRange(ranges!.totals.roas, times),
      formatRange(ranges!.totals.conversions, whole),
    ]);
    expect(lines[3].textContent).toBe(
      `${whole(ranges!.totals.conversions.p10)} – ${whole(ranges!.totals.conversions.p90)}`
    );
    for (const line of lines) expect(line.getAttribute('title')).toBe(RANGE_HINT);
    // The headline stays the engine's P50.
    expect(ranges!.totals.conversions.p50).toBeCloseTo(totals.totalConversions, 6);
  });

  it('gives each active channel its range, the payback range and the assumptions', async () => {
    setEngine(responseCurveEngine);
    const el = await render();
    const result = computePlanResult(useMediaPlanStore.getState());
    const ranges = result.ranges!;

    const hints = [...el.querySelectorAll('[data-range]')].map((node) => node.getAttribute('data-range'));
    const active = result.channels.filter((channel) => channel.isActive !== false);
    expect(hints).toEqual(
      active.flatMap((channel) => [
        `Likely ${formatRange(ranges.channels[channel.id].conversions, whole)}`,
        `Likely ${formatRange(ranges.channels[channel.id].roas, times)}`,
      ])
    );

    expect(el.textContent).toContain(paybackRangeLabel(ranges.paybackMonth).text);
    for (const scenario of result.scenarios) expect(el.textContent).toContain(scenario.scenario);

    const band = selectProjectionBand(result)!;
    expect(band).toHaveLength(result.customerValue.curve.length);
    band.forEach((month, index) => {
      expect(month.p50).toBe(result.customerValue.curve[index].cohortValue);
      expect(month.p10).toBeLessThan(month.p50);
      expect(month.p90).toBeGreaterThan(month.p50);
    });

    await click(byText(el, 'button', 'How these ranges are estimated'));
    const dialog = document.querySelector('[data-testid="range-assumptions"]')!;
    for (const assumption of ranges.assumptions) expect(dialog.textContent).toContain(assumption);
    expect(dialog.textContent).toContain(
      'Ranges come from a planning model with stated assumptions, not from your campaign data. They narrow when you enter observed customer value.'
    );
  });

  it('shows a channel range when its figure is focused', async () => {
    setEngine(responseCurveEngine);
    const el = await render();
    const first = el.querySelector<HTMLElement>('[data-range]')!;
    await act(async () => first.focus());
    expect(document.body.textContent).toContain(first.getAttribute('data-range'));
  });
});

describe('paybackRangeLabel', () => {
  it('words every case of the payback range', () => {
    expect(paybackRangeLabel({ p10: 2, p50: 8, p90: 20 })).toEqual({
      text: 'Pays back in month 8 (likely 2 – 20)',
      tone: 'good',
      caution: null,
    });
    expect(paybackRangeLabel({ p10: 1, p50: 1, p90: 1 }).text).toBe('Pays back in month 1');
    expect(paybackRangeLabel({ p10: 3, p50: 14, p90: null })).toEqual({
      text: 'Pays back in month 14 (likely from month 3)',
      tone: 'good',
      caution: 'No payback within 36 months in the cautious case',
    });
    expect(paybackRangeLabel({ p10: 9, p50: null, p90: null })).toEqual({
      text: 'No payback within 36 months (month 9 at best)',
      tone: 'bad',
      caution: null,
    });
    expect(paybackRangeLabel({ p10: null, p50: null, p90: null }).text).toBe('No payback within 36 months');
  });
});
