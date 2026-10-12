// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleAIRequest } from '../../api/_gateway';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const plan = {
  totalBudget: 20000,
  blended: { spend: 20000, conversions: 113, costPerConversion: 178, grossValue: 28700, roas: 1.44 },
  profitability: { source: 'engine', losesMoney: true, monthlyContribution: -18783, breakEvenCpa: 11, blendedCpa: 178, netValueBasis: 'NGR' },
};

// Eval seed D2 messages (d2-002, d2-006, d2-007)
const SEED_D2 = [
  'Why is Meta getting so little budget?',
  'Quanto rende questo piano tra 6 mesi in termini di LTV?',
  'Write me a short summary of this plan for my boss',
];

async function systemPromptFor(message: string) {
  vi.stubEnv('ALLOW_ANON', 'true');
  vi.stubEnv('GEMINI_API_KEY', 'server-key');
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] })));
  vi.stubGlobal('fetch', fetchMock);
  const req = new Request('http://localhost/api/ai-gateway', {
    method: 'POST',
    body: JSON.stringify({ task: 'planner', messages: [{ role: 'user', text: message }], context: { plan } }),
  });
  await handleAIRequest(req);
  const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  return JSON.parse(init.body as string).systemInstruction.parts[0].text as string;
}

describe('planner prompt: profitability first', () => {
  it.each(SEED_D2)('carries the rule and the engine profitability for seed message %s', async (message) => {
    const prompt = await systemPromptFor(message);
    expect(prompt).toContain('Lead with profitability using PLAN STATE.profitability');
    expect(prompt).toContain('before any ROAS or gross value');
    expect(prompt).toContain('Never present ROAS or gross value as a positive result when losesMoney is true');
    const state = prompt.split('PLAN STATE: ')[1];
    expect(JSON.parse(state).profitability).toEqual(plan.profitability);
  });
});
