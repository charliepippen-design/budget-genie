// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleAIRequest } from '../../api/_gateway';
import { stripFieldNames } from '../../api/_reply-clean';

const post = (body: unknown) => new Request('http://localhost/api/ai-gateway', { method: 'POST', body: JSON.stringify(body) });
const geminiText = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }));
type Mock = { mock: { calls: unknown[][] } };
const sentBody = (m: Mock) => JSON.parse(String((m.mock.calls[0] as [string, RequestInit])[1].body));

// Eval seed D2: d2-002 (en) and d2-006 (it).
const seedMessages = ['Why is Meta getting so little budget?', 'Quanto rende questo piano tra 6 mesi in termini di LTV?'];

beforeEach(() => {
  vi.stubEnv('ALLOW_ANON', 'true');
  vi.stubEnv('GEMINI_API_KEY', 'server-key');
  vi.stubEnv('AI_NUMBER_GUARD', 'off');
  vi.stubEnv('AI_DECISIONS', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const runPlanner = async (text: string, reply = 'Hello') => {
  const fetchMock = vi.fn(async () => geminiText(reply));
  vi.stubGlobal('fetch', fetchMock);
  const res = await handleAIRequest(post({ task: 'planner', messages: [{ role: 'user', text }], context: {} }));
  return { fetchMock, res };
};

const runJson = async (prompt: string) => {
  const fetchMock = vi.fn(async () => geminiText('{}'));
  vi.stubGlobal('fetch', fetchMock);
  await handleAIRequest(post({ task: 'json', prompt }));
  return sentBody(fetchMock);
};

describe('planner thinking level', () => {
  it.each(seedMessages)('defaults to low (%s)', async (msg) => {
    const { fetchMock } = await runPlanner(msg);
    expect(sentBody(fetchMock).generationConfig).toEqual({ thinkingConfig: { thinkingLevel: 'low' } });
  });

  it('honours AI_PLANNER_THINKING, "default" sends nothing, junk falls back to low', async () => {
    vi.stubEnv('AI_PLANNER_THINKING', 'medium');
    expect(sentBody((await runPlanner(seedMessages[0])).fetchMock).generationConfig.thinkingConfig.thinkingLevel).toBe('medium');
    vi.stubEnv('AI_PLANNER_THINKING', 'default');
    expect(sentBody((await runPlanner(seedMessages[0])).fetchMock)).not.toHaveProperty('generationConfig');
    vi.stubEnv('AI_PLANNER_THINKING', 'bogus');
    expect(sentBody((await runPlanner(seedMessages[1])).fetchMock).generationConfig.thinkingConfig.thinkingLevel).toBe('low');
  });

  it('json task uses AI_JSON_THINKING (default low) and keeps the JSON mime type', async () => {
    expect((await runJson(seedMessages[0])).generationConfig).toEqual({
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingLevel: 'low' },
    });
    vi.stubEnv('AI_JSON_THINKING', 'high');
    expect((await runJson(seedMessages[1])).generationConfig.thinkingConfig.thinkingLevel).toBe('high');
    vi.stubEnv('AI_JSON_THINKING', 'default');
    expect((await runJson(seedMessages[0])).generationConfig).toEqual({ responseMimeType: 'application/json' });
  });

  it('logs timing without content', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    await runPlanner(seedMessages[0]);
    expect(info).toHaveBeenCalledWith('ai_gemini_timing', { model: expect.any(String), ms: expect.any(Number), status: 200, attempt: 0 });
    info.mockRestore();
  });
});

describe('field name leak', () => {
  it('prompt has no parenthesised keys and forbids field names', async () => {
    const { fetchMock } = await runPlanner(seedMessages[0]);
    const prompt: string = sentBody(fetchMock).systemInstruction.parts[0].text;
    expect(prompt).not.toContain('(breakEvenCpa)');
    expect(prompt).not.toContain('(blendedCpa)');
    expect(prompt).toContain('Never write field or key names from PLAN STATE in replies; use plain words.');
  });

  it('regression: a reply echoing (breakEvenCpa) reaches the user without it', async () => {
    const { res } = await runPlanner(seedMessages[0], 'The break-even cost per customer (breakEvenCpa) is €11 vs (`blendedCpa`) €14.');
    expect((await res.json()).text).toBe('The break-even cost per customer is €11 vs €14.');
  });
});

describe('stripFieldNames', () => {
  it('removes parenthesised keys, plain and backticked', () => {
    expect(stripFieldNames('break-even cost per customer (breakEvenCpa) is €11')).toBe('break-even cost per customer is €11');
    expect(stripFieldNames('x (`monthlyContribution`) y (losesMoney) z (netValueBasis) (costPerConversion) (grossValue) (sharePct) (projectedRevenue) w')).toBe('x y z w');
  });

  it('leaves numbers and normal parentheses alone', () => {
    const t = 'Spend €1,234.50 (12.5%) on Google (Licensed) in Canada (CA); ROAS 2.1x.';
    expect(stripFieldNames(t)).toBe(t);
    expect(stripFieldNames(seedMessages[1])).toBe(seedMessages[1]);
  });

  it('keeps newlines and tidies double spaces', () => {
    expect(stripFieldNames('a  (blendedCpa)  b\n\nc')).toBe('a b\n\nc');
  });
});
