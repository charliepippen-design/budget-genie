import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ getToken: async () => 'user-token' }),
}));

import { PlannerChat } from '@/components/planner/PlannerChat';
import { useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { usePlannerPromptStore } from '@/store/usePlannerPromptStore';
import { CurrencyProvider } from '@/contexts/CurrencyContext';
import { cleanup, mount, tick } from '@/test/mount';

const Chat = () => (
  <CurrencyProvider>
    <PlannerChat />
  </CurrencyProvider>
);

const ok = (text: string) => new Response(JSON.stringify({ text, toolCalls: [], raw: [] }), { status: 200 });
const userTexts = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.map(([, init]) =>
    (JSON.parse(init.body).messages as { role: string; text?: string }[]).filter((m) => m.role === 'user').map((m) => m.text)
  );
const submit = (text: string) => act(async () => usePlannerPromptStore.getState().submit(text));

beforeEach(() => {
  localStorage.clear();
  usePlannerPromptStore.setState({ queue: [] });
  useMediaPlanStore.setState({ brief: null, planRationale: [], planWarnings: [], isGenieOpen: true });
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(async () => {
  await cleanup();
  vi.unstubAllGlobals();
});

describe('usePlannerPromptStore', () => {
  it('queues trimmed prompts, ignores blank ones and hands them out oldest first', () => {
    const { submit: add, take } = usePlannerPromptStore.getState();
    add('  first  ');
    add('   ');
    add('second');
    expect(usePlannerPromptStore.getState().queue).toEqual(['first', 'second']);
    expect(take()).toBe('first');
    expect(take()).toBe('second');
    expect(take()).toBeNull();
  });
});

describe('PlannerChat as the prompt consumer', () => {
  it('opens the chat and sends a pending prompt once, as a user message', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(ok('Done.')));
    vi.stubGlobal('fetch', fetchMock);
    useMediaPlanStore.setState({ isGenieOpen: false });
    const el = await mount(<Chat />);
    expect(el.querySelector('textarea')).toBeNull(); // closed: only the "Plan with AI" button

    await submit('Move 10% from Display to Search');
    await act(async () => {
      await vi.waitFor(() => expect(el.textContent).toContain('Done.'));
    });
    await tick(20);

    expect(useMediaPlanStore.getState().isGenieOpen).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(userTexts(fetchMock)).toEqual([['Move 10% from Display to Search']]);
    expect(usePlannerPromptStore.getState().queue).toEqual([]);
    const bubbles = [...el.querySelectorAll('div')].filter((d) => d.textContent === 'Move 10% from Display to Search' && !d.children.length);
    expect(bubbles).toHaveLength(1);
  });

  it('sends a prompt that was already waiting when the chat mounts', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(ok('Here you go.')));
    vi.stubGlobal('fetch', fetchMock);
    usePlannerPromptStore.getState().submit('Explain this plan');
    const el = await mount(<Chat />);
    await act(async () => {
      await vi.waitFor(() => expect(el.textContent).toContain('Here you go.'));
    });
    expect(userTexts(fetchMock)).toEqual([['Explain this plan']]);
  });

  it('holds a prompt submitted while the AI is busy and sends it once when the reply lands', async () => {
    let release!: (r: Response) => void;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => (release = resolve)))
      .mockImplementation(() => Promise.resolve(ok('Second answer.')));
    vi.stubGlobal('fetch', fetchMock);
    const el = await mount(<Chat />);

    await submit('first request');
    await act(async () => {
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    });
    expect(el.textContent).toContain('Thinking');

    await submit('second request');
    await tick(20);
    expect(fetchMock).toHaveBeenCalledTimes(1); // still waiting
    expect(usePlannerPromptStore.getState().queue).toEqual(['second request']);
    expect(el.textContent).not.toContain('second request');

    await act(async () => release(ok('First answer.')));
    await act(async () => {
      await vi.waitFor(() => expect(el.textContent).toContain('Second answer.'));
    });
    await tick(20);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(userTexts(fetchMock)).toEqual([['first request'], ['first request', 'second request']]);
    expect(usePlannerPromptStore.getState().queue).toEqual([]);
  });
});
