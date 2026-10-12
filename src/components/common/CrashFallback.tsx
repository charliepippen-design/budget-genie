import { useState } from 'react';
import {
  buildDiagnostics,
  downloadDebugState,
  hasPreApplyBackup,
  resetPlanData,
  restorePreApplyBackup,
  type CrashInfo,
} from '@/lib/crash-recovery';

interface Props {
  title: string;
  error: Error;
  componentStack: string;
  className?: string;
  /** Remounts the children (the boundary bumps a key). */
  onRetry: () => void;
}

const BUTTON = 'rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted';
const PRIMARY = 'rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90';

/** The one crash screen shared by every error boundary. Always offers a way out. */
export function CrashFallback({ title, error, componentStack, className = '', onRetry }: Props) {
  const [copied, setCopied] = useState(false);
  const info: CrashInfo = { message: error.message, stack: error.stack ?? '', componentStack };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(buildDiagnostics(info), null, 2));
      setCopied(true);
    } catch {
      // clipboard blocked: the export button still works
    }
  };

  const reset = () => {
    if (!window.confirm('Reset your plan data? A backup is kept in this browser first.')) return;
    resetPlanData();
    window.location.assign('/app');
  };

  const undo = () => {
    if (restorePreApplyBackup()) window.location.assign('/app');
  };

  return (
    <div role="alert" className={`flex flex-col items-center gap-3 p-6 text-center text-foreground ${className}`}>
      <p className="text-lg font-semibold">{title}</p>
      <p className="max-w-md text-sm text-muted-foreground">Your plan is saved in this browser and has not been lost.</p>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" className={PRIMARY} onClick={onRetry}>
          Try again
        </button>
        <a href="/app" className={BUTTON}>
          Back to dashboard
        </a>
        <button type="button" className={BUTTON} onClick={() => window.location.reload()}>
          Reload
        </button>
        {hasPreApplyBackup() && (
          <button type="button" className={BUTTON} onClick={undo}>
            Undo last AI plan change
          </button>
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" className={BUTTON} onClick={() => downloadDebugState(info)}>
          Export debug state
        </button>
        <button type="button" className={BUTTON} onClick={copy}>
          {copied ? 'Copied' : 'Copy diagnostics'}
        </button>
        <button type="button" className={BUTTON} onClick={reset}>
          Reset plan data
        </button>
      </div>
      <p className="max-w-md break-words font-mono text-[11px] text-muted-foreground">{error.message}</p>
    </div>
  );
}
