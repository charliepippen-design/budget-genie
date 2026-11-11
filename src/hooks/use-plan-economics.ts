import { useMemo } from 'react';
import { useChannelsWithMetrics, useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { computePlanEconomics } from '@/lib/plan-economics';
import { roasPairFromEconomics } from '@/lib/roas-pair';
import { buildLtvCurve, buildPlanScenarios, DEFAULT_CHURN_RATE } from '@/lib/ltv-model';

/**
 * Plan totals, payback and cohort scenarios for /report and /output.
 * Uses the same LTV model (default assumptions) as the dashboard LTV lab so every screen agrees.
 */
export function usePlanEconomics() {
  const channels = useChannelsWithMetrics();
  const playerValue = useMediaPlanStore((s) => s.globalMultipliers.playerValue);
  const observedLtv = useMediaPlanStore((s) => s.observedLtv);
  const vertical = useMediaPlanStore((s) => s.onboardingVertical);
  const multipliers = useMediaPlanStore((s) => s.globalMultipliers);

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

    const economics = computePlanEconomics(
      { totalSpend, totalConversions: projectedFtds, projectedRevenue },
      vertical,
      multipliers
    );

    return {
      economics,
      active,
      totalSpend,
      projectedRevenue,
      projectedFtds,
      blendedCpa,
      blendedRoas,
      // Lifetime (cohort) and Month-1 ROAS, the pair every screen labels the same way.
      roasPair: roasPairFromEconomics(economics, blendedRoas),
      // Net value per month (month-1 value minus spend): the dashboard loss banner's number.
      netPnl: economics.netValuePerMonth,
      // Lifetime value of this month's cohort minus this month's spend.
      netCohort: economics.netValueCohort,
      // Month in which a customer's 12-month value first covers their acquisition cost.
      paybackMonths: curve.paybackMonth,
      // 12-month cumulative value per customer from the same curve payback is read from.
      paybackLtvPerUser: curve.points[11]?.cumulativeLtvPerUser ?? 0,
      ltvToCac12m: curve.points[11]?.ltvToCac ?? null,
      scenarioEnvelope: buildPlanScenarios(plan, model),
    };
  }, [channels, observedLtv, playerValue, vertical, multipliers]);
}
