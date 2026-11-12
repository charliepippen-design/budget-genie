import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectManager } from '@/components/dashboard/ProjectManager';
import { registerAITokenGetter } from '@/lib/ai-client';
import { loadTombstones, type ProjectsDoc } from '@/lib/cloud-projects';
import { loadSavedProjects, writeSavedProjects, type SavedProject } from '@/lib/saved-projects';
import { byText, cleanup, click, mount, tick } from '@/test/mount';
import { cloudSyncLabel, resetCloudSync, setCloudSyncUser, syncProjects, useCloudSyncStore } from './use-cloud-sync';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const project = (n: number, name: string, updatedAt = '2026-11-01T10:00:00.000Z'): SavedProject => ({
  id: uuid(n),
  name,
  createdAt: updatedAt,
  updatedAt,
  mediaPlanState: { totalBudget: 1000 * n },
  multiMonthState: {},
});

// A stand-in for api/projects.ts, reached through fetch like the real one.
const server = {
  doc: { projects: [], deleted: [] } as ProjectsDoc,
  version: 0,
  mode: 'ok' as 'ok' | 'offline' | 'html' | 'down' | 'full',
  gets: 0,
  puts: [] as ProjectsDoc[],
  tokens: [] as (string | null)[],
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function fakeFetch(url: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  expect(String(url)).toBe('/api/projects');
  const headers = init.headers as Record<string, string>;
  server.tokens.push(headers.Authorization ?? null);
  if (server.mode === 'offline') throw new TypeError('Failed to fetch');
  if (server.mode === 'html') return new Response('<!doctype html><html></html>', { status: 200 });
  if (server.mode === 'down') return json({ error: 'Cloud save is not configured.' }, 503);
  const etag = server.version ? `"v${server.version}"` : null;
  if ((init.method ?? 'GET') === 'GET') {
    server.gets++;
    return json({ version: 1, updatedAt: null, ...server.doc, etag });
  }
  if (server.mode === 'full') return json({ error: 'You can sync up to 200 projects. Delete or export some projects.' }, 413);
  if (headers['If-Match'] && headers['If-Match'] !== etag) return json({ error: 'conflict' }, 409);
  server.doc = JSON.parse(String(init.body)) as ProjectsDoc;
  server.puts.push(server.doc);
  server.version++;
  return json({ ok: true, updatedAt: 'now', etag: `"v${server.version}"` });
}

const statusLine = () => document.querySelector('[data-testid="cloud-sync-status"]');
const names = (list: SavedProject[]) => list.map((p) => p.name).sort();
const signIn = async () => {
  await act(async () => setCloudSyncUser('user_1'));
  await tick();
};

function typeInto(input: HTMLInputElement, value: string) {
  return act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function openProjects() {
  const el = await mount(<ProjectManager />);
  await click(byText(el, 'button', 'My Projects'));
  await tick();
}

async function saveAs(name: string) {
  await typeInto(document.querySelector<HTMLInputElement>('input[placeholder^="Project Name"]')!, name);
  await click(byText(document.body, 'button', 'Save'));
}

describe('project cloud sync', () => {
  beforeEach(() => {
    localStorage.clear();
    resetCloudSync();
    Object.assign(server, { doc: { projects: [], deleted: [] }, version: 0, mode: 'ok', gets: 0, puts: [], tokens: [] });
    vi.stubGlobal('fetch', vi.fn(fakeFetch));
    registerAITokenGetter(async () => 'session-token');
  });
  afterEach(async () => {
    await cleanup();
    resetCloudSync();
    registerAITokenGetter(undefined);
    vi.unstubAllGlobals();
  });

  it('does not call the cloud when signed out, and says how to get sync', async () => {
    writeSavedProjects([project(1, 'Local plan')]);
    await openProjects();
    await saveAs('Another plan');
    await tick(900);
    expect(fetch).not.toHaveBeenCalled();
    expect(statusLine()?.textContent).toBe('Sign in to sync across devices');
    expect(names(loadSavedProjects().projects)).toEqual(['Another plan', 'Local plan']);
  });

  it('on sign-in merges the cloud with this browser, both ways', async () => {
    writeSavedProjects([project(1, 'Only here')]);
    server.doc = { projects: [project(2, 'Only in the cloud')], deleted: [] };
    server.version = 1;

    await signIn();
    expect(names(loadSavedProjects().projects)).toEqual(['Only here', 'Only in the cloud']);
    expect(server.puts).toHaveLength(1);
    expect(names(server.doc.projects)).toEqual(['Only here', 'Only in the cloud']);
    expect(server.tokens.every((t) => t === 'Bearer session-token')).toBe(true);
    expect(useCloudSyncStore.getState().status).toBe('synced');
  });

  it('fetches and merges again when the list opens, and shows the merged list', async () => {
    await signIn();
    const getsAfterSignIn = server.gets;
    // Saved on another device since then.
    server.doc = { projects: [project(2, 'From my laptop')], deleted: [] };
    server.version++;

    await openProjects();
    expect(server.gets).toBe(getsAfterSignIn + 1);
    expect(byText(document.body, 'span', 'From my laptop')).not.toBeNull();
    expect(names(loadSavedProjects().projects)).toEqual(['From my laptop']);
    expect(statusLine()?.textContent).toBe('Synced to your account · just now');
    // Nothing new to upload: the cloud already had everything.
    expect(server.puts).toHaveLength(0);
  });

  it('uploads after a save, and shows synced only once the server accepted it', async () => {
    await signIn();
    await openProjects();
    await saveAs('Q1 plan');
    expect(statusLine()?.textContent).toBe('Saving…');
    expect(server.puts).toHaveLength(0);

    await tick(900);
    expect(names(server.doc.projects)).toEqual(['Q1 plan']);
    expect(statusLine()?.textContent).toBe('Synced to your account · just now');
  });

  it('uploads an overwrite as the same project with a newer date', async () => {
    writeSavedProjects([project(1, 'Q1 plan')]);
    await signIn();
    await openProjects();
    await saveAs('Q1 plan');
    await click(byText(document.querySelector('[role="alertdialog"]')!, 'button', 'Overwrite'));
    await tick(900);
    expect(server.doc.projects).toHaveLength(1);
    expect(server.doc.projects[0].id).toBe(uuid(1));
    expect(Date.parse(server.doc.projects[0].updatedAt)).toBeGreaterThan(Date.parse('2026-11-01T10:00:00.000Z'));
  });

  it('deleting records a tombstone, so the project is removed from the cloud too', async () => {
    writeSavedProjects([project(1, 'Old plan'), project(2, 'Keep me')]);
    await signIn();
    expect(server.doc.projects).toHaveLength(2);

    await openProjects();
    await click(document.querySelector('button[title="Delete Project"]'));
    await click(byText(document.querySelector('[role="alertdialog"]')!, 'button', 'Delete project'));
    expect(loadTombstones().map((t) => t.id)).toEqual([uuid(1)]);

    await tick(900);
    expect(names(server.doc.projects)).toEqual(['Keep me']);
    expect(server.doc.deleted.map((t) => t.id)).toEqual([uuid(1)]);

    // Another device that still has the project loses it on its next sync instead of re-uploading it.
    writeSavedProjects([project(1, 'Old plan'), project(2, 'Keep me')]);
    localStorage.removeItem('igaming_projects_deleted');
    await act(async () => syncProjects());
    expect(names(loadSavedProjects().projects)).toEqual(['Keep me']);
    expect(names(server.doc.projects)).toEqual(['Keep me']);
  });

  it('offline: keeps saving in this browser, says so, and syncs on Retry', async () => {
    server.mode = 'offline';
    await signIn();
    await openProjects();
    await saveAs('Offline plan');
    await tick(900);

    expect(names(loadSavedProjects().projects)).toEqual(['Offline plan']);
    expect(byText(document.body, 'span', 'Offline plan')).not.toBeNull();
    expect(statusLine()?.textContent).toBe(
      'Saved in this browser only: cloud save is unavailable right nowRetry'
    );
    expect(server.puts).toHaveLength(0);

    server.mode = 'ok';
    await click(byText(statusLine()!, 'button', 'Retry'));
    await tick();
    expect(names(server.doc.projects)).toEqual(['Offline plan']);
    expect(statusLine()?.textContent).toBe('Synced to your account · just now');
  });

  it.each(['html', 'down'] as const)('never shows synced when the answer is not a real success (%s)', async (mode) => {
    server.mode = mode;
    writeSavedProjects([project(1, 'Local plan')]);
    await signIn();
    await openProjects();
    expect(useCloudSyncStore.getState()).toMatchObject({ status: 'unavailable', lastSyncedAt: null });
    expect(statusLine()?.textContent).toContain('Saved in this browser only: cloud save is unavailable right now');
    expect(names(loadSavedProjects().projects)).toEqual(['Local plan']);
  });

  it('shows the reason when the server refuses the projects', async () => {
    server.mode = 'full';
    writeSavedProjects([project(1, 'Local plan')]);
    await signIn();
    await openProjects();
    expect(statusLine()?.textContent).toContain(
      'Saved in this browser only: You can sync up to 200 projects. Delete or export some projects.'
    );
  });

  it('merges again when another device wrote between the read and the write', async () => {
    writeSavedProjects([project(1, 'Mine')]);
    const realFetch = fakeFetch;
    let raced = false;
    vi.stubGlobal('fetch', async (url: RequestInfo | URL, init: RequestInit = {}) => {
      if (init.method === 'PUT' && !raced) {
        raced = true;
        server.doc = { projects: [project(2, 'Theirs')], deleted: [] };
        server.version++;
      }
      return realFetch(url, init);
    });
    server.version = 1;
    await signIn();
    expect(names(server.doc.projects)).toEqual(['Mine', 'Theirs']);
    expect(names(loadSavedProjects().projects)).toEqual(['Mine', 'Theirs']);
    expect(useCloudSyncStore.getState().status).toBe('synced');
  });

  it('signing out stops syncing', async () => {
    await signIn();
    await act(async () => setCloudSyncUser(null));
    const calls = server.tokens.length;
    await act(async () => syncProjects());
    expect(server.tokens).toHaveLength(calls);
    expect(useCloudSyncStore.getState().status).toBe('signed-out');
  });
});

describe('cloudSyncLabel', () => {
  it('tells the time of the last sync in plain words', () => {
    const now = Date.parse('2026-11-12T12:00:00Z');
    const synced = (minutesAgo: number) =>
      cloudSyncLabel({ status: 'synced', lastSyncedAt: now - minutesAgo * 60000, detail: null }, now);
    expect(synced(0)).toBe('Synced to your account · just now');
    expect(synced(5)).toBe('Synced to your account · 5 min ago');
    expect(synced(180)).toMatch(/^Synced to your account · .*2026/);
  });
});
