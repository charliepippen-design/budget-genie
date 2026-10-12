import {
  calculateIgamingRevenueMonth,
  isIgamingVertical,
  normalizeIgamingRevenueInputs,
} from '@/lib/igaming-revenue-model';
import type { BlendedMetrics, GlobalMultipliers } from '@/hooks/use-media-plan-store';
import type { Vertical } from '@/lib/vertical-presets';

export interface PlanHealth {
  losesMoney: boolean;
  /** Net value of the acquired customers minus spend, for one month. */
  monthlyContribution: number;
  /** CPA at which contribution per acquired customer is zero; null when not computable. */
  breakEvenCpa: number | null;
  blendedCpa: number | null;
}

/**
 * Pure plan health check.
 *
 *   valuePerCustomer = netValue / customers
 *   contribution     = netValue - spend = customers * (valuePerCustomer - CPA)
 *   breakEvenCpa     = valuePerCustomer   (contribution per customer is zero)
 *
 * netValue is NGR for iGaming (same waterfall as the P&L: GGR - bonus, first
 * month so no retention carry-over) and projected revenue for other verticals.
 * Not computable (losesMoney false, breakEvenCpa null) when spend or customers are zero.
 */
export function computePlanHealth(
  blended: Pick<BlendedMetrics, 'totalSpend' | 'totalConversions' | 'projectedRevenue'>,
  vertical: Vertical | null | undefined,
  multipliers: GlobalMultipliers
): PlanHealth {
  const { totalSpend, totalConversions } = blended;
  const finite = Number.isFinite(totalSpend) && Number.isFinite(totalConversions);
  if (!finite || totalSpend <= 0 || totalConversions <= 0) {
    return { losesMoney: false, monthlyContribution: 0, breakEvenCpa: null, blendedCpa: null };
  }

  let netValue = blended.projectedRevenue;
  if (isIgamingVertical(vertical)) {
    const inputs = normalizeIgamingRevenueInputs(multipliers, multipliers.playerValue);
    netValue = calculateIgamingRevenueMonth(
      { ftds: totalConversions, marketingCost: totalSpend },
      0,
      inputs
    ).ngr;
  }
  if (!Number.isFinite(netValue)) {
    return { losesMoney: false, monthlyContribution: 0, breakEvenCpa: null, blendedCpa: null };
  }

  const monthlyContribution = netValue - totalSpend;
  return {
    losesMoney: monthlyContribution < 0,
    monthlyContribution,
    breakEvenCpa: netValue / totalConversions,
    blendedCpa: totalSpend / totalConversions,
  };
}
