import { useEffect, useState } from 'react';
import { ArrowUp, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePlanResult } from '@/engine';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useVerticalConfig } from '@/hooks/use-vertical-config';
import { buildAiSuggestions } from '@/lib/ai-suggestions';
import { usePlannerPromptStore } from '@/store/usePlannerPromptStore';

// One-line entry point to the AI planner: type a request or pick a suggestion built from the live
// plan. The bar only hands the prompt to the chat (PlannerChat), which sends it, applies the
// AI's changes and enforces the plan limits; nothing is computed or sent to the AI from here.

const SENT_NOTICE_MS = 2600;

export function AiCommandBar({ className }: { className?: string }) {
  const plan = usePlanResult();
  const vc = useVerticalConfig();
  const { format } = useCurrency();
  const submit = usePlannerPromptStore((s) => s.submit);
  const [text, setText] = useState('');
  const [sentAt, setSentAt] = useState<number | null>(null);

  const suggestions = buildAiSuggestions(plan, vc.terms, (value) => format(value));

  useEffect(() => {
    if (sentAt === null) return;
    const timer = setTimeout(() => setSentAt(null), SENT_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [sentAt]);

  const sendPrompt = (prompt: string) => {
    if (!prompt.trim()) return;
    submit(prompt);
    setText('');
    setSentAt(Date.now());
  };

  const sent = sentAt !== null;

  return (
    <section
      aria-label="Ask the AI planner"
      data-testid="ai-command-bar"
      className={cn('rounded-xl border border-slate-800 bg-slate-900 p-3 shadow-sm', className)}
    >
      <form
        className="relative flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          sendPrompt(text);
        }}
      >
        <span className="pointer-events-none absolute left-3 text-indigo-400" aria-hidden="true">
          <Sparkles className="h-4 w-4" />
        </span>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Ask the AI to change your plan"
          placeholder={sent ? '' : 'Ask the AI to change your plan…'}
          autoComplete="off"
          enterKeyHint="send"
          className="h-9 min-h-0 w-full min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        {/* Always in the DOM so screen readers announce the change. */}
        <span
          role="status"
          aria-live="polite"
          className={cn(
            'pointer-events-none absolute left-9 text-sm text-indigo-300 transition-opacity duration-200',
            sent && !text ? 'opacity-100' : 'opacity-0'
          )}
        >
          {sent ? 'Sent to the AI planner →' : ''}
        </span>
        <button
          type="submit"
          disabled={!text.trim()}
          aria-label="Send to the AI planner"
          title="Send to the AI planner"
          className="flex h-9 min-h-0 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white transition-colors hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-indigo-600"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </form>

      {suggestions.length > 0 && (
        <ul aria-label="Suggestions for this plan" className="mt-2 flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <li key={s.id} className="min-w-0 max-w-[24rem]">
              <button
                type="button"
                data-suggestion={s.id}
                title={s.prompt}
                onClick={() => sendPrompt(s.prompt)}
                className="h-7 min-h-0 max-w-full truncate rounded-full border border-slate-700 bg-slate-800/60 px-3 text-xs font-medium text-slate-300 transition-colors hover:border-indigo-500 hover:bg-indigo-600/15 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
