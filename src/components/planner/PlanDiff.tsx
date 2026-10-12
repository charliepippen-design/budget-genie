import { useCurrency } from '@/contexts/CurrencyContext';
import type { PlanDiffSide } from '@/lib/planner-agent';

const marketLabel = (s: PlanDiffSide) =>
  `${s.markets.length ? s.markets.join(', ') : 'Global'} (T1 ${s.tiers.tier1}% / T2 ${s.tiers.tier2}% / T3 ${s.tiers.tier3}%)`;

/** Compact before/after comparison of the headline numbers and market split. */
export function PlanDiff({ before, after }: { before: PlanDiffSide; after: PlanDiffSide }) {
  const { format } = useCurrency();
  const money = (n: number | null) => (typeof n === 'number' ? format(n) : '-');
  const roas = (n: number | null) => (typeof n === 'number' ? `${n.toFixed(2)}x` : '-');
  const rows: [string, string, string][] = [
    ['Budget', money(before.totalBudget), money(after.totalBudget)],
    ['Revenue', money(before.revenue), money(after.revenue)],
    ['ROAS', roas(before.roas), roas(after.roas)],
    ['Markets', marketLabel(before), marketLabel(after)],
  ];
  return (
    <div data-testid="plan-diff" className="mt-2 space-y-0.5">
      {rows.map(([label, from, to]) => (
        <div key={label} className="flex justify-between gap-2">
          <span className="text-slate-500">{label}</span>
          <span className="min-w-0 text-right tabular-nums">
            {from === to ? to : `${from} → ${to}`}
          </span>
        </div>
      ))}
    </div>
  );
}
