import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatMoney } from '@/contexts/CurrencyContext';
import { ThemeContext } from '@/contexts/theme-context';
import { computePlanResult, placeholderEngine, responseCurveEngine, setEngine } from '@/engine';
import { formatRange } from '@/lib/plan-ranges';
import { useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { buildSharePayload } from '@/lib/share-link';
import { byText, cleanup, click, mount, tick } from '@/test/mount';

// Charts need a real layout engine; the figures under test are plain text.
vi.mock('recharts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('recharts')>()),
  ResponsiveContainer: () => null,
}));

import SharedPlan from './SharedPlan';

const ID = 'AbCdEfGhIjKlMnOpQrStUv';
const payload = buildSharePayload({ ...useMediaPlanStore.getState(), projectName: 'Q1 launch plan' }, 'GBP');
const snapshot = {
  version: 1,
  id: ID,
  createdAt: '2026-11-12T09:30:00.000Z',
  name: payload.name,
  mediaPlanState: { ...payload.mediaPlanState, onboardingVertical: 'ecommerce' },
  currency: 'GBP',
  vertical: 'ecommerce',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const theme = { theme: 'dark' as const, setTheme: () => undefined, toggleTheme: () => undefined, cycleTheme: () => undefined };
const renderShared = (id = ID) =>
  mount(
    <ThemeContext.Provider value={theme}>
      <MemoryRouter initialEntries={[`/p/${id}`]}>
        <Routes>
          <Route path="/p/:id" element={<SharedPlan />} />
        </Routes>
      </MemoryRouter>
    </ThemeContext.Provider>
  );

describe('SharedPlan', () => {
  beforeEach(() => localStorage.clear());
  afterEach(async () => {
    await cleanup();
    setEngine(placeholderEngine);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders the KPIs and channels computed from the snapshot, signed out', async () => {
    const fetchMock = vi.fn(async () => json(snapshot));
    vi.stubGlobal('fetch', fetchMock);
    const el = await renderShared();
    await tick();

    // Public call: the id in the query, no Authorization header.
    expect(fetchMock.mock.calls).toEqual([[`/api/share?id=${ID}`]]);

    const result = computePlanResult(snapshot.mediaPlanState as typeof payload.mediaPlanState);
    const gbp = (v: number) => formatMoney(v, 'GBP');
    const text = el.textContent ?? '';
    expect(el.querySelector('h1')?.textContent).toBe('Q1 launch plan');
    expect(text).toContain('Prepared 12 November 2026');
    expect(text).toContain('Read-only');

    const tiles = Object.fromEntries(
      [...el.querySelectorAll('section[aria-label="Plan summary"] > div')].map((tile) => [
        tile.children[0].textContent,
        tile.children[1].textContent,
      ])
    );
    expect(tiles).toEqual({
      'Budget / month': gbp(snapshot.mediaPlanState.totalBudget),
      'Projected Revenue': gbp(result.totals.projectedRevenue),
      'Cost per Order': gbp(result.totals.blendedCpa!),
      'Lifetime ROAS': `${result.roas.lifetime.toFixed(2)}x`,
      Orders: Math.round(result.totals.totalConversions).toLocaleString('en-US'),
      'Net / month': gbp(result.economics.netValuePerMonth),
    });

    const active = result.channels.filter((c) => c.isActive !== false && c.metrics.spend > 0);
    expect(active.length).toBeGreaterThan(1);
    const rows = [...el.querySelectorAll('[data-testid="shared-plan-channels"] tbody tr')];
    expect(rows).toHaveLength(active.length);
    active.forEach((channel, i) => {
      const cells = [...rows[i].querySelectorAll('td')].map((td) => td.textContent);
      expect(rows[i].querySelector('th')?.textContent).toContain(channel.name);
      expect(cells).toEqual([
        `${result.channelInsights[channel.id].spendSharePct.toFixed(1)}%`,
        gbp(channel.metrics.spend),
        Math.round(channel.metrics.conversions).toLocaleString('en-US'),
        `${channel.metrics.roas.toFixed(2)}x`,
      ]);
    });

    expect(text).toContain('12-month projection');
    for (const scenario of ['Bear', 'Base', 'Bull']) expect(byText(el, 'p', scenario)).not.toBeNull();
    expect(text).toContain('Figures are estimates from a planning model, not guarantees.');
    const made = byText(el, 'a', 'MediaPlanner Pro') as HTMLAnchorElement;
    expect(made.getAttribute('href')).toBe('/');
    expect(Helmet.peek().metaTags).toContainEqual({ name: 'robots', content: 'noindex' });
    // The standard engine gives point estimates: no range under any figure.
    expect(el.querySelectorAll('[data-testid="range-line"]')).toHaveLength(0);
  });

  it('shows the likely range under the headline figures when the engine gives ranges', async () => {
    setEngine(responseCurveEngine);
    vi.stubGlobal('fetch', vi.fn(async () => json(snapshot)));
    const el = await renderShared();
    await tick();

    const { ranges } = computePlanResult(snapshot.mediaPlanState as typeof payload.mediaPlanState);
    const gbp = (v: number) => formatMoney(v, 'GBP');
    const lines = Object.fromEntries(
      [...el.querySelectorAll('section[aria-label="Plan summary"] > div')].map((tile) => [
        tile.children[0].textContent,
        tile.querySelector('[data-testid="range-line"]')?.textContent ?? null,
      ])
    );
    expect(lines).toEqual({
      'Budget / month': null,
      'Projected Revenue': formatRange(ranges!.totals.revenue, gbp),
      'Cost per Order': formatRange(ranges!.totals.costPerConversion!, gbp),
      'Lifetime ROAS': formatRange(ranges!.totals.roas, (v) => `${v.toFixed(2)}x`),
      Orders: formatRange(ranges!.totals.conversions, (v) => Math.round(v).toLocaleString('en-US')),
      'Net / month': null,
    });
  });

  it('writes nothing to localStorage and leaves the visitor own plan untouched', async () => {
    const before = useMediaPlanStore.getState();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem');
    vi.stubGlobal('fetch', vi.fn(async () => json({ ...snapshot, mediaPlanState: { ...snapshot.mediaPlanState, totalBudget: 123456 } })));
    const el = await renderShared();
    await tick();

    expect(el.textContent).toContain(formatMoney(123456, 'GBP'));
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(useMediaPlanStore.getState()).toBe(before);
  });

  it('shows a loading skeleton, then "not found" for a link that does not exist', async () => {
    let answer: (res: Response) => void = () => undefined;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => (answer = resolve))));
    const el = await renderShared();
    expect(el.querySelector('[data-testid="shared-plan-loading"]')).not.toBeNull();

    answer(json({ error: 'This shared plan does not exist or was removed.' }, 404));
    await tick();
    expect(el.textContent).toContain('This shared plan does not exist or was removed.');
    expect(el.querySelector('[data-testid="shared-plan"]')).toBeNull();
    expect(Helmet.peek().metaTags).toContainEqual({ name: 'robots', content: 'noindex' });
  });

  it('treats a malformed id as not found without calling the API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const el = await renderShared('nope');
    await tick();
    expect(el.textContent).toContain('This shared plan does not exist or was removed.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows an error with Retry when loading fails, and recovers', async () => {
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(json({ error: 'boom' }, 502))
      .mockResolvedValue(json(snapshot));
    vi.stubGlobal('fetch', fetchMock);
    const el = await renderShared();
    await tick();
    expect(el.textContent).toContain('This plan could not be loaded');

    await click(byText(el, 'button', 'Retry'));
    await tick();
    expect(el.textContent).toContain('This plan could not be loaded');

    await click(byText(el, 'button', 'Retry'));
    await tick();
    expect(el.querySelector('h1')?.textContent).toBe('Q1 launch plan');
  });

  it('shows the error state, not a blank page, for a snapshot it cannot compute', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ ...snapshot, mediaPlanState: { ...snapshot.mediaPlanState, channels: [null, 7] } })));
    const el = await renderShared();
    await tick();
    expect(el.textContent).toContain('This plan could not be loaded');
  });
});
