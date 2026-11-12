// Small closed-form statistics used by the response-curve engine. Everything here is exact
// arithmetic on its arguments: no sampling, no randomness.

import type { EngineRange } from '../contract';

/** Standard normal quantile at 90%: P10 and P90 sit this many standard deviations from the median. */
export const Z_90 = 1.2815515655446004;

/**
 * P10 / P50 / P90 of a quantity that is log-normal around `median`: its logarithm is normal
 * with standard deviation `logSd`. A zero median gives a zero range.
 */
export function lognormalRange(median: number, logSd: number): EngineRange {
  if (!(median > 0) || !Number.isFinite(median)) return { p10: 0, p50: 0, p90: 0 };
  const spread = Math.exp(Z_90 * Math.max(0, logSd));
  return { p10: median / spread, p50: median, p90: median * spread };
}

/** The range of `numerator / x` when `x` has the given range (so the ends swap). */
export function reciprocalRange(numerator: number, range: EngineRange): EngineRange | null {
  if (!(range.p10 > 0) || !(range.p50 > 0) || !(range.p90 > 0)) return null;
  return { p10: numerator / range.p90, p50: numerator / range.p50, p90: numerator / range.p10 };
}

export function scaleRange(range: EngineRange, factor: number): EngineRange {
  return { p10: range.p10 * factor, p50: range.p50 * factor, p90: range.p90 * factor };
}

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const logit = (p: number) => Math.log(p / (1 - p));
export const logistic = (x: number) => 1 / (1 + Math.exp(-x));

/** A finite number, or `fallback` for NaN / Infinity / non-numbers. */
export const finiteOr = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
