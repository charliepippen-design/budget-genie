import { BUILD_ID } from './build-info';

const ENDPOINT = '/api/client-error';
const MAX_STACK = 8 * 1024;
const MAX_MESSAGE = 1024;
const MAX_UA = 512;
const MAX_SECTION = 64;

export interface ClientErrorInput {
  section: string;
  error: unknown;
  componentStack?: string | null;
}

const cut = (value: unknown, max: number) => String(value ?? '').slice(0, max);

const seen = new Set<string>();

/** Test hook: forget what was already reported in this page session. */
export function resetReportedErrors() {
  seen.clear();
}

export function buildErrorPayload({ section, error, componentStack }: ClientErrorInput) {
  const err = error instanceof Error ? error : null;
  return {
    buildId: BUILD_ID,
    section: cut(section, MAX_SECTION),
    message: cut(err ? err.message : error, MAX_MESSAGE),
    stack: cut(err?.stack, MAX_STACK),
    componentStack: cut(componentStack, MAX_STACK),
    // Path only: query strings and hashes can carry tokens.
    url: cut(window.location.pathname, 512),
    userAgent: cut(navigator.userAgent, MAX_UA),
    ts: new Date().toISOString(),
  };
}

/** Sends a crash report to /api/client-error. Fire and forget, deduplicated, never throws. */
export function reportClientError(input: ClientErrorInput): void {
  try {
    const payload = buildErrorPayload(input);
    const fingerprint = `${payload.section}|${payload.message}|${payload.stack}|${payload.componentStack}`;
    if (seen.has(fingerprint)) return;
    seen.add(fingerprint);

    const body = JSON.stringify(payload);
    let sent = false;
    if (typeof navigator.sendBeacon === 'function') {
      sent = navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
    }
    if (!sent && typeof fetch === 'function') {
      void fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => undefined);
    }
  } catch {
    // reporting must never make a crash worse
  }
}
