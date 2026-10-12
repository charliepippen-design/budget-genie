import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import prodState from '@/test/fixtures/prod-chat-state.json';

// Regression: P0 "n is not a function" on /app. Chrome 150 made scrollIntoView return a Promise;
// an expression-bodied useEffect returned it, so React called it as a cleanup on re-run/unmount.

const aiMock = vi.hoisted(() => ({
  callAI: vi.fn(async () => ({ text: 'Split it 40/35/25 across the UK, Germany and Canada.', toolCalls: [], raw: [] })),
}));

vi.mock('@/lib/ai-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai-client')>();
  return { ...actual, useAI: () => aiMock.callAI };
});

import { PlannerChat } from '@/components/planner/PlannerChat';
import { useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { CurrencyProvider } from '@/contexts/CurrencyContext';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const Chat = () => (
  <CurrencyProvider>
    <PlannerChat />
  </CurrencyProvider>
);

let container: HTMLDivElement;
let root: Root;
let mounted = false;

beforeEach(async () => {
  localStorage.clear();
  for (const [key, value] of Object.entries(prodState)) localStorage.setItem(key, JSON.stringify(value));
  await useMediaPlanStore.persist.rehydrate();
  useMediaPlanStore.setState({ isGenieOpen: true });
  // Chrome 150+: scroll APIs return a Promise
  Element.prototype.scrollIntoView = vi.fn(() => Promise.resolve({ interrupted: false })) as unknown as Element['scrollIntoView'];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mounted = false;
});

afterEach(() => {
  if (mounted) act(() => root.unmount());
  container.remove();
});

describe('PlannerChat with Promise-returning scrollIntoView (prod state)', () => {
  it('survives an items change and unmount without "is not a function"', async () => {
    act(() => root.render(<Chat />));
    mounted = true;
    expect(container.textContent).toContain('What CPA and FTD volume');

    const textarea = container.querySelector('textarea')!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
      setter.call(textarea, 'Split my budget across UK, Germany and Canada');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // The AI reply changes items, which re-runs the scroll effect and would call the stored Promise.
    await act(async () => {
      container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await act(async () => {
      await vi.waitFor(() => expect(container.textContent).toContain('Split it 40/35/25'));
    });

    // Navigating away unmounts the chat, which runs the effect cleanups.
    expect(() => {
      act(() => root.unmount());
      mounted = false;
    }).not.toThrow();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });
});
