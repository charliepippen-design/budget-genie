import type { EngineRange, EngineResult } from './contract';

/**
 * The 12-month projection as a range per month: the cohort's cumulative value at P10 / P50 / P90,
 * one entry per point of `customerValue.curve`. Null when the engine gives no ranges.
 *
 * The contract has no per-month range yet, so each month takes the spread of the cohort's
 * lifetime value (`ranges.totals.revenue`) around the curve: the range is about how much value
 * the cohort brings, not about when it arrives.
 */
export function selectProjectionBand(result: EngineResult): EngineRange[] | null {
  const revenue = result.ranges?.totals.revenue;
  if (!revenue || !(revenue.p50 > 0)) return null;
  const low = revenue.p10 / revenue.p50;
  const high = revenue.p90 / revenue.p50;
  return result.customerValue.curve.map((point) => ({
    p10: point.cohortValue * low,
    p50: point.cohortValue,
    p90: point.cohortValue * high,
  }));
}
