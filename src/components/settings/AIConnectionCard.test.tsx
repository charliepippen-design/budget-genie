import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { byText, cleanup, click, mount } from '@/test/mount';

vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ getToken: async () => 'user-token' }),
}));

import { AIConnectionCard } from './AIConnectionCard';
import { USER_AI_KEY_HEADER, USER_AI_KEY_STORAGE, clearUserAIKey, setUserAIKey } from '@/lib/user-ai-key';

const KEY = `AIza${'Ab1_-'.repeat(6)}wxyz9`; // right shape, not a real key
const OTHER = `AIza${'Zy9-_'.repeat(6)}abcd1`;

const gateway = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers }));
const success = () => gateway(200, { text: '{"ok":true}', toolCalls: [], raw: [] });

const input = (el: HTMLElement) => el.querySelector<HTMLInputElement>('#user-ai-key')!;
const status = (el: HTMLElement) => el.querySelector('[data-testid="ai-connection-status"]')!.textContent ?? '';
const feedback = (el: HTMLElement) => el.querySelector('[data-testid="ai-connection-feedback"]')!.textContent ?? '';
const saveButton = (el: HTMLElement) => byText(el, 'button', 'Test and save') as HTMLButtonElement;

const type = (el: HTMLElement, value: string) =>
  act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input(el), value);
    input(el).dispatchEvent(new Event('input', { bubbles: true }));
  });
const testAndSave = async (el: HTMLElement, value: string) => {
  await type(el, value);
  await click(saveButton(el));
  await act(async () => {
    await vi.waitFor(() => expect(feedback(el)).not.toBe(''));
  });
};

beforeEach(() => localStorage.clear());
afterEach(async () => {
  await cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AI connection card', () => {
  it('starts on the shared trial, with a paste-friendly password field and the honest storage note', async () => {
    const el = await mount(<AIConnectionCard />);
    expect(el.querySelector('#ai-connection h2')?.textContent).toBe('AI connection');
    expect(status(el)).toBe('Using the shared trial: limited to a few messages a day for all users');
    expect(input(el).type).toBe('password');
    expect(input(el).getAttribute('autocomplete')).toBe('off');
    expect(el.textContent).toContain(
      'Your key is stored only in this browser and sent with your AI requests to our server, which forwards it to Google. We do not store it.'
    );
    expect(saveButton(el).disabled).toBe(true); // nothing typed yet
    expect(byText(el, 'button', 'Remove key')).toBeNull();
  });

  it('explains how to get a free key in 3 steps, linking to AI Studio', async () => {
    const el = await mount(<AIConnectionCard />);
    expect(el.textContent).toContain('How to get a free key');
    expect(el.querySelectorAll('ol li')).toHaveLength(3);
    const link = el.querySelector<HTMLAnchorElement>('ol a')!;
    expect(link.href).toBe('https://aistudio.google.com/apikey');
    expect(link.target).toBe('_blank');
    expect(link.rel).toContain('noopener');
  });

  it('Test and save: one gateway call with the candidate key, saved only after it succeeds', async () => {
    const fetchMock = success();
    vi.stubGlobal('fetch', fetchMock);
    const el = await mount(<AIConnectionCard />);
    await testAndSave(el, `  ${KEY} `);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe('/api/ai-gateway');
    expect(init.headers[USER_AI_KEY_HEADER]).toBe(KEY);
    expect(JSON.parse(init.body).task).toBe('json');
    expect(init.body).not.toContain(KEY);

    expect(localStorage.getItem(USER_AI_KEY_STORAGE)).toBe(KEY);
    expect(status(el)).toBe('Using your Gemini key ····xyz9');
    expect(feedback(el)).toContain('Key saved');
    expect(input(el).value).toBe(''); // the full key is not left on screen
    expect(el.textContent).not.toContain(KEY);
  });

  it.each([
    ['an invalid key', 403, { error: 'Google rejected your Gemini key. It may be mistyped, revoked or restricted. Check it in Google AI Studio.', code: 'user_key_invalid' }, /Google rejected your Gemini key/],
    ['a key out of quota', 429, { error: 'Your Gemini key has reached its Google quota.', code: 'user_key_quota', retryAfterSeconds: 34 }, /reached its Google quota\. Try again in 34 seconds/],
    ['Google overloaded', 503, { error: 'The AI model is busy or unavailable right now. Please try again in a minute.', code: 'AI_BUSY', retryAfterSeconds: 60 }, /Google is busy right now.*It was not rejected/],
    ['a key without the model', 400, { error: 'Your Gemini key cannot use the AI model this app needs.', code: 'user_key_model' }, /cannot use the AI model/],
  ])('Test and save with %s shows the precise error and saves nothing', async (_name, statusCode, body, expected) => {
    vi.stubGlobal('fetch', gateway(statusCode as number, body));
    const el = await mount(<AIConnectionCard />);
    await testAndSave(el, KEY);

    expect(feedback(el)).toMatch(expected as RegExp);
    expect(feedback(el)).toContain('The key was not saved.');
    expect(localStorage.getItem(USER_AI_KEY_STORAGE)).toBeNull();
    expect(status(el)).toContain('Using the shared trial');
    expect(input(el).value).toBe(KEY); // still there to correct
  });

  it('a failed test of a replacement keeps the key that already works', async () => {
    setUserAIKey(KEY);
    vi.stubGlobal('fetch', gateway(403, { error: 'Google rejected your Gemini key.', code: 'user_key_invalid' }));
    const el = await mount(<AIConnectionCard />);
    await testAndSave(el, OTHER);
    expect(localStorage.getItem(USER_AI_KEY_STORAGE)).toBe(KEY);
    expect(status(el)).toBe('Using your Gemini key ····xyz9');
  });

  it('refuses a wrong-shaped key without calling the gateway', async () => {
    const fetchMock = success();
    vi.stubGlobal('fetch', fetchMock);
    const el = await mount(<AIConnectionCard />);
    await testAndSave(el, 'pasted with spaces');
    expect(feedback(el)).toMatch(/does not look like a Gemini API key/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.getItem(USER_AI_KEY_STORAGE)).toBeNull();
  });

  it('accepts the newer Google key format ("AQ." prefix, longer) and lets the test call decide', async () => {
    const newer = `AQ.${'Ab1_-'.repeat(11)}`;
    const fetchMock = success();
    vi.stubGlobal('fetch', fetchMock);
    const el = await mount(<AIConnectionCard />);
    await testAndSave(el, newer);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(USER_AI_KEY_STORAGE)).toBe(newer);
  });

  it('Remove key goes back to the shared trial', async () => {
    setUserAIKey(KEY);
    const el = await mount(<AIConnectionCard />);
    expect(status(el)).toBe('Using your Gemini key ····xyz9');
    await click(byText(el, 'button', 'Remove key'));
    expect(localStorage.getItem(USER_AI_KEY_STORAGE)).toBeNull();
    expect(status(el)).toContain('Using the shared trial');
    expect(feedback(el)).toContain('Key removed');
    expect(byText(el, 'button', 'Remove key')).toBeNull();
  });

  it('follows a key saved or removed elsewhere in the app', async () => {
    const el = await mount(<AIConnectionCard />);
    await act(async () => void setUserAIKey(KEY));
    expect(status(el)).toContain('····xyz9');
    await act(async () => clearUserAIKey());
    expect(status(el)).toContain('Using the shared trial');
  });

  it('never writes the key to the console', async () => {
    const logs: unknown[][] = [];
    for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void logs.push(args));
    }
    vi.stubGlobal('fetch', gateway(500, { error: `upstream said ${KEY}` }));
    const el = await mount(<AIConnectionCard />);
    await testAndSave(el, KEY);
    vi.stubGlobal('fetch', success());
    await click(saveButton(el));
    await act(async () => {
      await vi.waitFor(() => expect(feedback(el)).toContain('Key saved'));
    });
    expect(logs.map((args) => args.map(String).join(' ')).join('\n')).not.toContain(KEY);
  });
});
