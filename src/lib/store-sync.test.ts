import { describe, expect, it } from 'vitest';
import { createSyncController, isSyncMessage, type SyncMessage } from './store-sync';

type Payload = { value: number };

/** Two or more tabs on one in-memory channel; each tab's "store" is a plain variable. */
function tabs(ids: string[]) {
  const state: Record<string, number> = {};
  const outbox: SyncMessage<Payload>[] = [];
  const controllers = Object.fromEntries(
    ids.map((id) => {
      state[id] = 0;
      const c = createSyncController<Payload>({
        tabId: id,
        post: (m) => outbox.push(m),
        // Mirrors zustand: setState fires the subscription synchronously.
        apply: (p) => {
          state[id] = p.value;
          c.onLocalChange(p);
        },
      });
      return [id, c];
    })
  );
  const flush = () => {
    while (outbox.length) {
      const m = outbox.shift()!;
      ids.forEach((id) => controllers[id].onMessage(m));
    }
  };
  const edit = (id: string, value: number) => {
    state[id] = value;
    controllers[id].onLocalChange({ value });
  };
  return { state, outbox, controllers, flush, edit };
}

describe('store sync protocol (RT-7)', () => {
  it('a remote apply is not re-broadcast', () => {
    const t = tabs(['a', 'b']);
    t.edit('a', 5);
    expect(t.outbox).toHaveLength(1);
    t.controllers.b.onMessage(t.outbox.shift());
    expect(t.state.b).toBe(5);
    expect(t.outbox).toHaveLength(0);
  });

  it('ignores own and stale messages', () => {
    const t = tabs(['a', 'b']);
    t.edit('a', 1);
    const first = t.outbox.shift()!;
    expect(t.controllers.a.onMessage(first)).toBe(false);
    t.edit('a', 2);
    const second = t.outbox.shift()!;
    expect(t.controllers.b.onMessage(second)).toBe(true);
    expect(t.controllers.b.onMessage(first)).toBe(false);
    expect(t.state.b).toBe(2);
  });

  it('concurrent edits converge on the same value in every tab', () => {
    const t = tabs(['a', 'b', 'c']);
    t.edit('a', 10);
    t.edit('b', 20);
    t.flush();
    expect(new Set(Object.values(t.state)).size).toBe(1);
  });

  it('rejects malformed messages', () => {
    expect(isSyncMessage({ type: 'STATE_UPDATE', payload: {} })).toBe(false);
    expect(isSyncMessage(null)).toBe(false);
    expect(isSyncMessage({ type: 'STATE_UPDATE', tabId: 'x', revision: 1, payload: {} })).toBe(true);
  });
});
