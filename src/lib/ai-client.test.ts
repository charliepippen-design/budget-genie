import { describe, expect, it } from 'vitest';
import { normalizeAIResponse } from './ai-client';

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
