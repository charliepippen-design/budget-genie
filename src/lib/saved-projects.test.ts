import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadSavedProjects,
  writeSavedProjects,
  prepareProjectForLoad,
  exportProjectsJson,
  parseProjectsImport,
  mergeProjects,
  SAVED_PROJECTS_KEY,
  SAVED_PROJECTS_BACKUP_KEY,
  type SavedProject,
} from './saved-projects';

const mk = (n: number, over: Partial<SavedProject> = {}): SavedProject => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  name: `P${n}`,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  mediaPlanState: { totalBudget: n * 100 },
  multiMonthState: {},
  ...over,
});

class MemStorage implements Storage {
  data = new Map<string, string>();
  failWrites = false;
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
  setItem(k: string, v: string) {
    if (this.failWrites) throw new DOMException('full', 'QuotaExceededError');
    this.data.set(k, v);
  }
}

describe('saved projects', () => {
  let s: MemStorage;
  beforeEach(() => {
    s = new MemStorage();
  });

  it('keeps valid projects when one entry is corrupt, and backs up the raw value', () => {
    const raw = JSON.stringify([mk(1), { id: 'x', name: 5, mediaPlanState: 'bad' }, mk(2)]);
    s.setItem(SAVED_PROJECTS_KEY, raw);
    const r = loadSavedProjects(s);
    expect(r.projects.map((p) => p.name)).toEqual(['P1', 'P2']);
    expect(r.notice).toMatch(/damaged/);
    expect(s.getItem(SAVED_PROJECTS_BACKUP_KEY)).toBe(raw);
    // Loading again does not pile up identical backups.
    loadSavedProjects(s);
    expect(s.length).toBe(2);
  });

  it('backs up unparseable data and never overwrites an existing backup', () => {
    s.setItem(SAVED_PROJECTS_BACKUP_KEY, 'older');
    s.setItem(SAVED_PROJECTS_KEY, '{not json');
    const r = loadSavedProjects(s);
    expect(r.projects).toEqual([]);
    expect(r.notice).toBeTruthy();
    expect(s.getItem(SAVED_PROJECTS_BACKUP_KEY)).toBe('older');
    expect([...s.data.values()]).toContain('{not json');
    expect(s.getItem(SAVED_PROJECTS_KEY)).toBe('{not json');
  });

  it('flags unsafe saving when the backup cannot be written', () => {
    s.setItem(SAVED_PROJECTS_KEY, '{nope');
    s.failWrites = true;
    expect(loadSavedProjects(s).unsafeToSave).toBe(true);
  });

  it('migrates entries with a missing id', () => {
    const noId: Record<string, unknown> = { ...mk(1) };
    delete noId.id;
    s.setItem(SAVED_PROJECTS_KEY, JSON.stringify([noId]));
    const r = loadSavedProjects(s);
    expect(r.projects).toHaveLength(1);
    expect(r.projects[0].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.notice).toBeUndefined();
  });

  it('quota error leaves storage unchanged and reports failure', () => {
    const before = JSON.stringify([mk(1)]);
    s.setItem(SAVED_PROJECTS_KEY, before);
    s.failWrites = true;
    const res = writeSavedProjects([mk(2), mk(1)], s);
    expect(res).toEqual({ ok: false, reason: 'quota' });
    expect(s.getItem(SAVED_PROJECTS_KEY)).toBe(before);
  });

  it('does not apply an invalid project and strips account fields', () => {
    expect(prepareProjectForLoad({ ...mk(1), mediaPlanState: 'oops' }).ok).toBe(false);
    expect(prepareProjectForLoad({ ...mk(1), mediaPlanState: {} }).ok).toBe(false);
    expect(prepareProjectForLoad(null).ok).toBe(false);
    const r = prepareProjectForLoad(
      mk(1, { mediaPlanState: { totalBudget: 5, subscriptionTier: 'pro', userStatus: 'x' } })
    );
    expect(r.ok && r.mediaPlanState).toEqual({ totalBudget: 5 });
  });

  it('export then import round trips and merges without duplicating ids', () => {
    const list = [mk(1), mk(2)];
    const parsed = parseProjectsImport(exportProjectsJson(list));
    expect(parsed?.incoming).toEqual(list);
    const first = mergeProjects([mk(1, { name: 'local' })], parsed!.incoming);
    expect(first.added).toBe(1);
    expect(first.duplicates).toBe(1);
    expect(first.merged.map((p) => p.name).sort()).toEqual(['P2', 'local']);
    expect(parseProjectsImport('nope')).toBeNull();
    expect(parseProjectsImport('{"a":1}')).toBeNull();
  });
});
