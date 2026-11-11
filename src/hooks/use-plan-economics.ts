import { useMemo } from 'react';
import { usePlanResult } from '@/hooks/use-media-plan-store';

/**
 * Plan totals, payback and cohort scenarios for /report and /output, read from the engine result
 * so every screen shows the same numbers as the dashboard.
 */
export function usePlanEconomics() {
  const result = usePlanResult();

  return useMemo(() => {
    const { totals, economics, customerValue } = result;
    return {
      economics,
      active: result.channels.filter((c) => c.isActive && c.metrics.spend > 0),
      totalSpend: totals.totalSpend,
      projectedRevenue: totals.projectedRevenue,
      projectedFtds: totals.totalConversions,
      blendedCpa: totals.blendedCpa,
      blendedRoas: totals.blendedRoas,
      // Lifetime (cohort) and Month-1 ROAS, the pair every screen labels the same way.
      roasPair: result.roas,
      // Net value per month (month-1 value minus spend): the dashboard loss banner's number.
      netPnl: economics.netValuePerMonth,
      // Lifetime value of this month's cohort minus this month's spend.
      netCohort: economics.netValueCohort,
      // Month in which a customer's 12-month value first covers their acquisition cost.
      paybackMonths: customerValue.paybackMonth,
      // 12-month cumulative value per customer from the same curve payback is read from.
      paybackLtvPerUser: customerValue.valuePerCustomer12m,
      ltvToCac12m: customerValue.ltvToCac12m,
      scenarioEnvelope: result.scenarios,
    };
  }, [result]);
}
