import type { EngineMonthRange, EngineRange } from '@/engine/contract';

// Wording and formatting of the engine's ranges (P10 / P50 / P90). No maths here: the figures
// come from `EngineResult.ranges`.

export const RANGE_HINT = "Likely range (8 in 10 outcomes) under this plan's assumptions";

/** "310 – 480": the low and high end of a range, each formatted like its headline figure. */
export function formatRange(range: EngineRange, format: (value: number) => string): string {
  // Cost per conversion has its cheap end at p10, so the ends are ordered for display.
  return `${format(Math.min(range.p10, range.p90))} – ${format(Math.max(range.p10, range.p90))}`;
}

export interface PaybackLabel {
  text: string;
  tone: 'good' | 'bad';
  /** Shown next to the badge when the plan pays back in the expected case only. */
  caution: string | null;
}

/** The payback badge when the engine gives the payback month as a range (36-month horizon). */
export function paybackRangeLabel(payback: EngineMonthRange, horizonMonths = 36): PaybackLabel {
  const never = `No payback within ${horizonMonths} months`;
  if (payback.p50 === null) {
    return {
      text: payback.p10 === null ? never : `${never} (month ${payback.p10} at best)`,
      tone: 'bad',
      caution: null,
    };
  }
  const head = `Pays back in month ${payback.p50}`;
  if (payback.p90 === null) {
    return {
      text: payback.p10 === null ? head : `${head} (likely from month ${payback.p10})`,
      tone: 'good',
      caution: `${never} in the cautious case`,
    };
  }
  const spread = payback.p10 !== null && payback.p10 !== payback.p90;
  return { text: spread ? `${head} (likely ${payback.p10} – ${payback.p90})` : head, tone: 'good', caution: null };
}
