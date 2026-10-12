import { Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { hasPreApplyBackup, planFingerprint, restorePreApplyBackup } from '@/lib/crash-recovery';

/** Restores the plan saved before the last AI change, without a page reload. */
function undoAiChange(): boolean {
  if (!restorePreApplyBackup()) return false;
  // The backup is the persisted plan: load it back into the live store.
  void useMediaPlanStore.persist.rehydrate();
  return true;
}

/**
 * Shown only while an AI snapshot exists that differs from the current plan. The snapshot is written just before
 * the store changes, so re-checking on every store update keeps the button in sync.
 */
export function UndoAiChangeButton() {
  const visible = useMediaPlanStore((state) => hasPreApplyBackup(planFingerprint(state)));
  if (!visible) return null;

  const onClick = () => {
    if (undoAiChange()) toast.success('AI change undone');
    else toast.error('Nothing to undo');
  };

  return (
    <div className="border-b border-slate-800 px-4 py-2">
      <Button variant="outline" size="sm" className="h-8 w-full gap-2 text-xs" onClick={onClick}>
        <Undo2 className="h-3.5 w-3.5" /> Undo AI change
      </Button>
    </div>
  );
}
