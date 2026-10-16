/**
 * Cross-tab sync protocol. Each tab has an id and a Lamport-style revision counter:
 * - local changes bump the revision and are broadcast once;
 * - a tab ignores its own messages and anything not newer than what it has already seen
 *   (ties between tabs are broken by tab id so every tab converges on the same state);
 * - applying a remote change never triggers a re-broadcast (no echo loops).
 */
export const SYNC_CHANNEL_NAME = 'media_planner_sync';

export interface SyncMessage<P> {
  type: 'STATE_UPDATE';
  tabId: string;
  revision: number;
  payload: P;
}

export function isSyncMessage(data: unknown): data is SyncMessage<unknown> {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    d.type === 'STATE_UPDATE' &&
    typeof d.tabId === 'string' &&
    typeof d.revision === 'number' &&
    Number.isFinite(d.revision) &&
    !!d.payload &&
    typeof d.payload === 'object'
  );
}

export interface SyncController<P> {
  readonly tabId: string;
  /** Call on every local store change; broadcasts unless the change came from a remote apply. */
  onLocalChange: (payload: P) => void;
  /** Call with every incoming message; returns true when it was applied. */
  onMessage: (data: unknown) => boolean;
  /** Runs `fn` as a remote apply: store changes inside it are not broadcast. */
  applyRemote: (fn: () => void) => void;
}

export function createSyncController<P>(options: {
  tabId: string;
  post: (message: SyncMessage<P>) => void;
  apply: (payload: P) => void;
}): SyncController<P> {
  const { tabId, post, apply } = options;
  let revision = 0;
  // Who wrote the state this tab currently holds, for tie-breaking equal revisions.
  let lastWriter = tabId;
  let applyingRemote = false;

  const applyRemote = (fn: () => void) => {
    applyingRemote = true;
    try {
      fn();
    } finally {
      applyingRemote = false;
    }
  };

  return {
    tabId,
    onLocalChange: (payload) => {
      if (applyingRemote) return;
      revision += 1;
      lastWriter = tabId;
      post({ type: 'STATE_UPDATE', tabId, revision, payload });
    },
    onMessage: (data) => {
      if (!isSyncMessage(data)) return false;
      if (data.tabId === tabId) return false;
      const newer =
        data.revision > revision || (data.revision === revision && data.tabId > lastWriter);
      if (!newer) return false;
      revision = data.revision;
      lastWriter = data.tabId;
      applyRemote(() => apply(data.payload as P));
      return true;
    },
    applyRemote,
  };
}

export function createTabId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
