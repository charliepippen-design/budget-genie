import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCurrency } from '@/contexts/CurrencyContext';
import { computeOptimisedMix, type OptimiseGoal, type OptimisedMix } from '@/engine';
import { useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { useTheme } from '@/hooks/use-theme';
import { useVerticalConfig } from '@/hooks/use-vertical-config';
import { cn } from '@/lib/utils';

const whole = (value: number) => Math.round(value).toLocaleString('en-US');

/**
 * Asks the engine for a better split of the budget, shows before and after, and applies it on
 * request. Every figure comes from the optimiser result; nothing changes until Apply.
 */
export function OptimiseMixDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const cpaTarget = useMediaPlanStore((s) => s.globalMultipliers.cpaTarget);
  const totalBudget = useMediaPlanStore((s) => s.totalBudget);
  const setAllocations = useMediaPlanStore((s) => s.setAllocations);
  const setTotalBudget = useMediaPlanStore((s) => s.setTotalBudget);
  const { format, symbol } = useCurrency();
  const vc = useVerticalConfig();
  const { theme } = useTheme();
  const isDark = theme === 'dark' || theme === 'contrast';

  const [goal, setGoal] = useState<OptimiseGoal>('conversions');
  const [maxCost, setMaxCost] = useState('');
  const [mix, setMix] = useState<OptimisedMix | null>(null);

  // Each opening starts from the plan as it is now.
  useEffect(() => {
    if (!open) return;
    setGoal('conversions');
    setMaxCost(cpaTarget && cpaTarget > 0 ? String(cpaTarget) : '');
    setMix(null);
  }, [open, cpaTarget]);

  const parsedMax = Number(maxCost.replace(/[^\d.]/g, ''));
  const ceiling = maxCost.trim() && Number.isFinite(parsedMax) && parsedMax > 0 ? parsedMax : null;

  const preview = () =>
    setMix(
      computeOptimisedMix(useMediaPlanStore.getState(), {
        goal,
        constraints: { maxCostPerConversion: ceiling },
      })
    );

  const apply = () => {
    if (!mix) return;
    // Both writes land in the same undo step (history records the plan once it settles).
    setAllocations(mix.shares);
    if (mix.budget !== totalBudget) setTotalBudget(mix.budget);
    toast.success('Mix optimised. Undo with Ctrl+Z.');
    onOpenChange(false);
  };

  const conversions = vc.terms.conversionPlural;
  const costLabel = vc.terms.costPerConversion;
  const goals: Array<{ id: OptimiseGoal; label: string }> = [
    { id: 'conversions', label: `More ${conversions}` },
    { id: 'value', label: 'More customer value' },
    { id: 'net', label: 'More net value' },
  ];

  const mutedClass = isDark ? 'text-slate-400' : 'text-slate-500';
  const headClass = cn('text-[10px] font-semibold uppercase leading-4 tracking-wide', mutedClass);
  const wellClass = cn('rounded-xl px-3.5 py-3', isDark ? 'bg-slate-950/60' : 'bg-slate-50');
  const rowClass = 'grid grid-cols-[minmax(0,1fr)_auto_1rem_auto] items-center gap-x-2';
  const quietPill = cn(
    'min-h-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors',
    isDark ? 'bg-slate-800 text-slate-100 hover:bg-slate-700' : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
  );
  const primaryPill = 'min-h-0 rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold hover:bg-indigo-500';

  const cost = (value: number | null) => (value === null ? 'n/a' : format(value));
  const rows = mix
    ? [
        { label: conversions, before: whole(mix.result.before.conversions), after: whole(mix.result.after.conversions) },
        { label: 'Customer value', before: format(mix.result.before.value), after: format(mix.result.after.value) },
        {
          label: costLabel,
          before: cost(mix.result.before.costPerConversion),
          after: cost(mix.result.after.costPerConversion),
        },
        { label: 'Net value', before: format(mix.result.before.net), after: format(mix.result.after.net) },
      ]
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="optimise-mix"
        className={cn(
          'max-h-[90vh] max-w-md gap-0 overflow-y-auto border-0 p-5 sm:rounded-2xl',
          isDark ? 'bg-slate-900 text-slate-100' : 'bg-white text-slate-900'
        )}
      >
        <DialogHeader className="pr-6">
          <DialogTitle className="text-base font-semibold leading-6">Optimise mix</DialogTitle>
          <DialogDescription className={cn('text-xs leading-5', mutedClass)}>
            Finds the split of this budget that does most for your goal. Locked and switched-off channels stay as
            they are.
          </DialogDescription>
        </DialogHeader>

        <p className={cn('mt-4', headClass)}>Goal</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Goal">
          {goals.map((option) => {
            const selected = option.id === goal;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  setGoal(option.id);
                  setMix(null);
                }}
                className={cn(
                  'min-h-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                  selected
                    ? isDark
                      ? 'border-slate-100 bg-slate-100 text-slate-900'
                      : 'border-slate-900 bg-slate-900 text-white'
                    : isDark
                      ? 'border-slate-700 text-slate-200 hover:border-slate-500'
                      : 'border-slate-300 text-slate-700 hover:border-slate-500'
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <label className="mt-4 block">
          <span className={headClass}>Max {costLabel.toLowerCase()} (optional)</span>
          <span
            className={cn(
              'mt-1.5 flex items-center gap-1.5 rounded-xl px-3.5 py-2 ring-1 ring-transparent focus-within:ring-slate-500',
              isDark ? 'bg-slate-950/60' : 'bg-slate-50'
            )}
          >
            <span className={cn('text-sm tabular-nums', mutedClass)}>{symbol}</span>
            <input
              type="text"
              inputMode="decimal"
              value={maxCost}
              placeholder="No limit"
              onChange={(event) => {
                setMaxCost(event.target.value);
                setMix(null);
              }}
              aria-label={`Max ${costLabel.toLowerCase()}`}
              className="h-6 min-h-0 w-full min-w-0 border-0 bg-transparent p-0 text-sm tabular-nums placeholder:text-slate-500 focus:outline-none focus:ring-0"
            />
          </span>
        </label>

        {mix ? (
          <div className="mt-4 space-y-3" data-testid="optimise-preview">
            {!mix.result.feasible && ceiling !== null ? (
              <p className="text-xs leading-5 text-amber-400">
                That cost limit is out of reach with these channels. This is the best split without it.
              </p>
            ) : null}
            {mix.material ? (
              <>
                <div className={wellClass}>
                  <div className={cn(rowClass, 'pb-1', headClass)}>
                    <span>Plan</span>
                    <span className="text-right">Now</span>
                    <span />
                    <span className="text-right">After</span>
                  </div>
                  {rows.map((row) => (
                    <div key={row.label} data-testid="optimise-row" className={cn(rowClass, 'py-1 text-sm leading-5')}>
                      <span className="truncate">{row.label}</span>
                      <span className={cn('text-right tabular-nums', mutedClass)}>{row.before}</span>
                      <ArrowRight className={cn('h-3 w-3', mutedClass)} aria-hidden />
                      <span className="text-right font-semibold tabular-nums">{row.after}</span>
                    </div>
                  ))}
                </div>

                {mix.changes.length > 0 ? (
                  <div className={wellClass}>
                    <p className={cn('pb-1', headClass)}>Share of spend</p>
                    {mix.changes.map((change) => (
                      <div
                        key={change.id}
                        data-testid="optimise-change"
                        className={cn(rowClass, 'py-1 text-sm leading-5')}
                      >
                        <span className="truncate" title={change.name}>
                          {change.name}
                        </span>
                        <span className={cn('text-right tabular-nums', mutedClass)}>{change.beforePct.toFixed(1)}%</span>
                        <ArrowRight className={cn('h-3 w-3', mutedClass)} aria-hidden />
                        <span className="text-right font-semibold tabular-nums">{change.afterPct.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                ) : null}

                {mix.budget !== totalBudget ? (
                  <p className={cn('text-xs leading-5', mutedClass)}>
                    This split needs {format(mix.budget)} of the {format(totalBudget)} budget: the rest would not
                    help this goal. Apply also sets the budget to {format(mix.budget)}.
                  </p>
                ) : null}
              </>
            ) : (
              <p className={cn(wellClass, 'text-sm leading-6')}>
                This mix is already close to the best split for that goal.
              </p>
            )}
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => onOpenChange(false)} className={quietPill}>
            {mix && !mix.material ? 'Close' : 'Cancel'}
          </button>
          {mix ? (
            mix.material ? (
              <button type="button" onClick={apply} className={primaryPill}>
                Apply
              </button>
            ) : null
          ) : (
            <button type="button" onClick={preview} className={primaryPill}>
              Preview
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
