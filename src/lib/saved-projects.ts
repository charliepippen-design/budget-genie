import { z } from 'zod';

export const SAVED_PROJECTS_KEY = 'igaming_projects';
export const SAVED_PROJECTS_BACKUP_KEY = 'igaming_projects_backup';

export interface SavedProject {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  mediaPlanState: Record<string, unknown>;
  multiMonthState: Record<string, unknown>;
}

export interface LoadResult {
  projects: SavedProject[];
  /** Plain-English message to show the user when something was wrong with the stored data. */
  notice?: string;
  /** True when damaged data could not be backed up, so saving would risk losing it. */
  unsafeToSave: boolean;
}

export type WriteResult = { ok: true } | { ok: false; reason: 'quota' | 'blocked' };

const PlainObject = z.record(z.string(), z.unknown());
const UuidSchema = z.string().uuid();

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Validate one raw entry and migrate older shapes. Returns null if it cannot be
 * recovered (no usable plan state). A missing/odd id gets a fresh one; a missing
 * name or date gets a sensible default.
 */
export function normalizeProject(
  raw: unknown,
  now = new Date().toISOString()
): SavedProject | null {
  if (!isPlainObject(raw)) return null;
  const plan = PlainObject.safeParse(raw.mediaPlanState);
  if (!plan.success) return null;
  const multi = PlainObject.safeParse(raw.multiMonthState);
  const updatedAt = typeof raw.updatedAt === 'string' && raw.updatedAt ? raw.updatedAt : now;
  return {
    id: UuidSchema.safeParse(raw.id).success ? (raw.id as string) : crypto.randomUUID(),
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : 'Untitled project',
    createdAt: typeof raw.createdAt === 'string' && raw.createdAt ? raw.createdAt : updatedAt,
    updatedAt,
    mediaPlanState: plan.data,
    multiMonthState: multi.success ? multi.data : {},
  };
}

function hasBackupOf(storage: Storage, raw: string): boolean {
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(SAVED_PROJECTS_BACKUP_KEY) && storage.getItem(key) === raw) return true;
  }
  return false;
}

/** Copy the raw value to a separate key. Never overwrites an existing backup. */
function backUpRaw(storage: Storage, raw: string): boolean {
  try {
    if (hasBackupOf(storage, raw)) return true;
    const key =
      storage.getItem(SAVED_PROJECTS_BACKUP_KEY) === null
        ? SAVED_PROJECTS_BACKUP_KEY
        : `${SAVED_PROJECTS_BACKUP_KEY}_${Date.now()}`;
    storage.setItem(key, raw);
    return true;
  } catch {
    return false;
  }
}

export function loadSavedProjects(storage: Storage = localStorage): LoadResult {
  let raw: string | null;
  try {
    raw = storage.getItem(SAVED_PROJECTS_KEY);
  } catch {
    return {
      projects: [],
      notice: 'Browser storage is blocked, so saved projects cannot be read.',
      unsafeToSave: true,
    };
  }
  if (!raw) return { projects: [], unsafeToSave: false };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = undefined;
  }

  if (!Array.isArray(parsed)) {
    const backedUp = backUpRaw(storage, raw);
    return {
      projects: [],
      unsafeToSave: !backedUp,
      notice: backedUp
        ? 'Your saved projects could not be read. A copy of the damaged data was kept in this browser.'
        : 'Your saved projects could not be read, and a backup copy could not be made. Saving is turned off so nothing is overwritten.',
    };
  }

  let dropped = 0;
  const seen = new Set<string>();
  const projects: SavedProject[] = [];
  for (const entry of parsed) {
    const p = normalizeProject(entry);
    // Invalid entries and repeated ids are dropped; everything else is kept.
    if (!p || seen.has(p.id)) dropped++;
    else {
      seen.add(p.id);
      projects.push(p);
    }
  }

  if (dropped === 0) return { projects, unsafeToSave: false };

  const backedUp = backUpRaw(storage, raw);
  return {
    projects,
    unsafeToSave: !backedUp,
    notice:
      `${dropped} saved project${dropped === 1 ? ' was' : 's were'} damaged and skipped. ` +
      (backedUp
        ? 'A copy of the original data was kept in this browser.'
        : 'A backup copy could not be made, so saving is turned off.'),
  };
}

/** Write to storage. Callers must only update UI state when this returns ok. */
export function writeSavedProjects(
  list: SavedProject[],
  storage: Storage = localStorage
): WriteResult {
  try {
    storage.setItem(SAVED_PROJECTS_KEY, JSON.stringify(list));
    return { ok: true };
  } catch (e) {
    const quota =
      e instanceof DOMException &&
      (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    return { ok: false, reason: quota ? 'quota' : 'blocked' };
  }
}

export function writeErrorMessage(reason: 'quota' | 'blocked'): string {
  return reason === 'quota'
    ? 'Could not save: browser storage is full. Delete a project or export your projects first. Nothing was changed.'
    : 'Could not save: browser storage is blocked. Nothing was changed.';
}

/** Account/access fields come from the signed-in user, never from a saved project. */
const ACCOUNT_FIELDS = ['subscriptionTier', 'userStatus'];
const UNSAFE_KEYS = ['__proto__', 'constructor', 'prototype'];

/** Validate a project before it is applied to the stores. */
export function prepareProjectForLoad(
  project: unknown
):
  | { ok: true; mediaPlanState: Record<string, unknown>; multiMonthState: Record<string, unknown> }
  | { ok: false } {
  const p = normalizeProject(project);
  if (!p || Object.keys(p.mediaPlanState).length === 0) return { ok: false };
  const mediaPlanState = { ...p.mediaPlanState };
  const multiMonthState = { ...p.multiMonthState };
  for (const k of ACCOUNT_FIELDS) delete mediaPlanState[k];
  for (const k of UNSAFE_KEYS) {
    delete mediaPlanState[k];
    delete multiMonthState[k];
  }
  return { ok: true, mediaPlanState, multiMonthState };
}

export function exportProjectsJson(list: SavedProject[]): string {
  return JSON.stringify({ app: 'mediaplanner-projects', version: 1, projects: list }, null, 2);
}

export interface ImportResult {
  incoming: SavedProject[];
  skipped: number;
}

/** Returns null when the text is not a projects file at all. */
export function parseProjectsImport(text: string): ImportResult | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const entries = Array.isArray(parsed)
    ? parsed
    : isPlainObject(parsed) && Array.isArray(parsed.projects)
      ? parsed.projects
      : null;
  if (!entries) return null;
  const incoming: SavedProject[] = [];
  let skipped = 0;
  for (const e of entries) {
    const p = normalizeProject(e);
    if (p) incoming.push(p);
    else skipped++;
  }
  return { incoming, skipped };
}

/** Merge imported projects into existing ones. Existing ids win, so nothing is duplicated or replaced. */
export function mergeProjects(
  existing: SavedProject[],
  incoming: SavedProject[]
): { merged: SavedProject[]; added: number; duplicates: number } {
  const ids = new Set(existing.map((p) => p.id));
  const fresh: SavedProject[] = [];
  for (const p of incoming) {
    if (ids.has(p.id)) continue;
    ids.add(p.id);
    fresh.push(p);
  }
  return {
    merged: [...fresh, ...existing],
    added: fresh.length,
    duplicates: incoming.length - fresh.length,
  };
}
