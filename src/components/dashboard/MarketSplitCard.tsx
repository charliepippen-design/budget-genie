import { selectMarketSplit, useMediaPlanStore } from '@/hooks/use-media-plan-store';

/** Where the plan targets its budget: the markets and the tier split behind the numbers. */
export function MarketSplitCard() {
  const brief = useMediaPlanStore((state) => state.brief);
  const activeGeos = useMediaPlanStore((state) => state.activeGeos);
  const activeTiers = useMediaPlanStore((state) => state.activeTiers);
  const { markets, tiers } = selectMarketSplit({ brief, activeGeos, activeTiers });
  if (markets.length === 0) return null;

  return (
    <div
      data-testid="market-split"
      className="rounded-xl border border-slate-200 bg-white p-4 text-sm dark:border-slate-700/50 dark:bg-slate-800/50"
    >
      <div className="font-semibold">Target markets</div>
      <div className="mt-1 text-slate-600 dark:text-slate-300">{markets.join(', ')}</div>
      <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        Tier 1 {Math.round(tiers.tier1)}% / Tier 2 {Math.round(tiers.tier2)}% / Tier 3 {Math.round(tiers.tier3)}%
      </div>
    </div>
  );
}
