// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleAIRequest } from '../../api/_gateway';
import { geminiModels } from '../../api/_models';

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('http://localhost/api/ai-gateway', { method: 'POST', headers, body: JSON.stringify(body) });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('AI gateway', () => {
  it('refuses requests without a signed-in user', async () => {
    vi.stubEnv('ALLOW_ANON', '');
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', '');
    const res = await handleAIRequest(post({ task: 'planner', messages: [] }));
    expect(res.status).toBe(401);
  });

  it('rejects forged tokens', async () => {
    vi.stubEnv('ALLOW_ANON', '');
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', '');
    const res = await handleAIRequest(post({ task: 'planner' }, { authorization: 'Bearer abc.def.ghi' }));
    expect(res.status).toBe(401);
  });

  it('rejects unknown tasks', async () => {
    vi.stubEnv('ALLOW_ANON', 'true');
    const res = await handleAIRequest(post({ task: 'anything' }));
    expect(res.status).toBe(400);
  });

  it('keeps the key server-side and returns tool calls with ids', async () => {
    vi.stubEnv('ALLOW_ANON', 'true');
    vi.stubEnv('GEMINI_API_KEY', 'server-key');
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ functionCall: { id: 'x1', name: 'update_brief', args: { industry: 'saas' } } }] } }],
        })
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await handleAIRequest(post({ task: 'planner', messages: [{ role: 'user', text: 'SaaS, 20k' }], context: {} }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.toolCalls).toEqual([{ id: 'x1', name: 'update_brief', args: { industry: 'saas' } }]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain('server-key');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('server-key');
  });

  describe('model config', () => {
    const ok = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{}' }] } }] }));
    const bad = () => new Response('bad request', { status: 400 });

    it('defaults to explicit model names', () => {
      vi.stubEnv('GEMINI_MODEL', '');
      vi.stubEnv('GEMINI_FALLBACK_MODEL', '');
      expect(geminiModels()).toEqual(['gemini-3.6-flash', 'gemini-3.5-flash-lite']);
    });

    it('honours env overrides', () => {
      vi.stubEnv('GEMINI_MODEL', 'custom-primary');
      vi.stubEnv('GEMINI_FALLBACK_MODEL', 'custom-fallback');
      expect(geminiModels()).toEqual(['custom-primary', 'custom-fallback']);
    });

    it('tries the primary first, then the fallback, and never sends temperature', async () => {
      vi.stubEnv('ALLOW_ANON', 'true');
      vi.stubEnv('GEMINI_API_KEY', 'server-key');
      vi.stubEnv('GEMINI_MODEL', '');
      vi.stubEnv('GEMINI_FALLBACK_MODEL', '');
      const fetchMock = vi.fn().mockImplementationOnce(async () => bad()).mockImplementation(async () => ok());
      vi.stubGlobal('fetch', fetchMock);

      const planner = await handleAIRequest(post({ task: 'planner', messages: [{ role: 'user', text: 'hi' }], context: {} }));
      expect(planner.status).toBe(200);
      const json = await handleAIRequest(post({ task: 'json', prompt: 'x' }));
      expect(json.status).toBe(200);

      const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
      expect(calls[0][0]).toContain('/models/gemini-3.6-flash:');
      expect(calls[1][0]).toContain('/models/gemini-3.5-flash-lite:');
      for (const [, init] of calls) {
        expect(String(init.body)).not.toContain('temperature');
      }
    });
  });
});
