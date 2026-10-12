import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { reportClientError } from './error-report';

// A dynamic import fails after a deploy when the tab still points at chunks that no longer exist.
// Reloading once fetches the fresh index.html and the matching chunks. The guard stops a loop
// when the failure is not caused by a stale deploy.

const RELOAD_WINDOW_MS = 30_000;
const PREFIX = 'chunk-reload:';

/** Reloads the page unless this key already reloaded within the time window. Returns true if it reloaded. */
export function reloadOncePerKey(key: string): boolean {
  try {
    const storageKey = PREFIX + key;
    const last = Number(sessionStorage.getItem(storageKey) ?? 0);
    if (last && Date.now() - last < RELOAD_WINDOW_MS) return false;
    sessionStorage.setItem(storageKey, String(Date.now()));
    window.location.reload();
    return true;
  } catch {
    return false;
  }
}

export function lazyWithReload<T extends ComponentType<any>>( // eslint-disable-line @typescript-eslint/no-explicit-any
  factory: () => Promise<{ default: T }>,
  key: string
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await factory();
    } catch (error) {
      if (reloadOncePerKey(key)) {
        // Keep Suspense pending while the reload happens.
        return new Promise<{ default: T }>(() => undefined);
      }
      reportClientError({ section: `lazy:${key}`, error });
      throw error;
    }
  });
}
