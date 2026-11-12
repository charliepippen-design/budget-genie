import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTheme } from '@/hooks/use-theme';
import { cn } from '@/lib/utils';

/** What the engine assumed to produce its ranges, as the engine states it. */
export function RangeAssumptionsDialog({
  open,
  onOpenChange,
  assumptions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assumptions: string[];
}) {
  const { theme } = useTheme();
  const isDark = theme === 'dark' || theme === 'contrast';
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="range-assumptions"
        className={cn(
          'max-h-[85vh] max-w-lg gap-0 overflow-y-auto border-0 p-5 sm:rounded-2xl',
          isDark ? 'bg-slate-900 text-slate-100' : 'bg-white text-slate-900'
        )}
      >
        <DialogHeader className="pr-6">
          <DialogTitle className="text-base font-semibold leading-6">How these ranges are estimated</DialogTitle>
          <DialogDescription className={cn('text-sm leading-6', isDark ? 'text-slate-400' : 'text-slate-600')}>
            Ranges come from a planning model with stated assumptions, not from your campaign data. They narrow
            when you enter observed customer value.
          </DialogDescription>
        </DialogHeader>
        <ul className={cn('mt-4 space-y-2.5 text-sm leading-6', isDark ? 'text-slate-200' : 'text-slate-700')}>
          {assumptions.map((assumption) => (
            <li key={assumption} className="flex gap-2.5">
              <span
                className={cn('mt-2.5 h-1 w-1 shrink-0 rounded-full', isDark ? 'bg-slate-500' : 'bg-slate-400')}
                aria-hidden
              />
              <span className="min-w-0">{assumption}</span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
