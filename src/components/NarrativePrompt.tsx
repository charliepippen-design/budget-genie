import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { NarrativeError } from '@/hooks/use-report-narrative';

interface Props {
  loading: boolean;
  error: NarrativeError | null;
  onGenerate: () => void;
}

/** Shown instead of an AI summary until the user asks for one (it costs 1 AI message). */
export function NarrativePrompt({ loading, error, onGenerate }: Props) {
  return (
    <div className="space-y-3 print:hidden">
      <Button variant="outline" size="sm" onClick={onGenerate} disabled={loading}>
        <Sparkles className="mr-2 h-4 w-4" />
        {loading ? 'Writing AI summary...' : 'Write AI summary (uses 1 AI message)'}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error.message}
          {error.limit && (
            <a href="/pricing" className="ml-2 font-semibold text-indigo-300 underline">
              See plans
            </a>
          )}
        </p>
      )}
    </div>
  );
}
