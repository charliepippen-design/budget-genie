import { getAuthToken } from '@/lib/ai-client';
import { normalizeProject, type SavedProject } from '@/lib/saved-projects';

// Browser side of api/projects.ts: the signed-in user's saved projects as one cloud document.
// localStorage stays the copy the UI reads; this module only merges and transports.

/** A deleted project. Kept for a while so other devices delete it too instead of re-uploading it. */
export interface Tombstone {
  id: string;
  deletedAt: string;
}

export interface ProjectsDoc {
  projects: SavedProject[];
  deleted: Tombstone[];
}

export const DELETED_PROJECTS_KEY = 'igaming_projects_deleted';
export const TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

const time = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
};

/**
 * Merge this browser's projects with the cloud copy. By id: the newest `updatedAt` wins (the
 * cloud copy on a tie, so every device settles on the same version); a tombstone at least as
 * new as a project removes it; tombstones older than 90 days are dropped. Pure and idempotent.
 */
export function mergeProjectDocs(local: ProjectsDoc, remote: ProjectsDoc, now = Date.now()): ProjectsDoc {
  const tombstones = new Map<string, Tombstone>();
  for (const t of [...remote.deleted, ...local.deleted]) {
    if (now - time(t.deletedAt) > TOMBSTONE_TTL_MS) continue;
    const seen = tombstones.get(t.id);
    if (!seen || time(t.deletedAt) > time(seen.deletedAt)) tombstones.set(t.id, t);
  }

  const byId = new Map<string, SavedProject>();
  for (const p of [...remote.projects, ...local.projects]) {
    const seen = byId.get(p.id);
    if (!seen || time(p.updatedAt) > time(seen.updatedAt)) byId.set(p.id, p);
  }

  const projects = [...byId.values()]
    .filter((p) => {
      const t = tombstones.get(p.id);
      return !t || time(t.deletedAt) < time(p.updatedAt);
    })
    .sort((a, b) => time(b.updatedAt) - time(a.updatedAt) || a.id.localeCompare(b.id));
  const deleted = [...tombstones.values()].sort((a, b) => a.id.localeCompare(b.id));
  return { projects, deleted };
}

/** Same projects (content included) and tombstones, whatever their order. */
export function sameProjectsDoc(a: ProjectsDoc, b: ProjectsDoc): boolean {
  const key = (doc: ProjectsDoc) =>
    JSON.stringify([
      doc.projects.map((p) => JSON.stringify(p)).sort(),
      doc.deleted.map((t) => `${t.id}@${t.deletedAt}`).sort(),
    ]);
  return key(a) === key(b);
}

export function loadTombstones(storage: Storage = localStorage): Tombstone[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(DELETED_PROJECTS_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is Tombstone => !!t && typeof t.id === 'string' && typeof t.deletedAt === 'string'
    );
  } catch {
    return [];
  }
}

export function writeTombstones(list: Tombstone[], storage: Storage = localStorage): void {
  try {
    storage.setItem(DELETED_PROJECTS_KEY, JSON.stringify(list));
  } catch {
    // Storage full or blocked: the delete still happened here; other devices may keep the project.
  }
}

/** Remember a deletion so the next sync removes the project from the cloud as well. */
export function recordDeletion(id: string, storage: Storage = localStorage, now = new Date()): void {
  const rest = loadTombstones(storage).filter((t) => t.id !== id);
  writeTombstones([...rest, { id, deletedAt: now.toISOString() }], storage);
}

/** A failed cloud call. `status` 0 means the request never got an answer (offline, blocked). */
export class CloudError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = 'CloudError';
  }
}

export interface CloudProjects extends ProjectsDoc {
  /** Version of the stored document, sent back on the next write; null when nothing is stored yet. */
  etag: string | null;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

async function call(method: 'GET' | 'PUT', body?: string, etag?: string | null): Promise<Record<string, unknown>> {
  const token = await getAuthToken();
  if (!token) throw new CloudError(401, 'Sign in to sync your projects.');
  let res: Response;
  try {
    res = await fetch('/api/projects', {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(etag ? { 'If-Match': etag } : {}),
      },
      body,
    });
  } catch {
    throw new CloudError(0, 'Cloud save is unavailable right now.');
  }
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message = isRecord(data) && typeof data.error === 'string' ? data.error : '';
    throw new CloudError(res.status, message || 'Cloud save is unavailable right now.');
  }
  // A 2xx that is not our JSON (e.g. an HTML fallback page) is not a successful sync.
  if (!isRecord(data)) throw new CloudError(502, 'Cloud save is unavailable right now.');
  return data;
}

export async function fetchCloudProjects(): Promise<CloudProjects> {
  const data = await call('GET');
  if (!Array.isArray(data.projects) || !Array.isArray(data.deleted)) {
    throw new CloudError(502, 'Cloud save is unavailable right now.');
  }
  return {
    projects: data.projects.flatMap((raw) => normalizeProject(raw) ?? []),
    deleted: data.deleted.filter(
      (t): t is Tombstone => isRecord(t) && typeof t.id === 'string' && typeof t.deletedAt === 'string'
    ),
    etag: typeof data.etag === 'string' ? data.etag : null,
  };
}

/** Replaces the cloud document. Resolves only on a 2xx; a 409 means another device wrote first. */
export async function pushCloudProjects(doc: ProjectsDoc, etag: string | null): Promise<{ etag: string | null }> {
  const data = await call('PUT', JSON.stringify({ projects: doc.projects, deleted: doc.deleted }), etag);
  if (data.ok !== true) throw new CloudError(502, 'Cloud save is unavailable right now.');
  return { etag: typeof data.etag === 'string' ? data.etag : null };
}
