import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ExternalLink, KeyRound, Loader2 } from 'lucide-react';
import { aiErrorMessage, callAI } from '@/lib/ai-client';
import { cn } from '@/lib/utils';
import {
  AI_STUDIO_KEY_URL,
  clearUserAIKey,
  isUserAIKeyShape,
  maskUserAIKey,
  setUserAIKey,
  useUserAIKey,
} from '@/lib/user-ai-key';

// "AI connection": the user's own Google Gemini key (bring your own key). The shared key is a small
// trial for everyone; a user's own key has its own Google quota.

const KEY_TEST_PROMPT = 'Reply with this exact JSON and nothing else: {"ok":true}';

type Feedback = { tone: 'ok' | 'error'; text: string } | null;

const STEPS = [
  <>
    Open{' '}
    <a
      href={AI_STUDIO_KEY_URL}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1 font-semibold text-white underline underline-offset-2"
    >
      Google AI Studio <ExternalLink className="h-3 w-3" aria-hidden />
    </a>{' '}
    and sign in with your Google account.
  </>,
  <>Choose "Create API key" and copy the key.</>,
  <>Paste it here and choose "Test and save".</>,
];

export function AIConnectionCard({ className }: { className?: string }) {
  const savedKey = useUserAIKey();
  const [candidate, setCandidate] = useState('');
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const ref = useRef<HTMLElement>(null);

  // AI prompts elsewhere link to /settings#ai-connection.
  useEffect(() => {
    if (window.location.hash === '#ai-connection') ref.current?.scrollIntoView?.({ block: 'start' });
  }, []);

  // One minimal gateway call with the candidate key; it is saved only when that call succeeds.
  const testAndSave = async (e: FormEvent) => {
    e.preventDefault();
    const key = candidate.trim();
    if (!key || testing) return;
    if (!isUserAIKeyShape(key)) {
      setFeedback({ tone: 'error', text: 'That does not look like a Gemini API key. It starts with "AIza" and is 39 characters long.' });
      return;
    }
    setTesting(true);
    setFeedback(null);
    try {
      await callAI('json', { prompt: KEY_TEST_PROMPT }, undefined, { userKey: key });
      if (setUserAIKey(key)) {
        setCandidate('');
        setFeedback({ tone: 'ok', text: 'Key saved. AI requests from this browser now use it.' });
      } else {
        setFeedback({ tone: 'error', text: 'The key works, but this browser would not save it. Check that site storage is not blocked.' });
      }
    } catch (err) {
      setFeedback({ tone: 'error', text: `${aiErrorMessage(err, 'The test did not work.')} The key was not saved.` });
    } finally {
      setTesting(false);
    }
  };

  const remove = () => {
    clearUserAIKey();
    setCandidate('');
    setFeedback({ tone: 'ok', text: 'Key removed. AI requests use the shared trial again.' });
  };

  return (
    <section
      ref={ref}
      id="ai-connection"
      aria-labelledby="ai-connection-title"
      data-testid="ai-connection"
      className={cn('scroll-mt-6 rounded-2xl bg-[#2a2a2a] p-6', className)}
    >
      <div className="flex items-center gap-2">
        <KeyRound className="h-5 w-5 text-slate-400" aria-hidden />
        <h2 id="ai-connection-title" className="text-xl font-semibold text-white">
          AI connection
        </h2>
      </div>

      <p data-testid="ai-connection-status" className="mt-3 flex items-start gap-2 text-sm text-slate-200">
        <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', savedKey ? 'bg-emerald-400' : 'bg-slate-500')} aria-hidden />
        {savedKey ? (
          <span>
            Using your Gemini key <span className="font-mono tabular-nums text-white">{maskUserAIKey(savedKey)}</span>
          </span>
        ) : (
          <span>Using the shared trial: limited to a few messages a day for all users</span>
        )}
      </p>

      <div className="mt-5 grid gap-6 md:grid-cols-2">
        <form onSubmit={testAndSave} className="min-w-0 space-y-3">
          <label htmlFor="user-ai-key" className="block text-xs font-medium uppercase tracking-wider text-slate-400">
            {savedKey ? 'Replace with another key' : 'Your Gemini API key'}
          </label>
          <input
            id="user-ai-key"
            type="password"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-1p-ignore
            data-lpignore="true"
            value={candidate}
            onChange={(e) => {
              setCandidate(e.target.value);
              setFeedback(null);
            }}
            placeholder="AIza…"
            className="h-10 w-full min-w-0 rounded-full border border-slate-700 bg-[#1c1c1c] px-4 font-mono text-sm text-white placeholder:text-slate-500 focus:border-slate-400 focus:outline-none"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={!candidate.trim() || testing}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-indigo-600 px-4 text-sm font-semibold hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {testing ? 'Testing…' : 'Test and save'}
            </button>
            {savedKey ? (
              <button
                type="button"
                onClick={remove}
                disabled={testing}
                className="inline-flex h-9 items-center rounded-full border border-slate-700 px-4 text-sm font-semibold text-slate-200 hover:border-slate-500 hover:text-white disabled:opacity-50"
              >
                Remove key
              </button>
            ) : null}
          </div>
          <div role="status" aria-live="polite" data-testid="ai-connection-feedback" className="min-h-5 text-sm">
            {feedback ? (
              <p className={feedback.tone === 'ok' ? 'text-emerald-300' : 'text-amber-300'}>{feedback.text}</p>
            ) : null}
          </div>
          <p className="text-xs leading-relaxed text-slate-400">
            Your key is stored only in this browser and sent with your AI requests to our server, which forwards it to
            Google. We do not store it.
          </p>
        </form>

        <div className="min-w-0">
          <h3 className="text-xs font-medium uppercase tracking-wider text-slate-400">How to get a free key</h3>
          <ol className="mt-3 space-y-2 text-sm text-slate-300">
            {STEPS.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#1c1c1c] text-[11px] font-semibold tabular-nums text-slate-200">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs leading-relaxed text-slate-400">
            A free key has its own daily quota from Google. If you need more, enable billing on your Google account.
          </p>
        </div>
      </div>
    </section>
  );
}
