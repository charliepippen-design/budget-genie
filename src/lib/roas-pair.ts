import type { GlobalMultipliers } from '@/hooks/use-media-plan-store';
import { computePlanEconomics, type PlanEconomics } from '@/lib/plan-economics';
import type { Vertical } from '@/lib/vertical-presets';

export const LIFETIME_ROAS_LABEL = 'Lifetime ROAS (cohort)';
export const MONTH1_ROAS_LABEL = 'Month-1 ROAS';

export interface RoasPair {
  /** Lifetime value of the acquired cohort / spend (the blended ROAS the engine reports). */
  lifetime: number;
  /** Value earned in month 1 / spend, from computePlanEconomics; null when not computable. */
  month1: number | null;
}

/** Month-1 ROAS from the single P&L source; the lifetime figure is passed through unchanged. */
export function roasPairFromEconomics(economics: PlanEconomics, lifetime: number): RoasPair {
  const month1 =
    economics.computable && economics.monthlySpend > 0
      ? economics.monthlyValue / economics.monthlySpend
      : null;
  return { lifetime, month1 };
}

export function computeRoasPair(
  blended: {
    totalSpend: number;
    totalConversions: number;
    projectedRevenue: number;
    blendedRoas: number;
  },
  vertical: Vertical | null | undefined,
  multipliers: GlobalMultipliers
): RoasPair {
  return roasPairFromEconomics(
    computePlanEconomics(blended, vertical, multipliers),
    blended.blendedRoas
  );
}

const fmtX = (n: number) => `${n.toFixed(2)}x`;

/** Plain-text form for exports and engine-written copy. */
export function formatRoasPair(pair: RoasPair): string {
  const month1 = pair.month1 === null ? 'n/a' : fmtX(pair.month1);
  return `${LIFETIME_ROAS_LABEL} ${fmtX(pair.lifetime)}, ${MONTH1_ROAS_LABEL} ${month1}`;
}
