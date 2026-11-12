// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory stand-in for the private Blob store.
const blob = vi.hoisted(() => {
  class BlobPreconditionFailedError extends Error {}
  const files = new Map<string, { body: string; etag: string }>();
  let version = 0;
  return {
    files,
    BlobPreconditionFailedError,
    calls: [] as { op: string; path: string; options?: Record<string, unknown> }[],
    put: async (path: string, body: string, options: Record<string, unknown>) => {
      const existing = files.get(path);
      if (options.ifMatch && existing?.etag !== options.ifMatch) throw new BlobPreconditionFailedError();
      if (existing && !options.allowOverwrite && !options.ifMatch) throw new Error('blob already exists');
      const etag = `"v${++version}"`;
      files.set(path, { body, etag });
      return { etag, pathname: path };
    },
    get: async (path: string) => {
      const file = files.get(path);
      if (!file) return null;
      return { statusCode: 200, stream: new Response(file.body).body, blob: { etag: file.etag } };
    },
    del: async (path: string) => void files.delete(path),
  };
});

vi.mock('@vercel/blob', () => ({
  BlobPreconditionFailedError: blob.BlobPreconditionFailedError,
  put: (path: string, body: string, options: Record<string, unknown>) => {
    blob.calls.push({ op: 'put', path, options });
    return blob.put(path, body, options);
  },
  get: (path: string, options: Record<string, unknown>) => {
    blob.calls.push({ op: 'get', path, options });
    return blob.get(path);
  },
  del: (path: string) => {
    blob.calls.push({ op: 'del', path });
    return blob.del(path);
  },
}));

// Sessions: "Bearer a" is user_a, "Bearer b" is user_b, "Bearer anon" is the local-dev anonymous
// user, "Bearer odd" a user id that would not be safe as a path segment.
vi.mock('../../api/_auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/_auth')>()),
  verifyClerkUser: async (req: Request) => {
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    return { a: 'user_a', b: 'user_b', anon: 'anonymous', odd: '../user_a' }[token] ?? null;
  },
}));

import { GET as getProjects, MAX_BODY_BYTES, MAX_PROJECTS, PUT as putProjects } from '../../api/projects';
import { DELETE as deleteShare, GET as getShare, MAX_SHARE_BYTES, POST as postShare } from '../../api/share';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const project = (n: number, extra: Record<string, unknown> = {}) => ({
  id: uuid(n),
  name: `Plan ${n}`,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-02T10:00:00.000Z',
  mediaPlanState: { totalBudget: 1000 * n },
  multiMonthState: {},
  ...extra,
});

const request = (url: string, method: string, token?: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://site${url}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
const projectsReq = (method: string, token?: string, body?: unknown, headers?: Record<string, string>) =>
  request('/api/projects', method, token, body, headers);
const read = async (res: Response) => (await res.json()) as Record<string, unknown>;

beforeEach(() => {
  blob.files.clear();
  blob.calls.length = 0;
  vi.unstubAllEnvs();
  vi.stubEnv('BLOB_STORE_ID', 'store_test');
});

describe('api/projects', () => {
  it('answers 401 without a signed-in user, and to the anonymous dev user', async () => {
    for (const token of [undefined, 'nope', 'anon', 'odd']) {
      expect((await getProjects(projectsReq('GET', token))).status).toBe(401);
      expect((await putProjects(projectsReq('PUT', token, { projects: [], deleted: [] }))).status).toBe(401);
    }
    expect(blob.calls).toEqual([]);
  });

  it('answers 503 when the store is not configured', async () => {
    vi.stubEnv('BLOB_STORE_ID', '');
    const res = await getProjects(projectsReq('GET', 'a'));
    expect(res.status).toBe(503);
    expect(await read(res)).toEqual({ error: 'Cloud save is not configured.' });
    expect((await putProjects(projectsReq('PUT', 'a', { projects: [], deleted: [] }))).status).toBe(503);
    expect(blob.calls).toEqual([]);
  });

  it('returns an empty document before the first save', async () => {
    const res = await getProjects(projectsReq('GET', 'a'));
    expect(res.status).toBe(200);
    expect(await read(res)).toEqual({ version: 1, updatedAt: null, projects: [], deleted: [], etag: null });
  });

  it('stores and returns the document of the signed-in user, privately and uncached', async () => {
    const deleted = [{ id: uuid(9), deletedAt: '2026-11-03T10:00:00.000Z' }];
    const put = await putProjects(projectsReq('PUT', 'a', { projects: [project(1)], deleted }));
    expect(put.status).toBe(200);
    expect(blob.calls.at(-1)).toMatchObject({
      op: 'put',
      path: 'users/user_a/projects.json',
      options: { access: 'private', addRandomSuffix: false, contentType: 'application/json' },
    });

    const doc = await read(await getProjects(projectsReq('GET', 'a')));
    expect(doc).toMatchObject({ version: 1, projects: [project(1)], deleted });
    expect(typeof doc.updatedAt).toBe('string');
    expect(typeof doc.etag).toBe('string');
    expect(blob.calls.at(-1)).toMatchObject({ op: 'get', options: { access: 'private', useCache: false } });
  });

  it('never lets user B read or write the document of user A', async () => {
    await putProjects(projectsReq('PUT', 'a', { projects: [project(1)], deleted: [] }));

    // B asks for A's data in every way a request can carry it: B only ever gets B's own (empty) document.
    const asB = await getProjects(
      request('/api/projects?userId=user_a&path=users/user_a/projects.json', 'GET', 'b', undefined, {
        'x-user-id': 'user_a',
      })
    );
    expect((await read(asB)).projects).toEqual([]);

    // A user id in the body is ignored: the write lands in B's document, A's is untouched.
    const write = await putProjects(
      projectsReq('PUT', 'b', { userId: 'user_a', ownerId: 'user_a', projects: [project(2)], deleted: [] })
    );
    expect(write.status).toBe(200);
    expect([...blob.files.keys()].sort()).toEqual(['users/user_a/projects.json', 'users/user_b/projects.json']);
    expect((await read(await getProjects(projectsReq('GET', 'a')))).projects).toEqual([project(1)]);
    expect((await read(await getProjects(projectsReq('GET', 'b')))).projects).toEqual([project(2)]);
    expect(blob.files.get('users/user_b/projects.json')!.body).not.toContain('user_a');
  });

  it('refuses a body over the size cap, declared or actual', async () => {
    const huge = { projects: [project(1)], deleted: [], pad: 'x'.repeat(MAX_BODY_BYTES) };
    const res = await putProjects(projectsReq('PUT', 'a', huge));
    expect(res.status).toBe(413);
    expect((await read(res)).error).toMatch(/too large to sync \(limit 2 MB\)/);

    const declared = await putProjects(
      projectsReq('PUT', 'a', { projects: [], deleted: [] }, { 'content-length': String(MAX_BODY_BYTES + 1) })
    );
    expect(declared.status).toBe(413);
    expect(blob.files.size).toBe(0);
  });

  it('refuses more projects than the cap', async () => {
    const projects = Array.from({ length: MAX_PROJECTS + 1 }, (_, i) => project(i + 1));
    const res = await putProjects(projectsReq('PUT', 'a', { projects, deleted: [] }));
    expect(res.status).toBe(413);
    expect((await read(res)).error).toBe('You can sync up to 200 projects. Delete or export some projects.');
    expect((await putProjects(projectsReq('PUT', 'a', { projects: projects.slice(1), deleted: [] }))).status).toBe(200);
  });

  it('refuses documents that are not valid projects', async () => {
    const bad: unknown[] = [
      'not json{',
      [],
      { projects: 'x', deleted: [] },
      { projects: [project(1, { id: 'not-a-uuid' })], deleted: [] },
      { projects: [project(1, { name: '' })], deleted: [] },
      { projects: [project(1, { mediaPlanState: [] })], deleted: [] },
      { projects: [project(1, { multiMonthState: null })], deleted: [] },
      { projects: [project(1), project(1)], deleted: [] },
      { projects: [project(1)] },
      { projects: [], deleted: [{ id: 'x', deletedAt: 'y' }] },
    ];
    for (const body of bad) {
      expect((await putProjects(projectsReq('PUT', 'a', body))).status, JSON.stringify(body).slice(0, 80)).toBe(400);
    }
    expect(blob.files.size).toBe(0);
  });

  it('answers 409 when another device wrote first, and accepts the current version', async () => {
    await putProjects(projectsReq('PUT', 'a', { projects: [project(1)], deleted: [] }));
    const { etag } = await read(await getProjects(projectsReq('GET', 'a')));
    const first = await putProjects(
      projectsReq('PUT', 'a', { projects: [project(1), project(2)], deleted: [] }, { 'If-Match': String(etag) })
    );
    expect(first.status).toBe(200);
    const stale = await putProjects(
      projectsReq('PUT', 'a', { projects: [project(3)], deleted: [] }, { 'If-Match': String(etag) })
    );
    expect(stale.status).toBe(409);
    expect((await read(await getProjects(projectsReq('GET', 'a')))).projects).toEqual([project(1), project(2)]);
  });

  it('reports a stored document it cannot read instead of serving or replacing it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    blob.files.set('users/user_a/projects.json', { body: '{"projects":"broken"}', etag: '"x"' });
    expect((await getProjects(projectsReq('GET', 'a'))).status).toBe(500);
    blob.files.set('users/user_a/projects.json', { body: 'not json', etag: '"x"' });
    expect((await getProjects(projectsReq('GET', 'a'))).status).toBe(502);
    vi.restoreAllMocks();
  });
});

const plan = {
  totalBudget: 50000,
  channels: [{ id: 'c1', name: 'Paid Social', allocationPct: 100 }],
  globalMultipliers: { spendMultiplier: 1 },
  activeTiers: {},
  activeGeos: ['GB'],
  geoOverrides: {},
  onboardingVertical: 'igaming',
  observedLtv: {},
};
const shareBody = (extra: Record<string, unknown> = {}) => ({
  name: 'Q1 launch',
  currency: 'EUR',
  vertical: 'igaming',
  mediaPlanState: {
    ...plan,
    subscriptionTier: 'enterprise',
    userStatus: 'paid',
    presets: [{ name: 'secret preset' }],
    brief: { notes: 'internal' },
  },
  ...extra,
});
const shareReq = (method: string, token?: string, id?: string, body?: unknown) =>
  request(`/api/share${id === undefined ? '' : `?id=${id}`}`, method, token, body);

async function createShare(token = 'a') {
  const res = await postShare(shareReq('POST', token, undefined, shareBody()));
  expect(res.status).toBe(200);
  return (await read(res)).id as string;
}

describe('api/share', () => {
  it('needs a signed-in user to create or delete, and a configured store', async () => {
    for (const token of [undefined, 'anon']) {
      expect((await postShare(shareReq('POST', token, undefined, shareBody()))).status).toBe(401);
      expect((await deleteShare(shareReq('DELETE', token, 'A'.repeat(22)))).status).toBe(401);
    }
    vi.stubEnv('BLOB_STORE_ID', '');
    expect((await postShare(shareReq('POST', 'a', undefined, shareBody()))).status).toBe(503);
    expect((await getShare(shareReq('GET', undefined, 'A'.repeat(22)))).status).toBe(503);
    expect(blob.calls).toEqual([]);
  });

  it('stores an immutable snapshot under an unguessable id, with only what the plan needs', async () => {
    const first = await createShare();
    const second = await createShare();
    expect(first).toMatch(/^[A-Za-z0-9_-]{22}$/); // 16 random bytes, base64url
    expect(second).not.toBe(first);

    expect(blob.calls.filter((c) => c.op === 'put')[0]).toMatchObject({
      path: `shares/${first}.json`,
      options: { access: 'private', allowOverwrite: false, addRandomSuffix: false },
    });
    const stored = JSON.parse(blob.files.get(`shares/${first}.json`)!.body);
    expect(stored).toMatchObject({
      version: 1,
      id: first,
      ownerId: 'user_a',
      name: 'Q1 launch',
      currency: 'EUR',
      vertical: 'igaming',
    });
    expect(stored.mediaPlanState).toEqual(plan);
    expect(JSON.stringify(stored)).not.toMatch(/subscriptionTier|userStatus|presets|secret preset|brief|internal/);
  });

  it('serves a snapshot to anyone with the link, without ownerId and without caching', async () => {
    const id = await createShare();
    const res = await getShare(shareReq('GET', undefined, id));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-robots-tag')).toBe('noindex');
    const body = await read(res);
    expect(body).toMatchObject({ version: 1, id, name: 'Q1 launch', currency: 'EUR', vertical: 'igaming', mediaPlanState: plan });
    expect(Object.keys(body).sort()).toEqual(['createdAt', 'currency', 'id', 'mediaPlanState', 'name', 'version', 'vertical']);
    expect(JSON.stringify(body)).not.toContain('user_a');
  });

  it('rejects malformed ids before touching the store', async () => {
    const bad = [
      '',
      'short',
      'A'.repeat(21),
      'A'.repeat(65),
      '../users/user_a/projects',
      'a/b'.repeat(8),
      `${'A'.repeat(22)}.json`,
      `${'A'.repeat(22)}/..`,
      `${'A'.repeat(21)}!`,
    ];
    for (const id of bad) {
      expect((await getShare(shareReq('GET', undefined, encodeURIComponent(id)))).status, id).toBe(404);
      expect((await deleteShare(shareReq('DELETE', 'a', encodeURIComponent(id)))).status, id).toBe(404);
    }
    expect((await getShare(shareReq('GET'))).status).toBe(404);
    expect(blob.calls).toEqual([]);
  });

  it('answers 404 for a well-formed id that does not exist', async () => {
    const res = await getShare(shareReq('GET', undefined, 'B'.repeat(22)));
    expect(res.status).toBe(404);
    expect(await read(res)).toEqual({ error: 'This shared plan does not exist or was removed.' });
  });

  it('lets only the owner delete a share', async () => {
    const id = await createShare('a');
    expect((await deleteShare(shareReq('DELETE', undefined, id))).status).toBe(401);
    expect((await deleteShare(shareReq('DELETE', 'b', id))).status).toBe(403);
    expect((await getShare(shareReq('GET', undefined, id))).status).toBe(200);

    expect((await deleteShare(shareReq('DELETE', 'a', id))).status).toBe(200);
    expect((await getShare(shareReq('GET', undefined, id))).status).toBe(404);
    expect((await deleteShare(shareReq('DELETE', 'a', id))).status).toBe(404);
  });

  it('refuses a plan over the size cap and invalid plans', async () => {
    const big = await postShare(shareReq('POST', 'a', undefined, shareBody({ pad: 'x'.repeat(MAX_SHARE_BYTES) })));
    expect(big.status).toBe(413);
    expect((await read(big)).error).toBe('This plan is too large to share (limit 512 KB).');

    const invalid: unknown[] = [
      'not json{',
      shareBody({ name: '  ' }),
      shareBody({ currency: 'euro' }),
      shareBody({ mediaPlanState: { ...plan, totalBudget: 'lots' } }),
      shareBody({ mediaPlanState: { ...plan, channels: 'none' } }),
      shareBody({ mediaPlanState: undefined }),
    ];
    for (const body of invalid) {
      expect((await postShare(shareReq('POST', 'a', undefined, body))).status).toBe(400);
    }
    expect(blob.files.size).toBe(0);
  });

  it('ignores an ownerId or id sent by the client', async () => {
    const res = await postShare(shareReq('POST', 'b', undefined, shareBody({ ownerId: 'user_a', id: 'C'.repeat(22) })));
    const id = (await read(res)).id as string;
    expect(id).not.toBe('C'.repeat(22));
    expect(JSON.parse(blob.files.get(`shares/${id}.json`)!.body).ownerId).toBe('user_b');
    expect((await deleteShare(shareReq('DELETE', 'a', id))).status).toBe(403);
  });
});
