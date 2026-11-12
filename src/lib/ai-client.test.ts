import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AIError,
  SHARED_TRIAL_LIMIT_MESSAGE,
  aiErrorKind,
  aiErrorMessage,
  callAI,
  isSharedTrialLimit,
  isUserKeyError,
  normalizeAIResponse,
  parseRetryAfter,
} from './ai-client';
import { USER_AI_KEY_HEADER, USER_AI_KEY_STORAGE } from './user-ai-key';

describe('AI error kinds', () => {
  it('classifies gateway failures', () => {
    expect(new AIError('x', 'FREE_TIER_LIMIT', 402).kind).toBe('free_tier_limit');
    expect(new AIError('x', 'AI_BUSY', 503).kind).toBe('busy');
    expect(new AIError('x', undefined, 429).kind).toBe('rate_limited');
    expect(new AIError('x', 'AI_RATE_LIMITED', 429).kind).toBe('rate_limited');
    expect(new AIError('x', undefined, 503).kind).toBe('unavailable');
    expect(new AIError('x', undefined, 500).kind).toBe('generic');
    expect(aiErrorKind(new Error('x'))).toBe('generic');
  });

  it('writes plain messages per kind', () => {
    expect(aiErrorMessage(new AIError('raw', 'AI_BUSY', 503, 30))).toBe('The AI is busy, try again in 30 seconds.');
    expect(aiErrorMessage(new AIError('raw', 'AI_BUSY', 503))).toBe('The AI is busy, try again in a moment.');
    expect(aiErrorMessage(new AIError('raw', undefined, 429, 1))).toBe('Too many AI requests right now, try again in 1 second.');
    expect(aiErrorMessage(new AIError('raw', undefined, 503))).toMatch(/unavailable right now/);
    expect(aiErrorMessage(new AIError('Sign in to use the AI planner.', undefined, 401))).toBe('Sign in to use the AI planner.');
    expect(aiErrorMessage(new AIError('Limit reached', 'FREE_TIER_LIMIT', 402))).toBe(SHARED_TRIAL_LIMIT_MESSAGE);
  });

  it('never shows a raw server error string for an HTTP 500', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const raw = 'GoogleGenerativeAI Error: upstream connect error at fetchWithRetry (/var/task/api/_gateway.js:61:13)';
    const message = aiErrorMessage(new AIError(raw, undefined, 500));
    expect(message).toBe('The AI could not answer just now. Your plan is unchanged. Please try again.');
    expect(aiErrorKind(new AIError(raw, undefined, 500))).toBe('generic'); // generic errors keep the Retry button
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it('parses Retry-After', () => {
    expect(parseRetryAfter('12')).toBe(12);
    expect(parseRetryAfter(null, 7.2)).toBe(8);
    expect(parseRetryAfter('abc')).toBeUndefined();
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter('99999')).toBe(3600);
  });
});

describe('callAI failures', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('carries code, status and Retry-After on the thrown error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'busy', code: 'AI_BUSY' }), { status: 503, headers: { 'Retry-After': '45' } }))
    );
    const err = await callAI('planner', {}, 't').catch((e) => e);
    expect(err).toBeInstanceOf(AIError);
    expect(err).toMatchObject({ code: 'AI_BUSY', status: 503, retryAfterSeconds: 45 });
    expect(aiErrorMessage(err)).toBe('The AI is busy, try again in 45 seconds.');
  });
});

describe('own Gemini key (BYOK)', () => {
  const KEY = `AIza${'Ab1_-'.repeat(7)}`;
  const OTHER = `AIza${'Zy9-_'.repeat(7)}`;
  const okFetch = () => vi.fn(async () => new Response(JSON.stringify({ text: '{}', toolCalls: [], raw: [] })));
  const sent = (fetchMock: ReturnType<typeof okFetch>, call = 0) => {
    const [url, init] = fetchMock.mock.calls[call] as unknown as [string, { headers: Record<string, string> }];
    return { url, headers: init.headers };
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('adds the header only when a key is saved, and only to our gateway', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    await callAI('json', { prompt: 'x' }, 't');
    expect(sent(fetchMock).headers).not.toHaveProperty(USER_AI_KEY_HEADER);

    localStorage.setItem(USER_AI_KEY_STORAGE, KEY);
    await callAI('json', { prompt: 'x' }, 't');
    expect(sent(fetchMock, 1).url).toBe('/api/ai-gateway');
    expect(sent(fetchMock, 1).headers[USER_AI_KEY_HEADER]).toBe(KEY);
    expect(JSON.stringify(fetchMock.mock.calls[1]).split(KEY)).toHaveLength(2); // in the header, nowhere else (not the body)

    localStorage.removeItem(USER_AI_KEY_STORAGE);
    await callAI('json', { prompt: 'x' }, 't');
    expect(sent(fetchMock, 2).headers).not.toHaveProperty(USER_AI_KEY_HEADER);
  });

  it('never sends a stored value of the wrong shape', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);
    localStorage.setItem(USER_AI_KEY_STORAGE, 'gar bage');
    await callAI('json', { prompt: 'x' }, 't');
    expect(sent(fetchMock).headers).not.toHaveProperty(USER_AI_KEY_HEADER);
  });

  it('a candidate key passed for one call wins over the saved one and is not saved', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);
    localStorage.setItem(USER_AI_KEY_STORAGE, KEY);
    await callAI('json', { prompt: 'x' }, 't', { userKey: OTHER });
    expect(sent(fetchMock).headers[USER_AI_KEY_HEADER]).toBe(OTHER);
    expect(localStorage.getItem(USER_AI_KEY_STORAGE)).toBe(KEY);
  });

  it('classifies the shared-trial limits and the user-key errors', () => {
    expect(isSharedTrialLimit(new AIError('x', 'FREE_TIER_LIMIT', 429))).toBe(true);
    expect(isSharedTrialLimit(new AIError('x', 'AI_RATE_LIMITED', 429))).toBe(true);
    expect(isSharedTrialLimit(new AIError('x', 'AI_DAILY_LIMIT', 429))).toBe(false); // per-user guard, a key does not lift it
    expect(isSharedTrialLimit(new AIError('x', 'AI_BUSY', 503))).toBe(false);
    expect(isSharedTrialLimit(new AIError('x', 'user_key_quota', 429))).toBe(false);

    expect(new AIError('x', 'user_key_invalid', 403).kind).toBe('user_key_invalid');
    expect(new AIError('x', 'user_key_malformed', 400).kind).toBe('user_key_invalid');
    expect(new AIError('x', 'user_key_quota', 429).kind).toBe('user_key_quota'); // not the generic 429 "rate_limited"
    expect(new AIError('x', 'user_key_model', 400).kind).toBe('user_key_model');
    expect(isUserKeyError(new AIError('x', 'user_key_quota', 429))).toBe(true);
    expect(isUserKeyError(new AIError('x', 'AI_RATE_LIMITED', 429))).toBe(false);
    expect(isUserKeyError(new Error('x'))).toBe(false);
  });

  it('writes the BYOK message for shared limits and the precise one for the user key', () => {
    expect(SHARED_TRIAL_LIMIT_MESSAGE).toBe('The shared AI trial has reached its limit. Connect your own free Gemini key to keep going.');
    expect(aiErrorMessage(new AIError('server text', 'AI_RATE_LIMITED', 429, 30))).toBe(SHARED_TRIAL_LIMIT_MESSAGE);
    expect(aiErrorMessage(new AIError('Upgrade for unlimited AI planning.', 'FREE_TIER_LIMIT', 429))).not.toMatch(/upgrade/i);

    expect(aiErrorMessage(new AIError('Google rejected your Gemini key.', 'user_key_invalid', 403))).toBe('Google rejected your Gemini key.');
    expect(aiErrorMessage(new AIError('Your key cannot use the model.', 'user_key_model', 400))).toBe('Your key cannot use the model.');
    expect(aiErrorMessage(new AIError('Your Gemini key has reached its Google quota.', 'user_key_quota', 429))).toBe(
      'Your Gemini key has reached its Google quota.'
    );
    expect(aiErrorMessage(new AIError('raw', 'user_key_quota', 429, 34))).toBe(
      'Your Gemini key has reached its Google quota. Try again in 34 seconds, or enable billing on your Google account for more.'
    );
  });
});

describe('normalizeAIResponse', () => {
  it('keeps a well-formed response', () => {
    const r = normalizeAIResponse({
      text: 'hi',
      toolCalls: [{ id: 'a', name: 'update_brief', args: { monthlyBudget: 5 } }],
      raw: [{ text: 'x' }],
    });
    expect(r).toEqual({
      text: 'hi',
      toolCalls: [{ id: 'a', name: 'update_brief', args: { monthlyBudget: 5 } }],
      raw: [{ text: 'x' }],
    });
  });

  it('turns malformed fields into empty values', () => {
    expect(normalizeAIResponse({ text: { a: 1 }, toolCalls: 'nope', raw: 7 })).toEqual({ text: '', toolCalls: [], raw: [] });
    expect(normalizeAIResponse(null)).toEqual({ text: '', toolCalls: [], raw: [] });
    expect(normalizeAIResponse('str')).toEqual({ text: '', toolCalls: [], raw: [] });
    expect(normalizeAIResponse([])).toEqual({ text: '', toolCalls: [], raw: [] });
  });

  it('drops bad entries and defaults args', () => {
    const r = normalizeAIResponse({
      toolCalls: [null, 3, { args: {} }, { name: 'set_share', args: 'x' }, { name: 5 }],
      raw: [null, 'x', { ok: true }],
    });
    expect(r.toolCalls).toEqual([{ name: 'set_share', args: {} }]);
    expect(r.raw).toEqual([{ ok: true }]);
  });
});
