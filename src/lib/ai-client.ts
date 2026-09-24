import { useCallback } from 'react';
import { useAuth } from '@/lib/auth';

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

type AITask = 'planner' | 'import_chat' | 'extract_report';

export async function callAI(task: AITask, body: Record<string, unknown>, userToken: string | null): Promise<AIResponse> {
  let res: Response;
  try {
    res = await fetch('/api/ai-gateway', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(userToken ? { Authorization: `Bearer ${userToken}` } : {}),
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
        token = (await getToken?.()) ?? null;
      } catch {
        token = null;
      }
      return callAI(task, body, token);
    },
    [getToken]
  );
}
