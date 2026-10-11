// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FREE_TURNS_PER_MONTH,
  MAX_REQUESTS_PER_TURN,
  admitRequest,
  evaluateUsage,
  kvStore,
  normalizeTurnId,
  planFromClaims,
  planFromMetadata,
  resolvePlan,
  selectStore,
  type UsageRecord,
  type UsageStore,
} from '../../api/_usage';
import { handleAIRequest } from '../../api/_gateway';

let sessionClaims: Record<string, unknown> = {};
vi.mock('../../api/_auth', () => ({
  verifyClerkSession: async () => ({ userId: 'user_gateway', claims: sessionClaims }),
}));

const OCT = new Date('2026-10-11T12:00:00Z');
const NOV = new Date('2026-11-01T00:00:00Z');

function fakeStore(initial: UsageRecord | null = null, opts: { failLoad?: boolean; failSave?: boolean } = {}) {
  let record = initial;
  const store: UsageStore = {
    name: 'fake',
    persistent: true,
    async load() {
      if (opts.failLoad) throw new Error('boom');
      return record;
    },
    async save(_id, r) {
      if (opts.failSave) throw new Error('boom');
      record = r;
    },
  };
  return { store, get: () => record };
}

const free = async () => 'free' as const;
const paid = async () => 'paid' as const;

async function sendTurn(store: UsageStore, turnId: string | undefined, now = OCT) {
  const res = await admitRequest('user_1', {}, turnId, { store, now, resolve: free });
  if (res.ok) await res.commit();
  return res;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('evaluateUsage', () => {
  it('counts a new turn and allows up to the limit', () => {
    let rec: UsageRecord | null = null;
    for (let i = 0; i < FREE_TURNS_PER_MONTH; i++) {
      const c = evaluateUsage(rec, `turn-${i}-abcdef`, OCT);
      expect(c.allowed).toBe(true);
      expect(c.used).toBe(i + 1);
      rec = c.next;
    }
    const over = evaluateUsage(rec, 'turn-new-abcdef', OCT);
    expect(over.allowed).toBe(false);
    expect(over.next).toBeNull();
  });

  it('counts a multi-request turn once', () => {
    let rec: UsageRecord | null = null;
    for (let i = 0; i < 4; i++) rec = evaluateUsage(rec, 'same-turn-id', OCT).next;
    expect(Object.keys(rec!.turns)).toHaveLength(1);
    expect(rec!.turns['same-turn-id']).toBe(4);
  });

  it('lets an already counted turn finish when the cap is reached', () => {
    let rec: UsageRecord | null = null;
    for (let i = 0; i < FREE_TURNS_PER_MONTH; i++) rec = evaluateUsage(rec, `turn-${i}-abcdef`, OCT).next;
    expect(evaluateUsage(rec, 'turn-3-abcdef', OCT).allowed).toBe(true);
  });

  it('stops a turnId from being reused without bound', () => {
    let rec: UsageRecord | null = null;
    for (let i = 0; i < MAX_REQUESTS_PER_TURN; i++) rec = evaluateUsage(rec, 'looping-turn', OCT).next;
    expect(evaluateUsage(rec, 'looping-turn', OCT).allowed).toBe(false);
  });

  it('treats requests without a turnId as separate turns', () => {
    let rec: UsageRecord | null = null;
    for (let i = 0; i < FREE_TURNS_PER_MONTH; i++) rec = evaluateUsage(rec, null, OCT).next;
    expect(Object.keys(rec!.turns)).toHaveLength(FREE_TURNS_PER_MONTH);
    expect(evaluateUsage(rec, null, OCT).allowed).toBe(false);
  });

  it('resets on a new UTC month', () => {
    let rec: UsageRecord | null = null;
    for (let i = 0; i < FREE_TURNS_PER_MONTH; i++) rec = evaluateUsage(rec, `turn-${i}-abcdef`, OCT).next;
    expect(evaluateUsage(rec, 'another-turn-1', OCT).allowed).toBe(false);
    const next = evaluateUsage(rec, 'another-turn-1', NOV);
    expect(next.allowed).toBe(true);
    expect(next.next).toMatchObject({ month: '2026-11' });
    expect(Object.keys(next.next!.turns)).toEqual(['another-turn-1']);
  });

  it('uses UTC month boundaries', () => {
    const lastMoment = new Date('2026-10-31T23:59:59Z');
    expect(evaluateUsage(null, 'abcdefgh', lastMoment).next?.month).toBe('2026-10');
  });
});

describe('normalizeTurnId', () => {
  it('accepts uuid-like ids and rejects junk', () => {
    expect(normalizeTurnId('3f2b8c1e-aaaa-4bbb-8ccc-1234567890ab')).not.toBeNull();
    expect(normalizeTurnId('short')).toBeNull();
    expect(normalizeTurnId('has spaces in it!')).toBeNull();
    expect(normalizeTurnId(42)).toBeNull();
    expect(normalizeTurnId('x'.repeat(65))).toBeNull();
  });
});

describe('plan detection', () => {
  it('matches the frontend rules', () => {
    expect(planFromMetadata({ payment_status: true })).toBe('paid');
    expect(planFromMetadata({ payment_status: 'true' })).toBe('paid');
    expect(planFromMetadata({ is_superuser: true })).toBe('paid');
    expect(planFromMetadata({ role: 'superuser' })).toBe('paid');
    expect(planFromMetadata({})).toBe('free');
    expect(planFromMetadata({ payment_status: false })).toBe('free');
    expect(planFromMetadata(undefined)).toBe('unknown');
  });

  it('reads session-token claims only when present', () => {
    expect(planFromClaims({ sub: 'u' })).toBe('unknown');
    expect(planFromClaims({ metadata: { payment_status: true } })).toBe('paid');
    expect(planFromClaims({ public_metadata: {} })).toBe('free');
  });
});

describe('admitRequest', () => {
  it('enforces the cap for free users with 429 FREE_TIER_LIMIT', async () => {
    const { store } = fakeStore();
    for (let i = 0; i < FREE_TURNS_PER_MONTH; i++) {
      expect((await sendTurn(store, `turn-${i}-abcdef`)).ok).toBe(true);
    }
    const res = await sendTurn(store, 'turn-over-abcd');
    expect(res).toMatchObject({ ok: false, status: 429, code: 'FREE_TIER_LIMIT', limit: FREE_TURNS_PER_MONTH });
  });

  it('counts a multi-request turn once through admit/commit', async () => {
    const { store, get } = fakeStore();
    for (let i = 0; i < 4; i++) await sendTurn(store, 'one-chat-message');
    expect(Object.keys(get()!.turns)).toHaveLength(1);
  });

  it('does not burn a turn when the request fails before commit', async () => {
    const { store, get } = fakeStore();
    const res = await admitRequest('user_1', {}, 'failed-turn-id', { store, now: OCT, resolve: free });
    expect(res.ok).toBe(true); // model call fails, commit() never runs
    expect(get()).toBeNull();
  });

  it('does not limit paid users or superusers, and never touches the store', async () => {
    const { store } = fakeStore({
      month: '2026-10',
      turns: Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`t${i}`, 1])),
    });
    const spy = vi.spyOn(store, 'load');
    const res = await admitRequest('user_1', {}, 'new-turn-id', { store, now: OCT, resolve: paid });
    expect(res.ok).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it('does not enforce when the plan is unknown', async () => {
    const { store } = fakeStore();
    const res = await admitRequest('user_1', {}, 'new-turn-id', { store, now: OCT, resolve: async () => 'unknown' });
    expect(res.ok).toBe(true);
  });

  it('skips the cap for the local-dev anonymous user', async () => {
    const res = await admitRequest('anonymous', {}, 'new-turn-id', { store: fakeStore().store, resolve: free });
    expect(res.ok).toBe(true);
  });

  it('fails closed with 503 for free users when the store read fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { store } = fakeStore(null, { failLoad: true });
    const res = await sendTurn(store, 'new-turn-id');
    expect(res).toMatchObject({ ok: false, status: 503, code: 'USAGE_UNAVAILABLE' });
  });

  it('still serves the user when only the store write fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { store } = fakeStore(null, { failSave: true });
    const res = await admitRequest('user_1', {}, 'new-turn-id', { store, now: OCT, resolve: free });
    expect(res.ok).toBe(true);
    if (res.ok) await expect(res.commit()).resolves.toBeUndefined();
  });

  it('resets after a month rollover', async () => {
    const { store } = fakeStore();
    for (let i = 0; i < FREE_TURNS_PER_MONTH; i++) await sendTurn(store, `turn-${i}-abcdef`);
    expect((await sendTurn(store, 'turn-over-abcd')).ok).toBe(false);
    expect((await sendTurn(store, 'turn-over-abcd', NOV)).ok).toBe(true);
  });
});

describe('store selection', () => {
  const clear = () => {
    for (const k of ['CLERK_SECRET_KEY', 'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']) {
      vi.stubEnv(k, '');
    }
  };

  it('falls back to memory when nothing is configured', () => {
    clear();
    const s = selectStore();
    expect(s.name).toBe('memory');
    expect(s.persistent).toBe(false);
  });

  it('prefers Clerk, then KV/Upstash', () => {
    clear();
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://u.example');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 't');
    expect(selectStore().name).toBe('kv-rest');
    vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_x');
    expect(selectStore().name).toBe('clerk-private-metadata');
  });

  it('KV adapter round-trips through the REST API', async () => {
    let stored: string | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const cmd = JSON.parse(String(init.body)) as string[];
        if (cmd[0] === 'SET') stored = cmd[2];
        return new Response(JSON.stringify({ result: cmd[0] === 'GET' ? stored : 'OK' }));
      })
    );
    const kv = kvStore('https://kv.example', 'tok');
    expect(await kv.load('u1')).toBeNull();
    await kv.save('u1', { month: '2026-10', turns: { a: 1 } });
    expect(await kv.load('u1')).toEqual({ month: '2026-10', turns: { a: 1 } });
  });
});

describe('gateway integration (free user, in-memory store)', () => {
  it('returns 429 FREE_TIER_LIMIT after 10 turns, counting multi-request turns once', async () => {
    for (const k of ['CLERK_SECRET_KEY', 'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']) {
      vi.stubEnv(k, '');
    }
    vi.stubEnv('GEMINI_API_KEY', 'server-key');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'hi' }] } }] })))
    );
    sessionClaims = { metadata: {} }; // session token exposes publicMetadata, no payment => free

    const post = (turnId: string) =>
      handleAIRequest(
        new Request('http://localhost/api/ai-gateway', {
          method: 'POST',
          body: JSON.stringify({ task: 'planner', turnId, messages: [{ role: 'user', text: 'hi' }], context: {} }),
        })
      );

    for (let i = 0; i < FREE_TURNS_PER_MONTH; i++) {
      // two round trips per turn
      expect((await post(`gw-turn-${i}-abcdef`)).status).toBe(200);
      expect((await post(`gw-turn-${i}-abcdef`)).status).toBe(200);
    }
    const res = await post('gw-turn-over-abcdef');
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ code: 'FREE_TIER_LIMIT', limit: FREE_TURNS_PER_MONTH });

    sessionClaims = { metadata: { payment_status: true } };
    expect((await post('gw-turn-paid-abcdef')).status).toBe(200);
  });
});

describe('resolvePlan', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('treats a caller with no paid signal and no Clerk secret as free (cap enforced)', async () => {
    vi.stubEnv('CLERK_SECRET_KEY', '');
    vi.stubEnv('ALLOW_ANON', '');
    expect(await resolvePlan({ sub: 'user_1' }, 'user_1')).toBe('free');
  });

  it('honours paid / superuser session-token claims', async () => {
    vi.stubEnv('CLERK_SECRET_KEY', '');
    expect(await resolvePlan({ public_metadata: { role: 'superuser' } }, 'user_1')).toBe('paid');
  });

  it('does not cap the local-dev anonymous user', async () => {
    vi.stubEnv('ALLOW_ANON', 'true');
    expect(await resolvePlan({}, 'anonymous')).toBe('unknown');
  });
});
