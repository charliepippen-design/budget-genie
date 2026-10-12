import {
  calculateIgamingRevenueMonth,
  isIgamingVertical,
  normalizeIgamingRevenueInputs,
} from '@/lib/igaming-revenue-model';
import type { GlobalMultipliers } from '@/hooks/use-media-plan-store';
import type { Vertical } from '@/lib/vertical-presets';

export interface PlanEconomicsInput {
  totalSpend: number;
  totalConversions: number;
  /** Lifetime value of the acquired cohort (sum of channel revenue, playerValue based). */
  projectedRevenue: number;
}

/**
 * The plan's P&L on two explicit periods. Every screen that shows a net value,
 * loss warning or break-even CPA must read it from here.
 *
 *   month 1 : value earned in the first month (iGaming NGR waterfall, no retention
 *             carry-over; other verticals: projected revenue) minus this month's spend.
 *   cohort  : lifetime value of the customers acquired this month minus the same spend.
 */
export interface PlanEconomics {
  computable: boolean;
  /** Spend for one month (the plan is a monthly budget). */
  monthlySpend: number;
  blendedCpa: number | null;
  /** Value earned in month 1 by this month's customers. */
  monthlyValue: number;
  /** Month 1 value minus monthly spend: the "per month" net value. */
  netValuePerMonth: number;
  /** Lifetime cohort value. */
  cohortValue: number;
  /** Cohort lifetime value minus monthly spend. */
  netValueCohort: number;
  /** CPA at which month-1 contribution per customer is zero; null when not computable. */
  breakEvenCpa: number | null;
  /** CPA at which lifetime contribution per customer is zero. */
  breakEvenCpaCohort: number | null;
  /** True when the month-1 net value is negative. */
  losesMoney: boolean;
  /** True when even the lifetime cohort value does not cover spend. */
  losesMoneyCohort: boolean;
}

const EMPTY: PlanEconomics = {
  computable: false,
  monthlySpend: 0,
  blendedCpa: null,
  monthlyValue: 0,
  netValuePerMonth: 0,
  cohortValue: 0,
  netValueCohort: 0,
  breakEvenCpa: null,
  breakEvenCpaCohort: null,
  losesMoney: false,
  losesMoneyCohort: false,
};

export function computePlanEconomics(
  plan: PlanEconomicsInput,
  vertical: Vertical | null | undefined,
  multipliers: GlobalMultipliers
): PlanEconomics {
  const { totalSpend, totalConversions } = plan;
  if (
    !Number.isFinite(totalSpend) ||
    !Number.isFinite(totalConversions) ||
    totalSpend <= 0 ||
    totalConversions <= 0
  ) {
    return { ...EMPTY, monthlySpend: Number.isFinite(totalSpend) ? Math.max(0, totalSpend) : 0 };
  }

  const cohortValue = plan.projectedRevenue;
  let monthlyValue = cohortValue;
  if (isIgamingVertical(vertical)) {
    const inputs = normalizeIgamingRevenueInputs(multipliers, multipliers.playerValue);
    monthlyValue = calculateIgamingRevenueMonth(
      { ftds: totalConversions, marketingCost: totalSpend },
      0,
      inputs
    ).ngr;
  }
  if (!Number.isFinite(monthlyValue) || !Number.isFinite(cohortValue)) {
    return { ...EMPTY, monthlySpend: totalSpend };
  }

  const netValuePerMonth = monthlyValue - totalSpend;
  const netValueCohort = cohortValue - totalSpend;
  return {
    computable: true,
    monthlySpend: totalSpend,
    blendedCpa: totalSpend / totalConversions,
    monthlyValue,
    netValuePerMonth,
    cohortValue,
    netValueCohort,
    breakEvenCpa: monthlyValue / totalConversions,
    breakEvenCpaCohort: cohortValue / totalConversions,
    losesMoney: netValuePerMonth < 0,
    losesMoneyCohort: netValueCohort < 0,
  };
}
