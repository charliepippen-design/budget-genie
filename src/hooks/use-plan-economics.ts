import { useMemo } from 'react';
import { useChannelsWithMetrics, useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { buildLtvCurve, buildPlanScenarios, DEFAULT_CHURN_RATE } from '@/lib/ltv-model';

/**
 * Plan totals, payback and cohort scenarios for /report and /output.
 * Uses the same LTV model (default assumptions) as the dashboard LTV lab so every screen agrees.
 */
export function usePlanEconomics() {
  const channels = useChannelsWithMetrics();
  const playerValue = useMediaPlanStore((s) => s.globalMultipliers.playerValue);
  const observedLtv = useMediaPlanStore((s) => s.observedLtv);

  return useMemo(() => {
    const active = channels.filter((c) => c.isActive && c.metrics.spend > 0);
    const totalSpend = active.reduce((s, c) => s + c.metrics.spend, 0);
    const projectedRevenue = active.reduce((s, c) => s + c.metrics.revenue, 0);
    const projectedFtds = active.reduce((s, c) => s + c.metrics.conversions, 0);
    const blendedCpa = projectedFtds > 0 ? totalSpend / projectedFtds : null;
    const blendedRoas = totalSpend > 0 ? projectedRevenue / totalSpend : 0;

    const plan = { totalSpend, totalConversions: projectedFtds, blendedCpa, blendedRoas };
    const model = { playerValue, blendedRoas, churnRate: DEFAULT_CHURN_RATE, observedLtv };
    const curve = buildLtvCurve(plan, model);

    return {
      active,
      totalSpend,
      projectedRevenue,
      projectedFtds,
      blendedCpa,
      blendedRoas,
      // Lifetime value of this month's cohort minus this month's spend.
      netPnl: projectedRevenue - totalSpend,
      // Month in which a customer's 12-month value first covers their acquisition cost.
      paybackMonths: curve.paybackMonth,
      ltvToCac12m: curve.points[11]?.ltvToCac ?? 0,
      scenarioEnvelope: buildPlanScenarios(plan, model),
    };
  }, [channels, observedLtv, playerValue]);
}
