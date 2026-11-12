import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  USER_AI_KEY_STORAGE,
  clearUserAIKey,
  getUserAIKey,
  isUserAIKeyShape,
  maskUserAIKey,
  setUserAIKey,
} from './user-ai-key';
import { DEBUG_EXPORT_KEYS, buildDebugState } from './crash-recovery';
import { aiDisclosureShort, AI_DISCLOSURE_SHORT, AI_DISCLOSURE_SHORT_IT } from './ai-disclosure';

const KEY = `AIza${'Ab1_-'.repeat(6)}wxyz9`; // right shape, not a real key

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('user AI key storage', () => {
  it('saves, reads and clears the key under mediaplan-user-ai-key', () => {
    expect(getUserAIKey()).toBeNull();
    expect(setUserAIKey(`  ${KEY}\n`)).toBe(true); // pasted with whitespace
    expect(localStorage.getItem('mediaplan-user-ai-key')).toBe(KEY);
    expect(USER_AI_KEY_STORAGE).toBe('mediaplan-user-ai-key');
    expect(getUserAIKey()).toBe(KEY);
    clearUserAIKey();
    expect(getUserAIKey()).toBeNull();
    expect(localStorage.getItem(USER_AI_KEY_STORAGE)).toBeNull();
  });

  it('refuses a value of the wrong shape and ignores one already in storage', () => {
    for (const bad of ['', '   ', `AIza${'a b'.repeat(12)}`, `${KEY}
${KEY}`, 'chiave-é', 'a'.repeat(513)]) {
      expect(isUserAIKeyShape(bad)).toBe(false);
      expect(setUserAIKey(bad)).toBe(false);
    }
    expect(localStorage.getItem(USER_AI_KEY_STORAGE)).toBeNull();
    localStorage.setItem(USER_AI_KEY_STORAGE, 'not a key');
    expect(getUserAIKey()).toBeNull();
  });

  it('accepts any Google key format: the test call decides, not the shape', () => {
    for (const good of [KEY, `AQ.${'Ab1_-'.repeat(11)}`, `  ${KEY}  `]) {
      expect(isUserAIKeyShape(good)).toBe(true);
      expect(setUserAIKey(good)).toBe(true);
      expect(getUserAIKey()).toBe(good.trim());
    }
  });

  it('never throws when storage is unavailable', () => {
    const boom = () => {
      throw new Error('storage blocked');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(boom);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(boom);
    expect(getUserAIKey()).toBeNull();
    expect(setUserAIKey(KEY)).toBe(false);
    expect(() => clearUserAIKey()).not.toThrow();
  });

  it('shows only the last four characters', () => {
    expect(maskUserAIKey(KEY)).toBe('····xyz9');
    expect(maskUserAIKey(KEY)).not.toContain(KEY.slice(0, 10));
  });
});

describe('the key stays out of exports and sync', () => {
  it('is not in the debug export allow-list, and a debug export does not contain it', () => {
    expect(DEBUG_EXPORT_KEYS as readonly string[]).not.toContain(USER_AI_KEY_STORAGE);
    setUserAIKey(KEY);
    localStorage.setItem('mediaplan-store-v2', JSON.stringify({ state: { totalBudget: 1 } }));
    const dump = JSON.stringify(buildDebugState({ message: 'm', stack: 's', componentStack: 'c' }));
    expect(dump).toContain('totalBudget'); // the export did read storage
    expect(dump).not.toContain(KEY);
    expect(dump).not.toContain(USER_AI_KEY_STORAGE);
  });

  it('only user-ai-key.ts touches the storage entry, and only the AI client reads the key for sending', () => {
    const sources = import.meta.glob<string>(['/src/**/*.{ts,tsx}', '!/src/**/*.test.{ts,tsx}'], {
      query: '?raw',
      import: 'default',
      eager: true,
    });
    const files = Object.entries(sources);
    expect(files.length).toBeGreaterThan(100);
    const using = (needle: RegExp) => files.filter(([, text]) => needle.test(text)).map(([path]) => path).sort();

    // Cloud sync, saved projects, error reports and debug exports never name the entry.
    expect(using(/mediaplan-user-ai-key|USER_AI_KEY_STORAGE/)).toEqual(['/src/lib/user-ai-key.ts']);
    // The raw key is read in two places: the AI client (to send it) and the hook's own module.
    expect(using(/\bgetUserAIKey\b/)).toEqual(['/src/lib/ai-client.ts', '/src/lib/user-ai-key.ts']);
    // ...and the header is built in one.
    expect(using(/\bUSER_AI_KEY_HEADER\b/)).toEqual(['/src/lib/ai-client.ts', '/src/lib/user-ai-key.ts']);
    // The AI client talks to our own gateway only.
    const client = sources['/src/lib/ai-client.ts'];
    expect(client.match(/fetch\(([^,)]*)/g)).toEqual(["fetch('/api/ai-gateway'"]);
  });
});

describe('AI disclosure per mode', () => {
  it('keeps the shared-trial text when no key is connected', () => {
    expect(aiDisclosureShort(false)).toBe(AI_DISCLOSURE_SHORT);
    expect(aiDisclosureShort(false, 'it')).toBe(AI_DISCLOSURE_SHORT_IT);
    expect(aiDisclosureShort(false)).toMatch(/free tier of Google's API/);
  });

  it('with an own key says whose terms apply and how the key travels, in English and Italian', () => {
    const en = aiDisclosureShort(true);
    expect(en).toMatch(/^AI replies use your own Google Gemini key; Google's terms for your account apply\./);
    expect(en).toMatch(/does not store it/);
    expect(en).toMatch(/calculated by our engine, not by the AI/);
    const it = aiDisclosureShort(true, 'it');
    expect(it).toMatch(/^Le risposte dell'AI usano la tua chiave Google Gemini; valgono i termini di Google per il tuo account\./);
    expect(it).toMatch(/non la conserva/);
    // No claim about what Google does with the data: that depends on the user's own account and tier.
    for (const text of [en, it]) expect(text).not.toMatch(/free tier|livello gratuito|may use|può usare|will not|never use|non usa/i);
  });
});
