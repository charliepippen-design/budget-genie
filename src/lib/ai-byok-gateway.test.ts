// @vitest-environment node
import { inspect } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleAIRequest } from '../../api/_gateway';
import { DEFAULT_FALLBACK_MODEL, DEFAULT_MODEL } from '../../api/_models';
import { __resetQuotaForTests, isModelExhausted, markModelExhausted, withQuotaGuard } from '../../api/_quota';
import { FREE_TURNS_PER_MONTH } from '../../api/_usage';
import { readUserKey, redactKey, upstreamRetryAfter, USER_KEY_HEADER } from '../../api/_user-key';

// Bring your own key: the gateway uses the caller's Gemini key for the request and never keeps it.

let session: { userId: string; claims: Record<string, unknown> } | null = null;
vi.mock('../../api/_auth', () => ({
  verifyClerkSession: async () => session,
  verifyClerkUser: async () => session?.userId ?? null,
}));

const USER_KEY = `AIza${'Ab1_-'.repeat(7)}`; // right shape, not a real key
const SHARED_KEY = 'server-key';

const post = (body: unknown, key?: string) =>
  new Request('http://localhost/api/ai-gateway', {
    method: 'POST',
    headers: key === undefined ? {} : { [USER_KEY_HEADER]: key },
    body: JSON.stringify(body),
  });
const jsonTask = (key?: string, turnId?: string) => handleAIRequest(post({ task: 'json', prompt: 'x', turnId }, key));

const ok = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }));
const sentKeys = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.map(([, init]) => ((init as RequestInit).headers as Record<string, string>)['x-goog-api-key']);

let logs: unknown[][];

beforeEach(() => {
  __resetQuotaForTests();
  session = { userId: `user_${Math.random().toString(36).slice(2)}`, claims: { metadata: {} } }; // free plan
  for (const k of ['ALLOW_ANON', 'CLERK_SECRET_KEY', 'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'GEMINI_MODEL', 'GEMINI_FALLBACK_MODEL']) {
    vi.stubEnv(k, '');
  }
  vi.stubEnv('GEMINI_API_KEY', SHARED_KEY);
  logs = [];
  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void logs.push(args));
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('which key is sent to Google', () => {
  it('uses the user key for every upstream call of the request, including the fallback model', async () => {
    const fetchMock = vi.fn().mockImplementationOnce(async () => new Response('bad request', { status: 400 })).mockImplementation(async () => ok());
    vi.stubGlobal('fetch', fetchMock);

    const res = await jsonTask(USER_KEY);
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentKeys(fetchMock)).toEqual([USER_KEY, USER_KEY]);
    for (const [url] of fetchMock.mock.calls) expect(url).not.toContain(USER_KEY);
  });

  it('uses the shared key when no user key is sent', async () => {
    const fetchMock = vi.fn(async () => ok());
    vi.stubGlobal('fetch', fetchMock);
    expect((await jsonTask()).status).toBe(200);
    expect(sentKeys(fetchMock)).toEqual([SHARED_KEY]);
  });

  it('works with a user key when the site has no shared key at all', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    const fetchMock = vi.fn(async () => ok());
    vi.stubGlobal('fetch', fetchMock);
    expect((await jsonTask(USER_KEY)).status).toBe(200);
    expect(sentKeys(fetchMock)).toEqual([USER_KEY]);
  });
});

describe('header validation', () => {
  it.each([
    ['empty', ''],
    ['too short', 'AIzaShort'],
    ['one character too long', `${USER_KEY}x`],
    ['oversized', `AIza${'a'.repeat(5000)}`],
    ['wrong prefix', `BIza${'Ab1_-'.repeat(7)}`],
    ['not URL-safe', `AIza${'Ab1/+'.repeat(7)}`],
    ['two values', `${USER_KEY}, ${USER_KEY}`],
  ])('refuses a malformed key (%s) with 400 and makes no upstream call', async (_name, value) => {
    const fetchMock = vi.fn(async () => ok());
    vi.stubGlobal('fetch', fetchMock);
    const res = await jsonTask(value);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe('user_key_malformed');
    expect(data.error).toMatch(/Gemini API key/);
    expect(JSON.stringify(data)).not.toContain(value || 'never-empty');
    expect(fetchMock).not.toHaveBeenCalled(); // never falls back to the shared key
  });

  it('accepts a well-formed key and treats a missing header as "no key"', () => {
    const req = (key?: string) => new Request('http://x', { headers: key === undefined ? {} : { [USER_KEY_HEADER]: key } });
    expect(readUserKey(req())).toEqual({ ok: true, key: null });
    expect(readUserKey(req(USER_KEY))).toEqual({ ok: true, key: USER_KEY });
    expect(readUserKey(req('nope')).ok).toBe(false);
  });
});

describe('guards that stay on with a user key', () => {
  it('still requires a signed-in user', async () => {
    session = null;
    const fetchMock = vi.fn(async () => ok());
    vi.stubGlobal('fetch', fetchMock);
    const res = await jsonTask(USER_KEY);
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the per-user rate guard', async () => {
    vi.stubEnv('AI_QUOTA_USER_DAILY', '1');
    vi.stubGlobal('fetch', vi.fn(async () => ok()));
    const guarded = withQuotaGuard(handleAIRequest);
    expect((await guarded(post({ task: 'json', prompt: 'x' }, USER_KEY))).status).toBe(200);
    const second = await guarded(post({ task: 'json', prompt: 'x' }, USER_KEY));
    expect(second.status).toBe(429);
    expect((await second.json()).code).toBe('AI_DAILY_LIMIT');
  });

  it('keeps the request-size limits', async () => {
    const fetchMock = vi.fn(async () => ok());
    vi.stubGlobal('fetch', fetchMock);
    await handleAIRequest(post({ task: 'json', prompt: 'p'.repeat(30000) }, USER_KEY));
    const sent = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(sent.contents[0].parts[0].text).toHaveLength(20000);
  });
});

describe('free-tier cap', () => {
  it('is not consumed and not enforced with a user key', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok()));
    const turn = (i: number | string) => `byok-turn-${i}-abcdef`;

    // More turns than the monthly cap, all on the user's key.
    for (let i = 0; i < FREE_TURNS_PER_MONTH + 3; i++) expect((await jsonTask(USER_KEY, turn(`own-${i}`))).status).toBe(200);

    // None of them counted: the shared trial still has all its turns.
    for (let i = 0; i < FREE_TURNS_PER_MONTH; i++) expect((await jsonTask(undefined, turn(i))).status).toBe(200);
    const over = await jsonTask(undefined, turn('over'));
    expect(over.status).toBe(429);
    expect((await over.json()).code).toBe('FREE_TIER_LIMIT');

    // A spent trial does not block the user's own key.
    expect((await jsonTask(USER_KEY, turn('after'))).status).toBe(200);
  });
});

describe('shared-key "model exhausted" memo', () => {
  const dailyQuota = () =>
    new Response(JSON.stringify({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'You exceeded your current quota. GenerateRequestsPerDayPerProjectPerModel' } }), { status: 429 });

  it("a user key's 429 does not mark the shared key exhausted", async () => {
    const fetchMock = vi.fn(async () => dailyQuota());
    vi.stubGlobal('fetch', fetchMock);
    const res = await jsonTask(USER_KEY);
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe('user_key_quota');
    expect(isModelExhausted(DEFAULT_MODEL)).toBe(false);
    expect(isModelExhausted(DEFAULT_FALLBACK_MODEL)).toBe(false);

    // The shared key is still tried afterwards.
    fetchMock.mockImplementation(async () => ok());
    fetchMock.mockClear();
    expect((await jsonTask()).status).toBe(200);
    expect(sentKeys(fetchMock)).toEqual([SHARED_KEY]);
  });

  it('an exhausted shared key does not block a user key', async () => {
    markModelExhausted(DEFAULT_MODEL);
    markModelExhausted(DEFAULT_FALLBACK_MODEL);
    const fetchMock = vi.fn(async () => ok());
    vi.stubGlobal('fetch', fetchMock);

    const shared = await jsonTask();
    expect(shared.status).toBe(429);
    expect((await shared.json()).code).toBe('AI_RATE_LIMITED');
    expect(fetchMock).not.toHaveBeenCalled();

    const own = await jsonTask(USER_KEY);
    expect(own.status).toBe(200);
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toContain(DEFAULT_MODEL); // primary model, not skipped
    expect(sentKeys(fetchMock)).toEqual([USER_KEY]);
  });
});

describe("Google's errors for a user key", () => {
  const googleError = (status: number, body: Record<string, unknown>, headers: Record<string, string> = {}) =>
    vi.fn(async () => new Response(JSON.stringify({ error: { code: status, ...body } }), { status, headers }));

  it('400 API_KEY_INVALID -> user_key_invalid, after a single upstream call', async () => {
    const fetchMock = googleError(400, {
      status: 'INVALID_ARGUMENT',
      message: 'API key not valid. Please pass a valid API key.',
      details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_INVALID' }],
    });
    vi.stubGlobal('fetch', fetchMock);
    const res = await jsonTask(USER_KEY);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.code).toBe('user_key_invalid');
    expect(data.error).toMatch(/Google rejected your Gemini key/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('403 PERMISSION_DENIED -> user_key_invalid', async () => {
    vi.stubGlobal('fetch', googleError(403, { status: 'PERMISSION_DENIED', message: 'Your API key was reported as leaked.' }));
    const res = await jsonTask(USER_KEY);
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('user_key_invalid');
  });

  it('a plain 400 (bad request, not the key) is not blamed on the key', async () => {
    vi.stubGlobal('fetch', googleError(400, { status: 'INVALID_ARGUMENT', message: 'Invalid JSON payload received.' }));
    const res = await jsonTask(USER_KEY);
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('AI_BUSY');
  });

  it('429 -> user_key_quota with the wait Google gives (RetryInfo)', async () => {
    const fetchMock = googleError(429, {
      status: 'RESOURCE_EXHAUSTED',
      message: 'You exceeded your current quota.',
      details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '34s' }],
    });
    vi.stubGlobal('fetch', fetchMock);
    const res = await jsonTask(USER_KEY);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('34');
    const data = await res.json();
    expect(data).toMatchObject({ code: 'user_key_quota', retryAfterSeconds: 34 });
    expect(data.error).toMatch(/Your Gemini key has reached its Google quota/);
    expect(fetchMock).toHaveBeenCalledTimes(2); // one per model, no retry on the same model
  });

  it('429 -> user_key_quota honours a Retry-After header, and sends none when Google gives none', async () => {
    vi.stubGlobal('fetch', googleError(429, { status: 'RESOURCE_EXHAUSTED', message: 'quota' }, { 'Retry-After': '12' }));
    expect((await jsonTask(USER_KEY)).headers.get('Retry-After')).toBe('12');

    vi.stubGlobal('fetch', googleError(429, { status: 'RESOURCE_EXHAUSTED', message: 'quota' }));
    const bare = await jsonTask(USER_KEY);
    expect(bare.headers.get('Retry-After')).toBeNull();
    expect((await bare.json()).code).toBe('user_key_quota');
  });

  it('404 on every model -> user_key_model', async () => {
    const fetchMock = googleError(404, { status: 'NOT_FOUND', message: 'models/x is not found for API version v1beta' });
    vi.stubGlobal('fetch', fetchMock);
    const res = await jsonTask(USER_KEY);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe('user_key_model');
    expect(data.error).toMatch(/cannot use the AI model/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('404 on the primary model only: the fallback answers', async () => {
    const fetchMock = vi.fn().mockImplementationOnce(async () => new Response('{}', { status: 404 })).mockImplementation(async () => ok());
    vi.stubGlobal('fetch', fetchMock);
    expect((await jsonTask(USER_KEY)).status).toBe(200);
  });

  it('the shared key keeps its own messages (no user_key codes)', async () => {
    vi.stubGlobal('fetch', googleError(403, { status: 'PERMISSION_DENIED', message: 'denied' }));
    const res = await jsonTask();
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBeUndefined();
  });

  it('reads the retry delay from the header first, then the body', () => {
    expect(upstreamRetryAfter('7', '"retryDelay": "34s"')).toBe(7);
    expect(upstreamRetryAfter(null, '{"retryDelay":"34.2s"}')).toBe(35);
    expect(upstreamRetryAfter(null, '"retryDelay": "86400s"')).toBe(3600);
    expect(upstreamRetryAfter(null, 'no hint')).toBeUndefined();
    expect(upstreamRetryAfter('Wed, 21 Oct 2026 07:28:00 GMT', '')).toBeUndefined();
  });
});

describe('the key never leaves the request', () => {
  /** Everything written to the console during the test, as one string. */
  const logged = () => logs.map((args) => args.map((a) => (typeof a === 'string' ? a : inspect(a, { depth: 10 }))).join(' ')).join('\n');
  const exposed = async (res: Response) => `${await res.text()}\n${JSON.stringify([...res.headers.entries()])}`;

  it('is absent from logs and responses on success and on every error path, even when Google echoes it', async () => {
    const echo = (status: number, extra = '') =>
      new Response(JSON.stringify({ error: { code: status, message: `API key ${USER_KEY} rejected ${extra}`, key: USER_KEY } }), { status });
    const scenarios: Array<() => Promise<Response>> = [
      async () => ok(),
      async () => echo(400, 'API_KEY_INVALID'),
      async () => echo(400),
      async () => echo(403),
      async () => echo(404),
      async () => echo(429, 'quota'),
      async () => {
        throw new Error(`connect failed for key ${USER_KEY}`);
      },
    ];

    let out = '';
    for (const scenario of scenarios) {
      vi.stubGlobal('fetch', vi.fn(scenario));
      out += await exposed(await jsonTask(USER_KEY));
      out += await exposed(await handleAIRequest(post({ task: 'planner', messages: [{ role: 'user', text: 'hi' }], context: {} }, USER_KEY)));
    }
    out += await exposed(await jsonTask(`${USER_KEY}x`)); // malformed: refused without echoing it

    expect(logs.length).toBeGreaterThan(scenarios.length); // the timing and failure logs did run
    expect(logged()).not.toContain(USER_KEY);
    expect(logged()).toContain('[user key]'); // echoed keys were redacted, not dropped by luck
    expect(out).not.toContain(USER_KEY);
    expect(logged()).not.toContain(USER_KEY.slice(4, 24)); // no partial key either
  });

  it('redactKey removes every occurrence and leaves other text alone', () => {
    expect(redactKey(`a ${USER_KEY} b ${USER_KEY}`, USER_KEY)).toBe('a [user key] b [user key]');
    expect(redactKey('nothing here', USER_KEY)).toBe('nothing here');
    expect(redactKey('shared path', null)).toBe('shared path');
  });
});
