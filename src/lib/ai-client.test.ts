import { afterEach, describe, expect, it, vi } from 'vitest';
import { AIError, aiErrorKind, aiErrorMessage, callAI, normalizeAIResponse, parseRetryAfter } from './ai-client';

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
    expect(aiErrorMessage(new AIError('Limit reached', 'FREE_TIER_LIMIT', 402))).toBe('Limit reached');
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
