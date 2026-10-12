import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { generateJSON } = vi.hoisted(() => ({ generateJSON: vi.fn() }));
vi.mock('@/lib/ai-client', async (orig) => ({
  ...(await orig<typeof import('@/lib/ai-client')>()),
  generateJSON,
}));

import { AIError } from '@/lib/ai-client';
import {
  NARRATIVE_CACHE_KEY,
  NARRATIVE_CACHE_MAX,
  getCachedNarrative,
  hashNarratorInput,
  setCachedNarrative,
} from '@/lib/narrative-cache';
import type { ReportNarratorInput } from '@/lib/report-narrator';
import { useReportNarrative } from './use-report-narrative';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const input = (over: Partial<ReportNarratorInput> = {}): ReportNarratorInput => ({
  totalBudget: 1000,
  totalSpend: 900,
  projectedRevenue: 3000,
  projectedFtds: 40,
  blendedCpa: 22,
  blendedRoas: 3.3,
  paybackMonths: 2,
  topChannel: 'Search',
  weakestChannel: null,
  scenarioBase: { ltvToCac: 3, projectedCohortValue: 5000 },
  alertCount: 0,
  vertical: null,
  geos: ['IT'],
  currency: 'EUR',
  ...over,
});

const narrative = {
  executiveSummary: 'sum',
  operatorInsight: 'ins',
  biggestRisk: 'risk',
  firstCheckIn: 'check',
};

beforeEach(() => {
  localStorage.clear();
  generateJSON.mockReset();
  generateJSON.mockResolvedValue(narrative);
});

describe('narrative cache', () => {
  it('hash is stable across key order and sensitive to currency', () => {
    const a = input();
    const b = Object.fromEntries(Object.entries(a).reverse()) as unknown as ReportNarratorInput;
    expect(hashNarratorInput(a)).toBe(hashNarratorInput(b));
    expect(hashNarratorInput(a)).not.toBe(hashNarratorInput(input({ currency: 'USD' })));
    expect(hashNarratorInput(a)).not.toBe(hashNarratorInput(input({ totalBudget: 1001 })));
  });

  it('hits on the same hash and misses on another', () => {
    setCachedNarrative('aaaa', narrative);
    expect(getCachedNarrative('aaaa')).toEqual(narrative);
    expect(getCachedNarrative('bbbb')).toBeNull();
  });

  it('keeps only the most recent entries', () => {
    for (let i = 0; i < NARRATIVE_CACHE_MAX + 3; i++) setCachedNarrative(`h${i}`, narrative);
    expect(JSON.parse(localStorage.getItem(NARRATIVE_CACHE_KEY)!)).toHaveLength(NARRATIVE_CACHE_MAX);
    expect(getCachedNarrative('h0')).toBeNull();
    expect(getCachedNarrative(`h${NARRATIVE_CACHE_MAX + 2}`)).toEqual(narrative);
  });

  it('ignores corrupt storage', () => {
    localStorage.setItem(NARRATIVE_CACHE_KEY, '{nope');
    expect(getCachedNarrative('x')).toBeNull();
  });
});

describe('useReportNarrative', () => {
  let container: HTMLDivElement;
  let root: Root;
  let api: ReturnType<typeof useReportNarrative>;

  const Harness = ({ data }: { data: ReportNarratorInput }) => {
    api = useReportNarrative(data);
    return <span>{api.narrative?.executiveSummary ?? 'none'}</span>;
  };
  const mount = (data: ReportNarratorInput) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<Harness data={data} />));
  };
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('makes zero AI calls on mount, one on explicit generate, zero on a revisit', async () => {
    mount(input());
    expect(generateJSON).not.toHaveBeenCalled();
    expect(container.textContent).toBe('none');

    await act(async () => {
      await api.generate();
    });
    expect(generateJSON).toHaveBeenCalledTimes(1);
    expect(container.textContent).toBe('sum');

    // Second visit, same plan: other page or remount.
    act(() => root.unmount());
    container.remove();
    mount(input());
    expect(container.textContent).toBe('sum');
    expect(generateJSON).toHaveBeenCalledTimes(1);
  });

  it('does not show a cached summary for a changed plan', async () => {
    mount(input());
    await act(async () => {
      await api.generate();
    });
    act(() => root.render(<Harness data={input({ totalBudget: 2000 })} />));
    expect(container.textContent).toBe('none');
    expect(generateJSON).toHaveBeenCalledTimes(1);
  });

  it('fills profitability and the value label from the plan and sends them to the AI', async () => {
    // Eval seed d2-007: "Write me a short summary of this plan for my boss"
    mount(input());
    await act(async () => {
      await api.generate();
    });
    const prompt = generateJSON.mock.calls[0][0] as string;
    expect(prompt).toContain('Monthly profit or loss (engine):');
    expect(prompt).toContain('Break-even cost per customer (engine):');
    expect(prompt).not.toMatch(/Month 1/);
  });

  it('hashes profitability so a summary from a different verdict is not reused', async () => {
    const profit = { losesMoney: false, monthlyContribution: 900, breakEvenCpa: 40, blendedCpa: 22 };
    const loss = { losesMoney: true, monthlyContribution: -18783, breakEvenCpa: 11, blendedCpa: 177.54 };
    expect(hashNarratorInput(input({ profitability: profit }))).not.toBe(
      hashNarratorInput(input({ profitability: loss }))
    );
    expect(hashNarratorInput(input())).not.toBe(hashNarratorInput(input({ revenueLabel: 'Projected Revenue' })));

    mount(input({ profitability: profit }));
    await act(async () => {
      await api.generate();
    });
    expect(container.textContent).toBe('sum');
    act(() => root.render(<Harness data={input({ profitability: loss })} />));
    expect(container.textContent).toBe('none');
  });

  it('surfaces the free-tier limit and never spins forever', async () => {
    generateJSON.mockRejectedValue(new AIError('Limit reached', 'FREE_TIER_LIMIT', 402));
    mount(input());
    await act(async () => {
      await api.generate();
    });
    expect(api.loading).toBe(false);
    expect(api.error).toEqual({ message: 'Limit reached', limit: true });
  });

  it('recovers from a generic failure', async () => {
    generateJSON.mockRejectedValue(new Error('boom'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mount(input());
    await act(async () => {
      await api.generate();
    });
    expect(api.loading).toBe(false);
    expect(api.error?.limit).toBe(false);
  });
});
