import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

/**
 * Awaits an export, toasting success or the failure reason. Never rejects, so callers
 * can fire it from event handlers without swallowing errors silently.
 */
export async function runExport(label: string, task: () => Promise<void> | void): Promise<boolean> {
  try {
    await task();
    toast.success(`${label} export complete`);
    return true;
  } catch (error) {
    toast.error(error instanceof Error && error.message ? error.message : `${label} export failed`);
    return false;
  }
}

/** Wraps runExport with a loading state and a guard against concurrent exports. */
export function useExportRunner() {
  const [exporting, setExporting] = useState<string | null>(null);
  const busy = useRef(false);

  const run = useCallback(async (label: string, task: () => Promise<void> | void) => {
    if (busy.current) return false;
    busy.current = true;
    setExporting(label);
    try {
      return await runExport(label, task);
    } finally {
      busy.current = false;
      setExporting(null);
    }
  }, []);

  return { exporting, run };
}
