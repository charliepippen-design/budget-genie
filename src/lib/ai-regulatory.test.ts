// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleAIRequest } from '../../api/_gateway';
import { mentionsRegulation, REGULATORY_DISCLAIMER } from '../../api/_regulatory';

// Eval seed D1 business descriptions (.seed.jsonl d1-001, d1-002, d1-004, d1-008).
const SEED = {
  'd1-001': 'We run an affiliate site comparing sportsbooks in Germany and Austria',
  'd1-002': 'Exchange di criptovalute con app mobile per utenti retail',
  'd1-004': 'Prop trading firm selling funded-account challenges',
  'd1-008': 'Online casino and live dealer games licensed in Malta',
};

const SCREENSHOT_REPLY =
  'Canada / Ontario (CA) | 35% | Strong market, but operators require AGCO approval for paid ads.\n' +
  'Germany (DE) | 25% | GGL regulatory restrictions apply.';

function mockReply(text: string) {
  vi.stubEnv('ALLOW_ANON', 'true');
  vi.stubEnv('GEMINI_API_KEY', 'server-key');
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] })));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function ask(userText: string, ctx: Record<string, unknown> = {}) {
  const res = await handleAIRequest(
    new Request('http://localhost/api/ai-gateway', {
      method: 'POST',
      body: JSON.stringify({ task: 'planner', messages: [{ role: 'user', text: userText }], context: ctx }),
    })
  );
  return res.json();
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('mentionsRegulation', () => {
  it.each([
    'You need a UKGC licence.',
    'AGCO approval is required in Ontario.',
    'iGaming Ontario rules apply.',
    'GGL restrictions apply in Germany.',
    'Die Glücksspielbehörde prüft das.',
    'Serve una licenza della Malta MGA.',
    'Check the regulator first.',
    'Il regolatore ha cambiato le regole.',
    'Gambling advertising rules differ by country.',
    'BaFin and CONSOB supervise this.',
  ])('detects: %s', (t) => expect(mentionsRegulation(t)).toBe(true));

  it.each([
    'Google Search gets 40% of the budget.',
    'Meta has a higher CPA than expected.',
    'Il budget mensile è di 50k.',
    'Search ads in a second pass.',
  ])('ignores: %s', (t) => expect(mentionsRegulation(t)).toBe(false));

  it('flags assistant replies built from seed D1 contexts', () => {
    expect(mentionsRegulation(`For "${SEED['d1-008']}", keep your licence details ready for ad platforms.`)).toBe(true);
    expect(mentionsRegulation(`For "${SEED['d1-001']}", the GGL and Austrian regulator may restrict ads.`)).toBe(true);
    expect(mentionsRegulation(`For "${SEED['d1-004']}", the FCA and ESMA limit promotions.`)).toBe(true);
    expect(mentionsRegulation(`Per "${SEED['d1-002']}", la CONSOB vigila sulle promozioni.`)).toBe(true);
    expect(mentionsRegulation(`Allocation for "${SEED['d1-004']}": Google Search 40%.`)).toBe(false);
  });
});

describe('planner regulatory disclaimer', () => {
  it('regression: screenshot reply with AGCO/GGL claims gets the EN disclaimer', async () => {
    mockReply(SCREENSHOT_REPLY);
    const data = await ask('Which markets should I enter?', { brief: { industry: 'igaming', description: SEED['d1-008'] } });
    expect(data.text.endsWith(REGULATORY_DISCLAIMER.en)).toBe(true);
    expect(data.text.startsWith(SCREENSHOT_REPLY)).toBe(true);
  });

  it('uses the IT disclaimer for an Italian user message', async () => {
    mockReply(SCREENSHOT_REPLY);
    const data = await ask('Quali mercati mi consigli per il mio piano?', { brief: { description: SEED['d1-002'] } });
    expect(data.text.endsWith(REGULATORY_DISCLAIMER.it)).toBe(true);
    expect(REGULATORY_DISCLAIMER.it).toContain("l'autorità");
  });

  it('leaves non-regulatory replies unchanged', async () => {
    mockReply('Google Search gets the largest share.');
    const data = await ask('Explain the plan', { brief: { description: SEED['d1-004'] } });
    expect(data.text).toBe('Google Search gets the largest share.');
  });

  it('does not duplicate the disclaimer', async () => {
    mockReply(`GGL rules apply.\n\n${REGULATORY_DISCLAIMER.en}`);
    const data = await ask('What about Germany?', { brief: { description: SEED['d1-001'] } });
    expect(data.text.split(REGULATORY_DISCLAIMER.en).length - 1).toBe(1);
  });

  it('is always on, even with the number guard off', async () => {
    vi.stubEnv('AI_NUMBER_GUARD', 'off');
    vi.stubEnv('AI_DECISIONS', '');
    mockReply('Malta MGA licence needed.');
    const data = await ask('Any issues with my casino?');
    expect(data.text.endsWith(REGULATORY_DISCLAIMER.en)).toBe(true);
  });

  it('system prompt carries the new rules', async () => {
    const fetchMock = mockReply('ok');
    await ask('hi');
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    const prompt: string = body.systemInstruction.parts[0].text;
    expect(prompt).toContain('Never state specific regulatory facts');
    expect(prompt).toContain('Name regulators only as places to check');
    expect(prompt).toContain('Never present compliance information as legal advice');
    expect(prompt.indexOf('Flag compliance issues')).toBeLessThan(prompt.indexOf('Never state specific regulatory facts'));
  });
});
