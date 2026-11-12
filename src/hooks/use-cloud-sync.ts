import { create } from 'zustand';
import {
  CloudError,
  fetchCloudProjects,
  loadTombstones,
  mergeProjectDocs,
  pushCloudProjects,
  sameProjectsDoc,
  writeTombstones,
} from '@/lib/cloud-projects';
import { loadSavedProjects, writeSavedProjects } from '@/lib/saved-projects';

// Keeps the saved projects of this browser and of the signed-in account in step.
// localStorage stays what the UI reads, so everything keeps working offline or when the cloud
// is down; "synced" is only ever shown after the server answered 2xx.

export type CloudSyncStatus = 'signed-out' | 'syncing' | 'saving' | 'synced' | 'unavailable';

interface CloudSyncState {
  /** Clerk user id, set by CloudSyncBridge; null when signed out. */
  userId: string | null;
  status: CloudSyncStatus;
  lastSyncedAt: number | null;
  /** The server's reason when it refused the projects (too many, too large); null otherwise. */
  detail: string | null;
  /** Goes up when a sync changed the projects stored in this browser, so open lists re-read them. */
  localRevision: number;
}

const INITIAL: CloudSyncState = {
  userId: null,
  status: 'signed-out',
  lastSyncedAt: null,
  detail: null,
  localRevision: 0,
};

export const useCloudSyncStore = create<CloudSyncState>(() => INITIAL);

const PUSH_DELAY_MS = 800;
const MAX_CONFLICT_RETRIES = 2;

let running: Promise<void> | null = null;
let queued = false;
let timer: ReturnType<typeof setTimeout> | null = null;

async function syncOnce(userId: string, attempt = 0): Promise<void> {
  const { setState, getState } = useCloudSyncStore;
  try {
    const remote = await fetchCloudProjects();
    if (getState().userId !== userId) return;

    // Read storage after the network call: the user may have saved while it was in flight.
    const stored = loadSavedProjects();
    if (stored.unsafeToSave) throw new CloudError(0, '');
    const local = { projects: stored.projects, deleted: loadTombstones() };
    const merged = mergeProjectDocs(local, remote);

    if (!sameProjectsDoc(merged, local)) {
      if (!writeSavedProjects(merged.projects).ok) throw new CloudError(0, '');
      writeTombstones(merged.deleted);
      setState((s) => ({ localRevision: s.localRevision + 1 }));
    }
    if (!sameProjectsDoc(merged, remote)) await pushCloudProjects(merged, remote.etag);
    if (getState().userId !== userId) return;
    setState({ status: 'synced', lastSyncedAt: Date.now(), detail: null });
  } catch (e) {
    const status = e instanceof CloudError ? e.status : 0;
    // Another device wrote between our read and our write: merge with its version and try again.
    if (status === 409 && attempt < MAX_CONFLICT_RETRIES) return syncOnce(userId, attempt + 1);
    if (getState().userId !== userId) return;
    setState({
      status: 'unavailable',
      detail: (status === 400 || status === 413) && e instanceof Error && e.message ? e.message : null,
    });
  }
}

/** Fetch the cloud copy, merge it with this browser's projects, store and upload what changed. */
export function syncProjects(pendingStatus: 'syncing' | 'saving' = 'syncing'): Promise<void> {
  const userId = useCloudSyncStore.getState().userId;
  if (!userId) return Promise.resolve();
  if (timer) clearTimeout(timer);
  timer = null;
  if (running) {
    queued = true;
    return running;
  }
  useCloudSyncStore.setState({ status: pendingStatus });
  running = (async () => {
    do {
      queued = false;
      await syncOnce(userId);
    } while (queued && useCloudSyncStore.getState().userId === userId);
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Call after every local save, overwrite, delete or import: uploads shortly after (debounced). */
export function scheduleProjectsSync(): void {
  if (!useCloudSyncStore.getState().userId) return;
  useCloudSyncStore.setState({ status: 'saving' });
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void syncProjects('saving'), PUSH_DELAY_MS);
}

/** Called by CloudSyncBridge when the signed-in user changes. Signing in starts a sync. */
export function setCloudSyncUser(userId: string | null): void {
  if (useCloudSyncStore.getState().userId === userId) return;
  if (timer) clearTimeout(timer);
  timer = null;
  useCloudSyncStore.setState({
    userId,
    status: userId ? 'syncing' : 'signed-out',
    lastSyncedAt: null,
    detail: null,
  });
  if (userId) void syncProjects();
}

const ago = (since: number, now: number) => {
  const minutes = Math.floor((now - since) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  return new Date(since).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
};

/** The one-line, honest description of where the projects are stored right now. */
export function cloudSyncLabel(
  state: Pick<CloudSyncState, 'status' | 'lastSyncedAt' | 'detail'>,
  now = Date.now()
): string {
  switch (state.status) {
    case 'signed-out':
      return 'Sign in to sync across devices';
    case 'syncing':
      return 'Syncing…';
    case 'saving':
      return 'Saving…';
    case 'synced':
      return `Synced to your account · ${ago(state.lastSyncedAt ?? now, now)}`;
    case 'unavailable':
      return state.detail
        ? `Saved in this browser only: ${state.detail}`
        : 'Saved in this browser only: cloud save is unavailable right now';
  }
}

export function useCloudSync() {
  const status = useCloudSyncStore((s) => s.status);
  const lastSyncedAt = useCloudSyncStore((s) => s.lastSyncedAt);
  const detail = useCloudSyncStore((s) => s.detail);
  const localRevision = useCloudSyncStore((s) => s.localRevision);
  return { status, lastSyncedAt, detail, localRevision, label: cloudSyncLabel({ status, lastSyncedAt, detail }) };
}

/** Test helper: back to the signed-out state with nothing pending. */
export function resetCloudSync(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  queued = false;
  useCloudSyncStore.setState(INITIAL);
}
