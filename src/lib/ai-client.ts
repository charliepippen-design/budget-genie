import { useCallback } from 'react';
import { useAuth } from '@/lib/auth';

// Browser side of the AI gateway (supabase/functions/ai-gateway).
// No LLM key ever reaches the browser: requests go through the Supabase Edge Function.

export type AIPart = Record<string, unknown>;

export type AgentMessage =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text?: string; raw?: AIPart[] }
  | { role: 'tool'; results: { name: string; response: Record<string, unknown> }[] };

export interface AIToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface AIResponse {
  text: string;
  toolCalls: AIToolCall[];
  raw: AIPart[];
}

type AITask = 'planner' | 'import_chat' | 'extract_report';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const AI_CONFIGURED = !!SUPABASE_URL && !!ANON_KEY && !SUPABASE_URL.includes('placeholder');

export async function callAI(task: AITask, body: Record<string, unknown>, userToken: string | null): Promise<AIResponse> {
  if (!AI_CONFIGURED) throw new Error('AI is not configured (missing Supabase URL/key).');

  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/ai-gateway`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: ANON_KEY!,
        Authorization: `Bearer ${userToken ?? ANON_KEY}`,
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

/** Hook that attaches the signed-in user's token to AI calls. */
export function useAI() {
  const { getToken } = useAuth();
  return useCallback(
    async (task: AITask, body: Record<string, unknown>) => {
      let token: string | null = null;
      try {
        token = (await getToken?.({ template: 'supabase' })) ?? null;
      } catch {
        token = null;
      }
      return callAI(task, body, token);
    },
    [getToken]
  );
}
