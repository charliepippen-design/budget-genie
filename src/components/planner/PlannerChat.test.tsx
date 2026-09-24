import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ getToken: async () => 'user-token' }),
}));

import { PlannerChat } from '@/components/planner/PlannerChat';
import { useMediaPlanStore } from '@/hooks/use-media-plan-store';

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
    act(() => root.render(<PlannerChat />));
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

    act(() => root.render(<PlannerChat />));
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

  it('shows a sign-in link when the gateway refuses anonymous users', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ error: 'Sign in to use the AI planner.' }), { status: 401 }))));
    act(() => root.render(<PlannerChat />));
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
});
