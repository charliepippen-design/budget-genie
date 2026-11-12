import { useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import { RangeLine } from '@/components/plan/RangeLine';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useBudgetEngine } from '@/hooks/use-budget-engine';
import {
  GLOBAL_BUDGET_CAP,
  MIN_BUDGET_CAP,
  useMediaPlanStore,
  usePlanResult,
} from '@/hooks/use-media-plan-store';
import { useTheme } from '@/hooks/use-theme';
import { useVerticalConfig } from '@/hooks/use-vertical-config';
import type { EngineRange } from '@/engine/contract';
import { MONTH1_ROAS_LABEL } from '@/lib/roas-pair';
import { cn } from '@/lib/utils';

const groupThousands = (value: number) => Math.round(value).toLocaleString('en-US');

/** The plan's headline numbers, always visible above the workspace tabs. The budget is editable in place. */
export function PlanKpiBar() {
  const { totals, economics, roas, ranges } = usePlanResult();
  const totalBudget = useMediaPlanStore((s) => s.totalBudget);
  const { updateBudget } = useBudgetEngine();
  const { format, symbol } = useCurrency();
  const vc = useVerticalConfig();
  const { theme } = useTheme();
  const isDark = theme === 'dark' || theme === 'contrast';

  const [draft, setDraft] = useState(groupThousands(totalBudget));
  useEffect(() => {
    setDraft(groupThousands(totalBudget));
  }, [totalBudget]);

  const commitBudget = () => {
    const parsed = Number(draft.replace(/[^\d]/g, ''));
    if (!draft.trim() || !Number.isFinite(parsed) || parsed <= 0) {
      setDraft(groupThousands(totalBudget));
      return;
    }
    // Fixed fees must fit in the budget; never below the store's floor.
    const floor = Math.max(MIN_BUDGET_CAP, totals.fixedTierSpend);
    const next = Math.min(GLOBAL_BUDGET_CAP, Math.max(floor, Math.round(parsed)));
    setDraft(groupThousands(next));
    if (next !== totalBudget) updateBudget(next);
  };

  const net = economics.computable ? economics.netValuePerMonth : null;
  const times = (value: number) => `${value.toFixed(2)}x`;
  // `range` is the engine's likely range for the figure, shown under it; absent with point estimates.
  const tiles: Array<{
    label: string;
    value: string;
    hint?: string;
    tone?: 'good' | 'bad';
    range?: EngineRange | null;
    rangeFormat?: (value: number) => string;
  }> = [
    {
      label: vc.terms.revenueMetric,
      value: format(totals.projectedRevenue),
      range: ranges?.totals.revenue,
      rangeFormat: format,
    },
    {
      label: vc.terms.costPerConversion,
      value: totals.blendedCpa === null ? 'n/a' : format(totals.blendedCpa),
      range: totals.blendedCpa === null ? null : ranges?.totals.costPerConversion,
      rangeFormat: format,
    },
    {
      label: 'Lifetime ROAS',
      value: times(roas.lifetime),
      hint: `${MONTH1_ROAS_LABEL} ${roas.month1 === null ? 'n/a' : times(roas.month1)}`,
      range: ranges?.totals.roas,
      rangeFormat: times,
    },
    {
      label: vc.terms.conversionPlural,
      value: groupThousands(totals.totalConversions),
      range: ranges?.totals.conversions,
      rangeFormat: groupThousands,
    },
    {
      label: 'Net / month',
      value: net === null ? 'n/a' : format(net),
      tone: net === null ? undefined : net < 0 ? 'bad' : 'good',
    },
  ];

  const tileClass = cn(
    'min-w-0 rounded-xl px-3.5 py-2.5',
    isDark ? 'bg-slate-900' : 'bg-white'
  );
  const labelClass = cn(
    'truncate text-[10px] font-semibold uppercase leading-4 tracking-wide',
    isDark ? 'text-slate-400' : 'text-slate-500'
  );

  return (
    <section
      aria-label="Plan summary"
      data-testid="plan-kpi-bar"
      className="grid grid-cols-3 gap-2 px-4 pt-3 lg:grid-cols-6"
    >
      <label
        className={cn(
          tileClass,
          'cursor-text ring-1 ring-transparent transition-shadow focus-within:ring-slate-500',
          isDark ? 'hover:ring-slate-700' : 'hover:ring-slate-300'
        )}
      >
        <span className={cn(labelClass, 'flex items-center gap-1.5')}>
          Budget / month <Pencil className="h-3 w-3" aria-hidden />
        </span>
        <span className="flex items-baseline gap-1">
          <span className="text-xl font-bold leading-7 tabular-nums">{symbol}</span>
          <input
            type="text"
            inputMode="numeric"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitBudget}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
            aria-label="Monthly budget"
            className="h-7 min-h-0 w-full min-w-0 border-0 bg-transparent p-0 text-xl font-bold leading-7 tabular-nums focus:outline-none focus:ring-0"
          />
        </span>
      </label>

      {tiles.map((tile) => (
        <div key={tile.label} className={tileClass}>
          <p className={labelClass}>{tile.label}</p>
          <p
            className={cn(
              'truncate text-xl font-bold leading-7 tabular-nums',
              tile.tone === 'bad' && 'text-rose-400',
              tile.tone === 'good' && 'text-emerald-400'
            )}
          >
            {tile.value}
          </p>
          {tile.rangeFormat ? <RangeLine range={tile.range} format={tile.rangeFormat} /> : null}
          {tile.hint ? (
            <p className="truncate text-[10px] leading-4 text-slate-500">
              {tile.hint}
            </p>
          ) : null}
        </div>
      ))}
    </section>
  );
}
