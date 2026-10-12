import type { BlendedMetrics, GlobalMultipliers } from '@/hooks/use-media-plan-store';
import type { Vertical } from '@/lib/vertical-presets';
import { computePlanEconomics } from '@/lib/plan-economics';

export interface PlanHealth {
  losesMoney: boolean;
  /** Month-1 net value of the acquired customers minus spend, per month. */
  monthlyContribution: number;
  /** CPA at which contribution per acquired customer is zero; null when not computable. */
  breakEvenCpa: number | null;
  blendedCpa: number | null;
  /** Lifetime cohort net value (the same figure as the report's Net Value). */
  cohortNetValue?: number;
}

/**
 * Plan health for the dashboard banner: a view over computePlanEconomics, the single
 * source of the plan's P&L (see it for the period definitions).
 * Not computable (losesMoney false, breakEvenCpa null) when spend or customers are zero.
 */
export function computePlanHealth(
  blended: Pick<BlendedMetrics, 'totalSpend' | 'totalConversions' | 'projectedRevenue'>,
  vertical: Vertical | null | undefined,
  multipliers: GlobalMultipliers
): PlanHealth {
  const e = computePlanEconomics(blended, vertical, multipliers);
  return {
    losesMoney: e.losesMoney,
    monthlyContribution: e.netValuePerMonth,
    breakEvenCpa: e.breakEvenCpa,
    blendedCpa: e.blendedCpa,
    cohortNetValue: e.computable ? e.netValueCohort : undefined,
  };
}
