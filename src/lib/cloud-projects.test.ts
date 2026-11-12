import { beforeEach, describe, expect, it } from 'vitest';
import {
  DELETED_PROJECTS_KEY,
  loadTombstones,
  mergeProjectDocs,
  recordDeletion,
  sameProjectsDoc,
  TOMBSTONE_TTL_MS,
  type ProjectsDoc,
} from './cloud-projects';
import type { SavedProject } from './saved-projects';

const NOW = Date.parse('2026-11-12T12:00:00.000Z');
const at = (daysAgo: number) => new Date(NOW - daysAgo * 24 * 60 * 60 * 1000).toISOString();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const project = (n: number, updatedAt: string, budget = 1000): SavedProject => ({
  id: id(n),
  name: `Plan ${n}`,
  createdAt: at(30),
  updatedAt,
  mediaPlanState: { totalBudget: budget },
  multiMonthState: {},
});
const doc = (projects: SavedProject[] = [], deleted: ProjectsDoc['deleted'] = []): ProjectsDoc => ({
  projects,
  deleted,
});
const budgets = (d: ProjectsDoc) => Object.fromEntries(d.projects.map((p) => [p.id, p.mediaPlanState.totalBudget]));

describe('mergeProjectDocs', () => {
  it('keeps projects that exist on one side only', () => {
    const merged = mergeProjectDocs(doc([project(1, at(1))]), doc([project(2, at(2))]), NOW);
    expect(merged.projects.map((p) => p.id)).toEqual([id(1), id(2)]); // newest first
  });

  it('keeps the newest version of a project, whichever side has it', () => {
    const newerLocal = mergeProjectDocs(doc([project(1, at(1), 5000)]), doc([project(1, at(2), 1000)]), NOW);
    expect(budgets(newerLocal)).toEqual({ [id(1)]: 5000 });
    const newerRemote = mergeProjectDocs(doc([project(1, at(2), 5000)]), doc([project(1, at(1), 1000)]), NOW);
    expect(budgets(newerRemote)).toEqual({ [id(1)]: 1000 });
  });

  it('takes the cloud copy on a tie, so every device ends on the same version', () => {
    const merged = mergeProjectDocs(doc([project(1, at(1), 5000)]), doc([project(1, at(1), 1000)]), NOW);
    expect(budgets(merged)).toEqual({ [id(1)]: 1000 });
  });

  it('removes a project deleted on another device, and keeps the tombstone', () => {
    const tombstone = { id: id(1), deletedAt: at(1) };
    const merged = mergeProjectDocs(doc([project(1, at(2)), project(2, at(2))]), doc([], [tombstone]), NOW);
    expect(merged.projects.map((p) => p.id)).toEqual([id(2)]);
    expect(merged.deleted).toEqual([tombstone]);
  });

  it('keeps a project saved again after it was deleted', () => {
    const merged = mergeProjectDocs(doc([project(1, at(1))]), doc([], [{ id: id(1), deletedAt: at(2) }]), NOW);
    expect(merged.projects.map((p) => p.id)).toEqual([id(1)]);
  });

  it('drops tombstones older than 90 days and keeps the newest of two', () => {
    const merged = mergeProjectDocs(
      doc([], [
        { id: id(1), deletedAt: at(91) },
        { id: id(2), deletedAt: at(5) },
      ]),
      doc([], [
        { id: id(2), deletedAt: at(3) },
        { id: id(3), deletedAt: at(89) },
      ]),
      NOW
    );
    expect(merged.deleted).toEqual([
      { id: id(2), deletedAt: at(3) },
      { id: id(3), deletedAt: at(89) },
    ]);
    expect(TOMBSTONE_TTL_MS).toBe(90 * 24 * 60 * 60 * 1000);
  });

  it('lets a project come back once its tombstone has expired', () => {
    const merged = mergeProjectDocs(doc([project(1, at(100))]), doc([], [{ id: id(1), deletedAt: at(95) }]), NOW);
    expect(merged).toEqual(doc([project(1, at(100))]));
  });

  it('is idempotent: merging the result again changes nothing', () => {
    const local = doc([project(1, at(1), 5000), project(2, at(4))], [{ id: id(3), deletedAt: at(2) }]);
    const remote = doc([project(1, at(2)), project(3, at(6)), project(4, at(3))], [{ id: id(2), deletedAt: at(1) }]);
    const once = mergeProjectDocs(local, remote, NOW);
    expect(once.projects.map((p) => p.id)).toEqual([id(1), id(4)]);
    expect(mergeProjectDocs(once, remote, NOW)).toEqual(once);
    expect(mergeProjectDocs(local, once, NOW)).toEqual(once);
    expect(mergeProjectDocs(once, once, NOW)).toEqual(once);
    expect(sameProjectsDoc(once, mergeProjectDocs(once, doc(), NOW))).toBe(true);
  });

  it('does not change its inputs', () => {
    const local = doc([project(1, at(1))], [{ id: id(2), deletedAt: at(1) }]);
    const remote = doc([project(2, at(3))]);
    const before = JSON.stringify([local, remote]);
    mergeProjectDocs(local, remote, NOW);
    expect(JSON.stringify([local, remote])).toBe(before);
  });
});

describe('sameProjectsDoc', () => {
  it('ignores order and notices a content change with the same timestamp', () => {
    const a = doc([project(1, at(1)), project(2, at(2))]);
    expect(sameProjectsDoc(a, doc([project(2, at(2)), project(1, at(1))]))).toBe(true);
    expect(sameProjectsDoc(a, doc([project(1, at(1), 9), project(2, at(2))]))).toBe(false);
    expect(sameProjectsDoc(a, doc(a.projects, [{ id: id(3), deletedAt: at(1) }]))).toBe(false);
  });
});

describe('tombstones in this browser', () => {
  beforeEach(() => localStorage.clear());

  it('records a deletion once per project, with the latest time', () => {
    recordDeletion(id(1), localStorage, new Date(at(2)));
    recordDeletion(id(2), localStorage, new Date(at(2)));
    recordDeletion(id(1), localStorage, new Date(at(1)));
    expect(loadTombstones()).toEqual([
      { id: id(2), deletedAt: at(2) },
      { id: id(1), deletedAt: at(1) },
    ]);
  });

  it('reads damaged data as no tombstones', () => {
    localStorage.setItem(DELETED_PROJECTS_KEY, '{not json');
    expect(loadTombstones()).toEqual([]);
    localStorage.setItem(DELETED_PROJECTS_KEY, '[{"id":1},null,{"id":"x","deletedAt":"2026-01-01"}]');
    expect(loadTombstones()).toEqual([{ id: 'x', deletedAt: '2026-01-01' }]);
  });
});
