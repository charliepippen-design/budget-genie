// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MemoryQuotaStore,
  __resetQuotaForTests,
  checkUserQuota,
  isModelExhausted,
  markModelExhausted,
  nextPacificMidnight,
  quotaConfig,
  withQuotaGuard,
} from '../../api/_quota';
import { handleAIRequest } from '../../api/_gateway';
import { DEFAULT_FALLBACK_MODEL, DEFAULT_MODEL } from '../../api/_models';

const post = (body: unknown = {}) =>
  new Request('http://localhost/api/ai-gateway', { method: 'POST', body: JSON.stringify(body) });

const ok = () => new Response('{}', { status: 200 });

beforeEach(() => {
  __resetQuotaForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('quotaConfig', () => {
  it('uses defaults and falls back on invalid values', () => {
    expect(quotaConfig()).toEqual({ enabled: true, userDaily: 60, userInflight: 2 });
    vi.stubEnv('AI_QUOTA_USER_DAILY', 'abc');
    vi.stubEnv('AI_QUOTA_USER_INFLIGHT', '-3');
    expect(quotaConfig()).toEqual({ enabled: true, userDaily: 60, userInflight: 2 });
    vi.stubEnv('AI_QUOTA_USER_DAILY', '5');
    vi.stubEnv('AI_QUOTA_USER_INFLIGHT', '1');
    vi.stubEnv('AI_QUOTA', 'off');
    expect(quotaConfig()).toEqual({ enabled: false, userDaily: 5, userInflight: 1 });
  });
});

describe('MemoryQuotaStore', () => {
  it('counts, expires and evicts the oldest keys', () => {
    const s = new MemoryQuotaStore();
    expect(s.incr('a', 60)).toBe(1);
    expect(s.incr('a', 60)).toBe(2);
    s.set('b', 7, 60);
    expect(s.get('b')).toBe(7);
    s.del('b');
    expect(s.get('b')).toBe(0);
    for (let i = 0; i < 10_001; i++) s.set(`k${i}`, 1, 60);
    expect(s.get('a')).toBe(0);
    expect(s.get('k10000')).toBe(1);
  });

  it('drops expired keys', () => {
    vi.useFakeTimers();
    try {
      const s = new MemoryQuotaStore();
      s.set('x', 3, 10);
      vi.advanceTimersByTime(11_000);
      expect(s.get('x')).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('daily cap', () => {
  it('rejects the 61st request with 429 and Retry-After, then resets next UTC day', async () => {
    const store = new MemoryQuotaStore();
    let now = new Date('2026-10-12T10:00:00Z');
    const handler = vi.fn(async () => ok());
    const guarded = withQuotaGuard(handler, { verify: async () => 'user_1', store, now: () => now });

    for (let i = 0; i < 60; i++) expect((await guarded(post())).status).toBe(200);
    const res = await guarded(post());
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('Retry-After'))).toBe(14 * 3600);
    const data = await res.json();
    expect(data.code).toBe('AI_DAILY_LIMIT');
    expect(data.error).toContain('about 14 hours');
    expect(handler).toHaveBeenCalledTimes(60);

    now = new Date('2026-10-13T00:00:01Z');
    expect((await guarded(post())).status).toBe(200);
  });

  it('honours AI_QUOTA_USER_DAILY', () => {
    vi.stubEnv('AI_QUOTA_USER_DAILY', '2');
    const store = new MemoryQuotaStore();
    const now = new Date('2026-10-12T10:00:00Z');
    expect(checkUserQuota('u', now, store).ok).toBe(true);
    expect(checkUserQuota('u', now, store).ok).toBe(true);
    expect(checkUserQuota('u', now, store).ok).toBe(false);
    expect(checkUserQuota('other', now, store).ok).toBe(true);
  });
});

describe('in-flight cap', () => {
  it('rejects a third concurrent request and frees the slot on success', async () => {
    const store = new MemoryQuotaStore();
    const gates: Array<() => void> = [];
    const handler = vi.fn(() => new Promise<Response>((resolve) => gates.push(() => resolve(ok()))));
    const guarded = withQuotaGuard(handler, { verify: async () => 'user_1', store });

    const a = guarded(post());
    const b = guarded(post());
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(2));

    const blocked = await guarded(post());
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBe('5');
    expect((await blocked.json()).code).toBe('AI_BUSY');

    gates[0]();
    await a;
    const c = guarded(post());
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(3));
    gates[1]();
    gates[2]();
    expect((await Promise.all([b, c])).map((r) => r.status)).toEqual([200, 200]);
  });

  it('releases the slot when the handler throws', async () => {
    vi.stubEnv('AI_QUOTA_USER_INFLIGHT', '1');
    const store = new MemoryQuotaStore();
    const handler = vi.fn(async () => {
      throw new Error('boom');
    });
    const guarded = withQuotaGuard(handler, { verify: async () => 'user_1', store });
    await expect(guarded(post())).rejects.toThrow('boom');
    await expect(guarded(post())).rejects.toThrow('boom'); // not AI_BUSY
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('release is idempotent', () => {
    const store = new MemoryQuotaStore();
    const now = new Date('2026-10-12T10:00:00Z');
    const a = checkUserQuota('u', now, store);
    const b = checkUserQuota('u', now, store);
    if (!a.ok || !b.ok) throw new Error('expected ok');
    a.release();
    a.release();
    expect(store.get('ai:inflight:u')).toBe(1);
  });
});

describe('pass-through rules', () => {
  it('lets unauthenticated requests through to the usual 401', async () => {
    vi.stubEnv('ALLOW_ANON', '');
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', '');
    vi.stubEnv('CLERK_PUBLISHABLE_KEY', '');
    const guarded = withQuotaGuard(handleAIRequest, { store: new MemoryQuotaStore() });
    const res = await guarded(post({ task: 'planner', messages: [] }));
    expect(res.status).toBe(401);
  });

  it('exempts anonymous (local dev)', async () => {
    vi.stubEnv('AI_QUOTA_USER_DAILY', '1');
    const store = new MemoryQuotaStore();
    const handler = vi.fn(async () => ok());
    const guarded = withQuotaGuard(handler, { verify: async () => 'anonymous', store });
    for (let i = 0; i < 5; i++) expect((await guarded(post())).status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(5);
  });

  it('AI_QUOTA=off disables the guard', async () => {
    vi.stubEnv('AI_QUOTA', 'off');
    vi.stubEnv('AI_QUOTA_USER_DAILY', '1');
    const verify = vi.fn(async () => 'user_1');
    const guarded = withQuotaGuard(async () => ok(), { verify, store: new MemoryQuotaStore() });
    for (let i = 0; i < 3; i++) expect((await guarded(post())).status).toBe(200);
    expect(verify).not.toHaveBeenCalled();
  });

  it('does not count non-POST requests', async () => {
    vi.stubEnv('AI_QUOTA_USER_DAILY', '1');
    const store = new MemoryQuotaStore();
    const guarded = withQuotaGuard(async () => ok(), { verify: async () => 'user_1', store });
    for (let i = 0; i < 3; i++) {
      expect((await guarded(new Request('http://localhost/api/ai-gateway', { method: 'GET' }))).status).toBe(200);
    }
    expect((await guarded(post())).status).toBe(200);
  });
});

describe('nextPacificMidnight', () => {
  it('handles PDT, PST and the Nov 1, 2026 DST change', () => {
    // PDT (UTC-7): midnight PT is 07:00Z
    expect(nextPacificMidnight(new Date('2026-10-12T10:00:00Z')).toISOString()).toBe('2026-10-13T07:00:00.000Z');
    // Day before the change: the next midnight is still PDT
    expect(nextPacificMidnight(new Date('2026-10-31T20:00:00Z')).toISOString()).toBe('2026-11-01T07:00:00.000Z');
    // Nov 1 is 25 hours long: the next midnight is PST (UTC-8)
    expect(nextPacificMidnight(new Date('2026-11-01T07:00:00Z')).toISOString()).toBe('2026-11-02T08:00:00.000Z');
    expect(nextPacificMidnight(new Date('2026-11-01T12:00:00Z')).toISOString()).toBe('2026-11-02T08:00:00.000Z');
    // Late evening PT that is already the next UTC day
    expect(nextPacificMidnight(new Date('2026-12-05T07:59:00Z')).toISOString()).toBe('2026-12-05T08:00:00.000Z');
    // Spring forward (Mar 8, 2026)
    expect(nextPacificMidnight(new Date('2026-03-08T12:00:00Z')).toISOString()).toBe('2026-03-09T07:00:00.000Z');
  });
});

describe('model exhaustion memo', () => {
  it('skips a model until midnight PT', () => {
    const now = new Date('2026-10-12T10:00:00Z');
    expect(isModelExhausted('m1', now)).toBe(false);
    markModelExhausted('m1', now);
    expect(isModelExhausted('m1', now)).toBe(true);
    expect(isModelExhausted('m2', now)).toBe(false);
    expect(isModelExhausted('m1', new Date('2026-10-13T06:59:59Z'))).toBe(true);
    expect(isModelExhausted('m1', new Date('2026-10-13T07:00:00Z'))).toBe(false);
  });

  it('is DST-safe across Nov 1, 2026', () => {
    markModelExhausted('m1', new Date('2026-10-31T20:00:00Z'));
    expect(isModelExhausted('m1', new Date('2026-11-01T06:59:59Z'))).toBe(true);
    expect(isModelExhausted('m1', new Date('2026-11-01T07:00:00Z'))).toBe(false);

    markModelExhausted('m2', new Date('2026-11-01T07:00:00Z'));
    expect(isModelExhausted('m2', new Date('2026-11-02T07:59:59Z'))).toBe(true);
    expect(isModelExhausted('m2', new Date('2026-11-02T08:00:00Z'))).toBe(false);
  });
});

describe('callGemini integration', () => {
  const planner = () =>
    handleAIRequest(post({ task: 'planner', messages: [{ role: 'user', text: 'hi' }], context: {} }));
  const quotaBody = (violation: string) =>
    JSON.stringify({ error: { message: `You exceeded your current quota. ${violation}` } });

  beforeEach(() => {
    vi.stubEnv('ALLOW_ANON', 'true');
    vi.stubEnv('GEMINI_API_KEY', 'server-key');
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('marks models exhausted on daily quota 429s, then makes no fetch', async () => {
    const fetchMock = vi.fn(async () => new Response(quotaBody('GenerateRequestsPerDayPerProjectPerModel'), { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);

    const first = await planner();
    expect(first.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(2); // one per model, no retry on a spent quota

    fetchMock.mockClear();
    const second = await planner();
    expect(second.status).toBe(429);
    expect((await second.json()).error).toContain('usage limit');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips only the exhausted model', async () => {
    markModelExhausted(DEFAULT_MODEL);
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const res = await planner();
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toContain(DEFAULT_FALLBACK_MODEL);
  });

  it('does not mark a model exhausted on a per-minute 429', async () => {
    const fetchMock = vi.fn(async () => new Response(quotaBody('GenerateRequestsPerMinutePerProjectPerModel'), { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await planner();
    expect(res.status).toBe(429);
    expect(isModelExhausted(DEFAULT_MODEL)).toBe(false);
    expect(isModelExhausted(DEFAULT_FALLBACK_MODEL)).toBe(false);
  });
});
