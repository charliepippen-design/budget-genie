import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Bot, Loader2, MessageSquare, RotateCcw, Send, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useAI, type AgentMessage, type AIPart } from '@/lib/ai-client';
import { applyPlannerToolCall, buildPlannerContext, summarizePlan } from '@/lib/planner-agent';
import { generatePlan } from '@/lib/plan-generator';
import { INDUSTRY_PACKS, type IndustryId } from '@/lib/industries';

// Conversational planner: the user describes the business, the AI fills the brief,
// the engine builds the plan and the dashboard updates live.

type ChatItem =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string; raw?: AIPart[] }
  | { kind: 'tool'; id?: string; name: string; response: Record<string, unknown> }
  | { kind: 'error'; text: string };

const STORAGE_KEY = 'mediaplan-planner-chat-v1';
const MAX_TOOL_ROUNDS = 4;

const WELCOME =
  "Hi! I'll build your media plan with you. Tell me about your business: **industry**, **monthly budget**, **main goal** (new customers, retention, brand) and the **countries** you target. Anything special — licences, channels that already work, a target CPA — helps too.";

function loadChat(): ChatItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ChatItem[]) : [];
  } catch {
    return [];
  }
}

function saveChat(items: ChatItem[]) {
  try {
    // Cut at a user turn so the saved history never starts with an orphan tool result.
    const recent = items.slice(-60);
    const firstUser = recent.findIndex(it => it.kind === 'user');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(firstUser > 0 ? recent.slice(firstUser) : recent));
  } catch {
    // storage unavailable: chat just won't survive a reload
  }
}

/** Chat items -> the message format the gateway expects. */
function toAgentMessages(items: ChatItem[]): AgentMessage[] {
  const out: AgentMessage[] = [];
  for (const it of items) {
    if (it.kind === 'user') out.push({ role: 'user', text: it.text });
    else if (it.kind === 'assistant') out.push({ role: 'assistant', text: it.text, raw: it.raw });
    else if (it.kind === 'tool') {
      const last = out[out.length - 1];
      const result = { id: it.id, name: it.name, response: it.response };
      if (last?.role === 'tool') last.results.push(result);
      else out.push({ role: 'tool', results: [result] });
    }
  }
  return out;
}

// Minimal markdown for model replies: **bold**, *italic*, `code`.
function renderInline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)/g).map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return <strong key={i} className="text-indigo-700 dark:text-indigo-200">{part.slice(2, -2)}</strong>;
    }
    if (/^\*[^*]+\*$/.test(part)) return <em key={i}>{part.slice(1, -1)}</em>;
    if (/^`[^`]+`$/.test(part)) return <code key={i} className="rounded bg-black/10 px-1">{part.slice(1, -1)}</code>;
    return part;
  });
}

function RichText({ text }: { text: string }) {
  const lines = text.split('\n').filter(l => l.trim() !== '');
  return (
    <div className="space-y-1 break-words">
      {lines.map((line, i) => {
        const heading = line.match(/^\s*#{1,6}\s+(.*)$/);
        if (heading) return <p key={i} className="font-semibold">{renderInline(heading[1])}</p>;
        const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
        const numbered = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
        if (bullet || numbered) {
          return (
            <div key={i} className="flex gap-2">
              <span className="shrink-0 text-indigo-500 dark:text-indigo-400">{numbered ? `${numbered[1]}.` : '•'}</span>
              <span>{renderInline(bullet ? bullet[1] : numbered![2])}</span>
            </div>
          );
        }
        return <p key={i}>{renderInline(line)}</p>;
      })}
    </div>
  );
}

function ToolCard({ name, response }: { name: string; response: Record<string, unknown> }) {
  const { format } = useCurrency();
  const money = (n: unknown) => (typeof n === 'number' ? format(n) : '—');
  if (!response.ok) {
    return <div className="text-[11px] text-amber-400 px-3">⚠ {String(response.error ?? 'Action failed')}</div>;
  }
  const plan = response.plan as ReturnType<typeof summarizePlan> | undefined;
  if (!plan) return null;
  return (
    <div className="mx-2 rounded-lg border border-indigo-500/30 bg-indigo-950/40 p-3 text-xs text-slate-300">
      <div className="flex items-center gap-2 font-semibold text-indigo-200 mb-1">
        <Sparkles className="h-3.5 w-3.5" />
        {name === 'update_brief' ? 'Plan rebuilt' : 'Plan adjusted'}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div><div className="text-slate-500">Budget</div>{money(plan.totalBudget)}</div>
        <div><div className="text-slate-500">Channels</div>{plan.channels.filter(c => c.active).length}</div>
        <div><div className="text-slate-500">Cost/conv.</div>{money(plan.blended.costPerConversion)}</div>
      </div>
      {/* Numbers come straight from the engine, so the chat can never misquote them. */}
      <div className="mt-2 space-y-0.5">
        {[...plan.channels]
          .filter(c => c.active && (c.spend ?? 0) > 0)
          .sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0))
          .slice(0, 5)
          .map(c => (
            <div key={c.id} className="flex justify-between gap-2">
              <span className="truncate">{c.locked ? '🔒 ' : ''}{c.name}</span>
              <span className="shrink-0 tabular-nums">{c.sharePct}% · {money(c.spend)}</span>
            </div>
          ))}
      </div>
      {typeof response.note === 'string' && <div className="mt-2 text-amber-500">{response.note}</div>}
      {Array.isArray((response as { warnings?: unknown }).warnings) &&
        ((response as { warnings: string[] }).warnings).map(w => (
          <div key={w} className="mt-1 text-amber-500">⚠ {w}</div>
        ))}
    </div>
  );
}

export function PlannerChat() {
  const open = useMediaPlanStore(s => s.isGenieOpen);
  const setOpen = useMediaPlanStore(s => s.setIsGenieOpen);
  const [items, setItems] = useState<ChatItem[]>(loadChat);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const hasBrief = useMediaPlanStore(s => !!s.brief);
  const callAI = useAI();
  const endRef = useRef<HTMLDivElement>(null);

  // Phones: the panel is full-screen, so start hidden and let the user open it.
  useEffect(() => {
    if (window.innerWidth < 768) setOpen(false);
  }, [setOpen]);

  useEffect(() => saveChat(items), [items]);
  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), [items, busy]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setInput('');

    let convo: ChatItem[] = [...items, { kind: 'user', text: trimmed }];
    setItems(convo);
    setBusy(true);

    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const res = await callAI('planner', { messages: toAgentMessages(convo), context: buildPlannerContext() });
        convo = [...convo, { kind: 'assistant', text: res.text, raw: res.raw }];
        if (res.toolCalls.length === 0) break;

        // Engine applies each tool call; results go back to the model so it can explain them.
        for (const call of res.toolCalls) {
          convo = [...convo, { kind: 'tool', id: call.id, name: call.name, response: applyPlannerToolCall(call) }];
        }
        setItems(convo);
      }
      setItems(convo);
    } catch (err) {
      setItems([...convo, { kind: 'error', text: err instanceof Error ? err.message : 'Something went wrong.' }]);
    } finally {
      setBusy(false);
    }
  };

  // Works without AI: builds a sensible default plan for the industry straight away.
  const quickStart = (industry: IndustryId) => {
    const plan = generatePlan({ industry, monthlyBudget: useMediaPlanStore.getState().totalBudget || 50000 });
    useMediaPlanStore.getState().applyGeneratedPlan(plan);
    const label = INDUSTRY_PACKS.find(p => p.id === industry)?.label ?? industry;
    setItems(prev => [
      ...prev,
      {
        kind: 'assistant',
        text: `Here's a starting plan for **${label}** with ${plan.channels.length} channels. Now tell me your real budget, goals and markets and I'll tailor it — or tweak the sliders directly.`,
      },
    ]);
  };

  const reset = () => {
    setItems([]);
    useMediaPlanStore.setState({ brief: null, planRationale: [], planWarnings: [] });
  };

  if (!open) {
    return (
      <Button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-40 h-12 gap-2 rounded-full bg-indigo-600 px-5 shadow-2xl hover:bg-indigo-700"
      >
        <MessageSquare className="h-5 w-5" /> Plan with AI
      </Button>
    );
  }

  return (
    <aside className="fixed inset-0 z-50 flex flex-col bg-slate-950 md:static md:z-auto md:w-[400px] md:shrink-0 md:border-l md:border-slate-800">
      <header className="flex items-center gap-2 border-b border-slate-800 p-4">
        <div className="rounded-lg bg-indigo-600 p-1.5"><Bot className="h-4 w-4 text-white" /></div>
        <div className="flex-1">
          <div className="text-sm font-semibold">AI Planner</div>
          <div className="text-[11px] text-slate-400">Describe your business — the plan updates live</div>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400" onClick={reset} title="New conversation">
          <RotateCcw className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400" onClick={() => setOpen(false)} title="Hide">
          <X className="h-4 w-4" />
        </Button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
        <div className="rounded-2xl rounded-tl-none border border-slate-700 bg-slate-800 p-3 text-slate-200">
          <RichText text={WELCOME} />
        </div>

        {!hasBrief && (
          <div className="flex flex-wrap gap-2">
            {INDUSTRY_PACKS.map(p => (
              <button
                key={p.id}
                onClick={() => quickStart(p.id)}
                className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-300 hover:border-indigo-500 hover:text-white"
              >
                {p.label}
              </button>
            ))}
          </div>
        )}

        {items.map((it, i) => {
          if (it.kind === 'user') {
            return <div key={i} className="ml-auto max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-none bg-indigo-600 p-3 text-white">{it.text}</div>;
          }
          if (it.kind === 'assistant') {
            return it.text ? (
              <div key={i} className="max-w-[92%] rounded-2xl rounded-tl-none border border-slate-700 bg-slate-800 p-3 text-slate-200">
                <RichText text={it.text} />
              </div>
            ) : null;
          }
          if (it.kind === 'tool') return <ToolCard key={i} name={it.name} response={it.response} />;
          return (
            <div key={i} className="rounded-lg border border-red-500/30 bg-red-950/30 p-3 text-xs text-red-300">
              ⚠ {it.text}
              {/sign in/i.test(it.text) && (
                <a href="/auth" className="ml-2 font-semibold text-indigo-300 underline">Sign in</a>
              )}
            </div>
          );
        })}

        {busy && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="flex gap-2 border-t border-slate-800 p-3"
        onSubmit={e => {
          e.preventDefault();
          send(input);
        }}
      >
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={2}
          disabled={busy}
          placeholder="e.g. Forex broker, €40k/month, Germany and Austria, no Google licence yet"
          className={cn('flex-1 resize-none rounded-lg border border-slate-700 bg-slate-900 p-2 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none')}
        />
        <Button type="submit" size="icon" disabled={busy || !input.trim()} className="h-auto bg-indigo-600 hover:bg-indigo-700">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </aside>
  );
}
