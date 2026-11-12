import { useSyncExternalStore } from 'react';

// The user's own Google Gemini API key (bring your own key). It lives in this browser's
// localStorage only and is sent, as a request header, to our own AI gateway and nowhere else.
// Not part of debug exports (crash-recovery DEBUG_EXPORT_KEYS) or cloud sync. Never log it.

export const USER_AI_KEY_STORAGE = 'mediaplan-user-ai-key';
export const USER_AI_KEY_HEADER = 'x-user-ai-key';
export const AI_STUDIO_KEY_URL = 'https://aistudio.google.com/apikey';
/** Where the "AI connection" card lives; AI error prompts link here. */
export const AI_CONNECTION_HREF = '/settings#ai-connection';

// Same rule as the gateway (api/_user-key.ts): no spaces or control characters, at most 512
// characters. Google has more than one key format, so the real test call decides if a key is valid.
const KEY_RE = /^[!-~]{1,512}$/;

export const isUserAIKeyShape = (value: string): boolean => KEY_RE.test(value.trim());

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** The saved key, or null. A stored value of the wrong shape is ignored, so it is never sent. */
export function getUserAIKey(): string | null {
  try {
    const raw = localStorage.getItem(USER_AI_KEY_STORAGE);
    return raw && KEY_RE.test(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** Saves the key in this browser. False when the shape is wrong or storage is unavailable. */
export function setUserAIKey(value: string): boolean {
  const key = value.trim();
  if (!KEY_RE.test(key)) return false;
  try {
    localStorage.setItem(USER_AI_KEY_STORAGE, key);
  } catch {
    return false;
  }
  notify();
  return true;
}

export function clearUserAIKey(): void {
  try {
    localStorage.removeItem(USER_AI_KEY_STORAGE);
  } catch {
    // storage unavailable: nothing was saved either
  }
  notify();
}

/** Last four characters only, for display: "····abcd". */
export const maskUserAIKey = (key: string): string => `····${key.slice(-4)}`;

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab saved or removed the key.
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === USER_AI_KEY_STORAGE) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** The saved key (or null), re-rendering when it is saved or removed. */
export function useUserAIKey(): string | null {
  return useSyncExternalStore(subscribe, getUserAIKey, () => null);
}
