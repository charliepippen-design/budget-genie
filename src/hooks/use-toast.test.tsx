// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOAST_DEFAULT_DURATION, toast, useToast } from './use-toast';
import { cleanup, mount } from '@/test/mount';

function Probe() {
  const { toasts } = useToast();
  return <p>{toasts.map((t) => `${String(t.title)}:${t.open ? 'open' : 'closed'}`).join('|')}</p>;
}

const advance = (ms: number) => act(async () => void vi.advanceTimersByTime(ms));

describe('toast auto-dismiss', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(async () => {
    await advance(60_000);
    await cleanup();
    vi.useRealTimers();
  });

  it('closes on its own after the default duration, then leaves the list', async () => {
    const el = await mount(<Probe />);
    await act(async () => void toast({ title: 'Channel Deleted' }));
    expect(el.textContent).toBe('Channel Deleted:open');

    await advance(TOAST_DEFAULT_DURATION - 1);
    expect(el.textContent).toBe('Channel Deleted:open');
    await advance(1);
    expect(el.textContent).toBe('Channel Deleted:closed');
    await advance(1000);
    expect(el.textContent).toBe('');
  });

  it('honours a shorter duration passed by the caller', async () => {
    const el = await mount(<Probe />);
    await act(async () => void toast({ title: 'Undo', duration: 900 }));
    await advance(900);
    expect(el.textContent).toBe('Undo:closed');
  });
});
