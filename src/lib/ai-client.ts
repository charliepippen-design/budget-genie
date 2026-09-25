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
      body: JSON.stringify({ task, ...body }),
    });
  } catch {
    throw new Error('Cannot reach the AI server. Check your connection and try again.');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `AI request failed (${res.status})`);
  return { text: data.text ?? '', toolCalls: data.toolCalls ?? [], raw: data.raw ?? [] };
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
