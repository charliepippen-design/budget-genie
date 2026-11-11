import { useCurrency } from '@/contexts/CurrencyContext';
import { useMediaPlanStore, usePlanSnapshot } from '@/hooks/use-media-plan-store';

export interface OverBudgetInfo {
  overBudget: boolean;
  overBudgetBy: number;
  fixedSpend: number;
  totalBudget: number;
}

export function OverBudgetBannerView({ info }: { info: OverBudgetInfo }) {
  const { format } = useCurrency();
  if (!info.overBudget) return null;
  return (
    <div
      role="alert"
      data-testid="over-budget-banner"
      className="rounded-lg border border-amber-500/60 bg-amber-500/15 px-4 py-3 text-sm font-medium text-amber-800 dark:text-amber-200"
    >
      Over budget: fixed fees total {format(info.fixedSpend)}, which is{' '}
      {format(info.overBudgetBy)} more than your {format(info.totalBudget)} budget. Variable
      channels get nothing and the plan spends more than you set. Raise the budget or lower the
      fixed fees.
    </div>
  );
}

export function OverBudgetBanner() {
  const { overBudget, overBudgetBy, fixedSpend } = usePlanSnapshot();
  const totalBudget = useMediaPlanStore((s) => s.totalBudget);
  return <OverBudgetBannerView info={{ overBudget, overBudgetBy, fixedSpend, totalBudget }} />;
}
