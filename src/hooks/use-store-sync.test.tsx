import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: null } }) },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }), unsubscribe: () => {} }),
  },
}));

import { useMediaPlanStore } from './use-media-plan-store';
import { useStoreSync } from './use-store-sync';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** In-memory BroadcastChannel: records what this tab posts and lets the test deliver messages. */
class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = [];
  posted: unknown[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  constructor(public name: string) {
    FakeBroadcastChannel.instances.push(this);
  }
  postMessage(data: unknown) {
    this.posted.push(JSON.parse(JSON.stringify(data)));
  }
  close() {}
  deliver(data: unknown) {
    this.onmessage?.({ data });
  }
}

function Harness() {
  useStoreSync();
  return null;
}

let root: Root;
let channel: FakeBroadcastChannel;
const addListener = vi.spyOn(window, 'addEventListener');

beforeEach(() => {
  FakeBroadcastChannel.instances = [];
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
  addListener.mockClear();
  useMediaPlanStore.setState({ totalBudget: 50000 });
  root = createRoot(document.createElement('div'));
  act(() => root.render(<Harness />));
  channel = FakeBroadcastChannel.instances[0];
});

afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});

type Msg = { type: string; tabId: string; revision: number; payload: { totalBudget: number } };

describe('useStoreSync (RT-7)', () => {
  it('broadcasts a local change once, tagged with this tab id and a revision', () => {
    act(() => useMediaPlanStore.getState().setTotalBudget(60000));
    expect(channel.posted).toHaveLength(1);
    const msg = channel.posted[0] as Msg;
    expect(msg.type).toBe('STATE_UPDATE');
    expect(typeof msg.tabId).toBe('string');
    expect(msg.revision).toBeGreaterThan(0);
    expect(msg.payload.totalBudget).toBe(60000);
  });

  it('applies a remote change without re-broadcasting it (no echo)', () => {
    act(() =>
      channel.deliver({ type: 'STATE_UPDATE', tabId: 'other-tab', revision: 1, payload: { totalBudget: 70000 } })
    );
    expect(useMediaPlanStore.getState().totalBudget).toBe(70000);
    expect(channel.posted).toHaveLength(0);
  });

  it('ignores its own messages and messages older than what it has seen', () => {
    act(() => useMediaPlanStore.getState().setTotalBudget(61000));
    const own = channel.posted[0] as Msg;
    act(() => channel.deliver({ ...own, payload: { totalBudget: 1234 } }));
    expect(useMediaPlanStore.getState().totalBudget).toBe(61000);

    act(() =>
      channel.deliver({ type: 'STATE_UPDATE', tabId: 'other-tab', revision: 10, payload: { totalBudget: 80000 } })
    );
    act(() =>
      channel.deliver({ type: 'STATE_UPDATE', tabId: 'other-tab', revision: 9, payload: { totalBudget: 5000 } })
    );
    expect(useMediaPlanStore.getState().totalBudget).toBe(80000);
  });

  it('does not listen to the dead "media-plan-storage" key', () => {
    expect(addListener.mock.calls.some(([type]) => type === 'storage')).toBe(false);
  });
});
