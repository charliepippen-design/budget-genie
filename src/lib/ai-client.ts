import { useCallback, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';

// Browser side of the AI gateway (api/ai-gateway.ts, a Vercel Function).
// No LLM key ever reaches the browser: requests go through our own server.

export type AIPart = Record<string, unknown>;

export type AgentMessage =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text?: string; raw?: AIPart[] }
  | { role: 'tool'; results: { id?: string; name: string; response: Record<string, unknown> }[] };

export interface AIToolCall {
  id?: string;
  name: string;
  args: Record<string, unknown>;
}

export interface AIResponse {
  text: string;
  toolCalls: AIToolCall[];
  raw: AIPart[];
}

type AITask = 'planner' | 'json';

export type AIErrorKind = 'busy' | 'rate_limited' | 'unavailable' | 'free_tier_limit' | 'generic';

/** Error from the gateway; `code` is FREE_TIER_LIMIT or USAGE_UNAVAILABLE for free-tier cap responses. */
export class AIError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly status?: number,
    readonly retryAfterSeconds?: number
  ) {
    super(message);
    this.name = 'AIError';
  }

  get kind(): AIErrorKind {
    if (this.code === 'FREE_TIER_LIMIT') return 'free_tier_limit';
    if (this.code === 'AI_BUSY') return 'busy';
    if (this.code === 'AI_RATE_LIMITED' || this.status === 429) return 'rate_limited';
    if (this.status === 503) return 'unavailable';
    return 'generic';
  }
}

export const isFreeTierLimit = (err: unknown): boolean => err instanceof AIError && err.code === 'FREE_TIER_LIMIT';

export const aiErrorKind = (err: unknown): AIErrorKind => (err instanceof AIError ? err.kind : 'generic');

/** Seconds from a Retry-After header (numeric form) or the body, clamped to 1..3600; undefined when absent. */
export function parseRetryAfter(header: string | null | undefined, bodyValue?: unknown): number | undefined {
  const raw = header != null && header.trim() !== '' ? Number(header) : typeof bodyValue === 'number' ? bodyValue : NaN;
  return Number.isFinite(raw) && raw > 0 ? Math.min(3600, Math.ceil(raw)) : undefined;
}

/** Plain-language message for a failed AI call, specific to the kind of failure. */
export function aiErrorMessage(err: unknown, fallback = 'Something went wrong.'): string {
  const own = err instanceof Error && err.message ? err.message : fallback;
  if (!(err instanceof AIError)) return own;
  const wait = err.retryAfterSeconds;
  const secs = wait === 1 ? '1 second' : `${wait} seconds`;
  switch (err.kind) {
    case 'busy':
      return wait ? `The AI is busy, try again in ${secs}.` : 'The AI is busy, try again in a moment.';
    case 'rate_limited':
      return wait ? `Too many AI requests right now, try again in ${secs}.` : own;
    case 'unavailable':
      return 'The AI is unavailable right now. Your plan and sliders still work.';
    default:
      return own;
  }
}

/** Language of the app UI as the gateway understands it: Italian browsers get Italian fixed texts. */
export function getUiLang(): 'it' | 'en' {
  const lang = typeof navigator !== 'undefined' ? navigator.language : '';
  return /^it\b/i.test(lang ?? '') ? 'it' : 'en';
}

/** One turn = one user chat message or one one-shot generation. All requests of a turn share the id. */
export function newTurnId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

type TokenGetter = (() => Promise<string | null>) | undefined;

// Clerk's getToken is only reachable from hooks; plain modules (report narrator, onboarding)
// use the one registered by the app shell.
let registeredGetToken: TokenGetter;
export function registerAITokenGetter(getter: TokenGetter) {
  registeredGetToken = getter;
}

/** The signed-in user's Clerk token, for calls to our own API routes. */
export async function getAuthToken(): Promise<string | null> {
  try {
    return (await registeredGetToken?.()) ?? null;
  } catch {
    return null;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Gateway output is untrusted: anything that is not the expected shape becomes '' / []. */
export function normalizeAIResponse(data: unknown): AIResponse {
  const d = isRecord(data) ? data : {};
  const toolCalls: AIToolCall[] = Array.isArray(d.toolCalls)
    ? d.toolCalls.filter(isRecord).flatMap((c) =>
        typeof c.name === 'string'
          ? [{ ...(typeof c.id === 'string' ? { id: c.id } : {}), name: c.name, args: isRecord(c.args) ? c.args : {} }]
          : []
      )
    : [];
  return {
    text: typeof d.text === 'string' ? d.text : '',
    toolCalls,
    raw: Array.isArray(d.raw) ? d.raw.filter(isRecord) : [],
  };
}

export async function callAI(task: AITask, body: Record<string, unknown>, userToken?: string | null): Promise<AIResponse> {
  let token = userToken ?? null;
  if (token === null && registeredGetToken) {
    try {
      token = await registeredGetToken();
    } catch {
      token = null;
    }
  }

  let res: Response;
  try {
    res = await fetch('/api/ai-gateway', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ turnId: newTurnId(), task, ...body }),
    });
  } catch {
    throw new Error('Cannot reach the AI server. Check your connection and try again.');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AIError(
      data?.error || `AI request failed (${res.status})`,
      data?.code,
      res.status,
      parseRetryAfter(res.headers?.get?.('Retry-After'), data?.retryAfterSeconds)
    );
  }
  return normalizeAIResponse(data);
}

/** One-shot structured generation: returns parsed JSON, or null when the model output is not JSON. */
export async function generateJSON(prompt: string): Promise<unknown | null> {
  const { text } = await callAI('json', { prompt });
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  }
}

/** Mount once inside ClerkProvider so non-hook callers (onboarding, reports) send the user's token. */
export function AITokenBridge() {
  const { getToken } = useAuth();
  useEffect(() => {
    registerAITokenGetter(() => getToken());
    return () => registerAITokenGetter(undefined);
  }, [getToken]);
  return null;
}

/** Hook that attaches the signed-in user's token to AI calls. */
export function useAI() {
  const { getToken } = useAuth();
  return useCallback(
    async (task: AITask, body: Record<string, unknown>) => {
      let token: string | null = null;
      try {
        token = (await getToken?.()) ?? null;
      } catch {
        token = null;
      }
      return callAI(task, body, token);
    },
    [getToken]
  );
}
