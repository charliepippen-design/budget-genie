import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ getToken: async () => 'user-token' }),
}));

import { PlannerChat, ToolCard } from '@/components/planner/PlannerChat';
import { useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { CurrencyProvider } from '@/contexts/CurrencyContext';

const Chat = () => (
  <CurrencyProvider>
    <PlannerChat />
  </CurrencyProvider>
);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const reply = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

beforeEach(() => {
  localStorage.clear();
  useMediaPlanStore.setState({ brief: null, planRationale: [], planWarnings: [], isGenieOpen: true });
  Element.prototype.scrollIntoView = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('PlannerChat', () => {
  it('quick-start builds a plan without AI', () => {
    act(() => root.render(<Chat />));
    const chip = [...container.querySelectorAll('button')].find((b) => b.textContent === 'B2B SaaS')!;
    act(() => chip.click());

    const state = useMediaPlanStore.getState();
    expect(state.brief?.industry).toBe('saas');
    expect(state.channels.every((c) => c.id.startsWith('saas-'))).toBe(true);
    expect(container.textContent).toContain('starting plan for');
  });

  it('runs the tool loop: AI fills the brief, engine rebuilds, AI explains', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() =>
        reply({
          text: '',
          toolCalls: [{ id: 'c1', name: 'update_brief', args: { industry: 'forex', monthlyBudget: 40000, markets: ['DE'] } }],
          raw: [{ functionCall: { id: 'c1', name: 'update_brief', args: {} } }],
        })
      )
      .mockImplementationOnce(() => reply({ text: 'Plan ready: affiliates lead the mix.', toolCalls: [], raw: [] }));
    vi.stubGlobal('fetch', fetchMock);

    act(() => root.render(<Chat />));
    const textarea = container.querySelector('textarea')!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
      setter.call(textarea, 'Forex broker, 40k/month, Germany');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await act(async () => {
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    });

    expect(useMediaPlanStore.getState().brief?.industry).toBe('forex');
    expect(useMediaPlanStore.getState().activeGeos).toEqual(['Germany']);
    expect(container.textContent).toContain('Plan ready: affiliates lead the mix.');
    expect(container.textContent).toContain('Plan rebuilt');

    // Second request carries the tool result back to the model, with the call id and user token
    const [, init] = fetchMock.mock.calls[1];
    const body = JSON.parse(init.body);
    expect(init.headers.Authorization).toBe('Bearer user-token');
    expect(body.messages.at(-1)).toMatchObject({ role: 'tool', results: [{ id: 'c1', name: 'update_brief' }] });
  });

  const typeAndSend = async (text: string) => {
    const textarea = container.querySelector('textarea')!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
      setter.call(textarea, text);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
  };
  const retryButton = () => [...container.querySelectorAll('button')].find((b) => b.textContent === 'Retry');

  it('shows a specific busy message with the wait and a Retry that resends the last message', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: 'raw server text', code: 'AI_BUSY' }), { status: 503, headers: { 'Retry-After': '30' } })
        )
      )
      .mockImplementationOnce(() => reply({ text: 'Back again.', toolCalls: [], raw: [] }));
    vi.stubGlobal('fetch', fetchMock);
    act(() => root.render(<Chat />));
    await typeAndSend('plan for a shop');
    await act(async () => {
      await vi.waitFor(() => expect(retryButton()).toBeDefined());
    });
    expect(container.textContent).toContain('The AI is busy, try again in 30 seconds.');
    expect(container.textContent).not.toContain('raw server text');

    await act(async () => {
      retryButton()!.click();
    });
    await act(async () => {
      await vi.waitFor(() => expect(container.textContent).toContain('Back again.'));
    });
    const bodies = fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body));
    expect(bodies[1].messages).toEqual(bodies[0].messages); // same single user message, not duplicated
    expect(container.textContent).not.toContain('The AI is busy');
    expect(retryButton()).toBeUndefined();
  });

  it('does not offer Retry for the free-tier limit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({ error: 'Limit reached', code: 'FREE_TIER_LIMIT' }), { status: 402 })))
    );
    act(() => root.render(<Chat />));
    await typeAndSend('hello');
    await act(async () => {
      await vi.waitFor(() => expect(container.querySelector('a[href="/pricing"]')).not.toBeNull());
    });
    expect(retryButton()).toBeUndefined();
  });

  it('shows the Italian disclosure and sends uiLang only for Italian browsers', async () => {
    const lang = vi.spyOn(navigator, 'language', 'get');
    lang.mockReturnValue('en-US');
    act(() => root.render(<Chat />));
    expect(container.querySelector('[lang="it"]')).toBeNull();
    act(() => root.unmount());

    lang.mockReturnValue('it-IT');
    root = createRoot(container);
    const fetchMock = vi.fn(() => reply({ text: 'ok', toolCalls: [], raw: [] }));
    vi.stubGlobal('fetch', fetchMock);
    act(() => root.render(<Chat />));
    expect(container.querySelector('[lang="it"]')).not.toBeNull();
    await typeAndSend('ciao');
    await act(async () => {
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    });
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body).uiLang).toBe('it');
    lang.mockRestore();
  });

  it('shows a sign-in link when the gateway refuses anonymous users', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ error: 'Sign in to use the AI planner.' }), { status: 401 }))));
    act(() => root.render(<Chat />));
    const textarea = container.querySelector('textarea')!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
      setter.call(textarea, 'hello');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await act(async () => {
      await vi.waitFor(() => expect(container.querySelector('a[href="/auth"]')).not.toBeNull());
    });
  });

  describe('Plan rebuilt card totals', () => {
    // Seed d2-001 message, sent as the user turn that triggers the rebuild
    const seedMessage = 'Aumenta il budget mensile a 50k';
    const ch = (id: string, name: string, sharePct: number, active = true, budget = 20000) => ({
      id, name, model: 'CPA', spend: Math.round((sharePct / 100) * budget), sharePct, conversions: 1, cpa: 1, roas: 1, locked: false, active,
    });
    const renderCard = (plan: unknown) =>
      act(() =>
        root.render(
          <CurrencyProvider>
            <ToolCard name="update_brief" response={{ ok: true, plan }} />
          </CurrencyProvider>
        )
      );
    const totalRow = () => [...container.querySelectorAll('div')].find((d) => d.firstElementChild?.textContent === 'Total')!;

    it('lists all 6 active channels and a Total of 100% (regression: top 5 showed 90.7%)', () => {
      const channels = [
        ch('a', 'Affiliates - CPA', 29.4),
        ch('b', 'Google Search (Licensed)', 21.5),
        ch('c', 'Affiliates - Hybrid (CPA + RevShare)', 15.2),
        ch('d', 'SEO - Content & Links', 12.4),
        ch('e', 'Meta Ads (Licensed)', 12.2),
        ch('f', 'Native Ads', 9.3),
      ];
      renderCard({ totalBudget: 20000, channels, blended: { spend: 20000, costPerConversion: 10 } });
      expect(seedMessage).toContain('budget');
      for (const c of channels) expect(container.textContent).toContain(c.name);
      expect(totalRow().textContent).toContain('100%');
      expect(totalRow().textContent).toMatch(/20[,.\s]?000/);
    });

    it('excludes inactive and zero-spend channels from list and total', () => {
      const channels = [
        ch('a', 'Affiliates - CPA', 60),
        ch('b', 'Google Search (Licensed)', 40),
        ch('c', 'Inactive Channel', 25, false),
        ch('d', 'Zero Spend Channel', 0),
      ];
      renderCard({ totalBudget: 20000, channels, blended: { spend: 20000, costPerConversion: 10 } });
      expect(container.textContent).not.toContain('Inactive Channel');
      expect(container.textContent).not.toContain('Zero Spend Channel');
      expect(totalRow().textContent).toContain('100%');
    });
  });
});
