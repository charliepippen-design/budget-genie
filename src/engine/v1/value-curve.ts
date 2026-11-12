// Value over time: when the lifetime value of a customer is earned.
//
// Retention is a survival curve with churn that slows down among survivors,
//   S(t) = r ^ (t ^ k)        share of customers still active t months after converting,
// where r is the first-month retention and k <= 1 the shape (both priors by industry). A share
// `u` of lifetime value is earned at conversion; the rest is earned in proportion to the
// customers still active:
//   share(month m) = u * [m = 1] + (1 - u) * S(m - 1) / sum_{j < H} S(j),   H = value horizon.
// The stated lifetime value fixes the level and retention only the timing, so the two are
// separate unknowns: how much a customer is worth, and how soon.
//
// Value per customer the user has observed at months 1, 3 and 6 calibrates both: a
// conjugate-normal update of the level (in log space) at the most probable retention.

import type { GlobalMultipliers, ObservedLtvInputs } from '@/lib/media-plan/types';
import type { Vertical } from '@/lib/vertical-presets';
import type { EngineMonthRange } from '../contract';
import {
  OBSERVATION_LOG_SD,
  RETENTION_BOUNDS,
  RETENTION_BY_INDUSTRY,
  RETENTION_LOGIT_SD,
  VALUE_HORIZON_MONTHS,
} from './priors';
import { Z_90, clamp, logistic, logit } from './stats';

export interface ValueCurve {
  /** Share of the stated lifetime value earned in month 1..H (index 0 = month 1). */
  monthlyShare: number[];
  /** Running total of `monthlyShare`; ends at `lifetimeMultiplier`. */
  cumulativeShare: number[];
  /** Share of customers still active at the start of month 1..H (index 0 = 1). */
  survival: number[];
  /** Multiplier on the stated lifetime value implied by the observed points (1 without any). */
  valueFactor: number;
  /** Lifetime under the lab's churn stress relative to the unstressed curve (1 outside the lab). */
  lifetimeMultiplier: number;
  /** Standard deviation of log(lifetime value) after calibration. */
  valueLogSd: number;
  firstMonthRetention: number;
  shape: number;
  isCalibrated: boolean;
}

export interface ValueCurveInput {
  industry: Vertical | null;
  assumptions: Pick<GlobalMultipliers, 'retentionRate'>;
  observed: ObservedLtvInputs;
  /** Blended lifetime value per conversion the plan states, before calibration (0 when unknown). */
  statedValuePerCustomer: number;
  /** The customer-value lab's stress: churn speed and shape multipliers (see priors/retention.ts). */
  stress?: { churnSpeed: number; shape: number };
}

const HORIZON = VALUE_HORIZON_MONTHS;
/** Grid over the retention shift, in prior standard deviations. */
const GRID_STEPS = 21;
const GRID_HALF_WIDTH = 2.5;

function survivalCurve(retention: number, shape: number): number[] {
  const logRetention = Math.log(retention);
  const curve = new Array<number>(HORIZON);
  for (let t = 0; t < HORIZON; t += 1) curve[t] = t === 0 ? 1 : Math.exp(logRetention * Math.pow(t, shape));
  return curve;
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

/** Share of lifetime value earned by the end of month `month` for a survival curve. */
function cumulativeShareAt(survival: number[], upfrontShare: number, month: number): number {
  let partial = 0;
  for (let t = 0; t < month; t += 1) partial += survival[t];
  return upfrontShare + ((1 - upfrontShare) * partial) / sum(survival);
}

function observedPoints(observed: ObservedLtvInputs): Array<{ month: number; value: number }> {
  return [
    { month: 1, value: observed?.m1 },
    { month: 3, value: observed?.m3 },
    { month: 6, value: observed?.m6 },
  ].filter((point): point is { month: number; value: number } =>
    typeof point.value === 'number' && Number.isFinite(point.value) && point.value > 0
  );
}

export function priorRetention(industry: Vertical | null, assumptions: Pick<GlobalMultipliers, 'retentionRate'>) {
  const prior = RETENTION_BY_INDUSTRY[industry ?? 'other'] ?? RETENTION_BY_INDUSTRY.other;
  // iGaming plans carry their own retention setting; it replaces the industry figure.
  const stated = industry === 'igaming' ? assumptions.retentionRate : NaN;
  const firstMonthRetention = clamp(
    Number.isFinite(stated) && stated > 0 ? stated : prior.firstMonthRetention,
    RETENTION_BOUNDS.min,
    RETENTION_BOUNDS.max
  );
  return { ...prior, firstMonthRetention };
}

export function buildValueCurve(input: ValueCurveInput): ValueCurve {
  const prior = priorRetention(input.industry, input.assumptions);
  const { shape, upfrontShare } = prior;
  let retention = prior.firstMonthRetention;
  let valueFactor = 1;
  let valueLogSd = prior.valueLogSd;

  const points = observedPoints(input.observed);
  const isCalibrated = points.length > 0 && input.statedValuePerCustomer > 0;
  if (isCalibrated) {
    // Model: log(observed_k) = log(stated value * share(t_k; retention)) + a + noise_k,
    // a ~ N(0, valueLogSd^2), noise ~ N(0, OBSERVATION_LOG_SD^2), logit(retention) ~ N(prior, RETENTION_LOGIT_SD^2).
    // For a given retention, `a` has a closed-form normal posterior and the data a closed-form
    // marginal likelihood, so the retention's posterior is a function of one variable.
    const noiseVar = OBSERVATION_LOG_SD * OBSERVATION_LOG_SD;
    const precision = 1 / (valueLogSd * valueLogSd) + points.length / noiseVar;
    const priorLogit = logit(retention);
    const retentionAt = (shift: number) =>
      clamp(logistic(priorLogit + shift), RETENTION_BOUNDS.min, RETENTION_BOUNDS.max);
    /** Posterior mean of the level `a` and the log posterior density (up to a constant) at a retention shift. */
    const evaluate = (shift: number) => {
      const survival = survivalCurve(retentionAt(shift), shape);
      let residualSum = 0;
      let residualSq = 0;
      for (const point of points) {
        const expected = input.statedValuePerCustomer * cumulativeShareAt(survival, upfrontShare, point.month);
        const residual = Math.log(point.value / expected);
        residualSum += residual;
        residualSq += residual * residual;
      }
      const z = shift / RETENTION_LOGIT_SD;
      return {
        level: residualSum / noiseVar / precision,
        logPosterior: -0.5 * (residualSq / noiseVar - (residualSum / noiseVar) ** 2 / precision) - 0.5 * z * z,
      };
    };

    // 1. A grid over the retention: finds the best region and how much the level varies across
    //    level varies across plausible retentions (the uncertainty about timing the points leave open).
    const step = (2 * GRID_HALF_WIDTH * RETENTION_LOGIT_SD) / (GRID_STEPS - 1);
    const grid = Array.from({ length: GRID_STEPS }, (_, i) => {
      const shift = -GRID_HALF_WIDTH * RETENTION_LOGIT_SD + i * step;
      return { shift, ...evaluate(shift) };
    });
    const best = grid.reduce((top, node) => (node.logPosterior > top.logPosterior ? node : top), grid[0]);
    let weightTotal = 0;
    let mean = 0;
    let meanSq = 0;
    grid.forEach((node) => {
      const weight = Math.exp(node.logPosterior - best.logPosterior);
      weightTotal += weight;
      mean += weight * node.level;
      meanSq += weight * node.level * node.level;
    });
    mean /= weightTotal;
    const levelVarAcrossRetention = Math.max(0, meanSq / weightTotal - mean * mean);

    // 2. The most probable retention, refined by golden-section search around the best grid node.
    const GOLDEN = (Math.sqrt(5) - 1) / 2;
    let low = best.shift - step;
    let high = best.shift + step;
    let x1 = high - GOLDEN * (high - low);
    let x2 = low + GOLDEN * (high - low);
    let f1 = evaluate(x1).logPosterior;
    let f2 = evaluate(x2).logPosterior;
    for (let i = 0; i < 40; i += 1) {
      if (f1 < f2) {
        low = x1;
        x1 = x2;
        f1 = f2;
        x2 = low + GOLDEN * (high - low);
        f2 = evaluate(x2).logPosterior;
      } else {
        high = x2;
        x2 = x1;
        f2 = f1;
        x1 = high - GOLDEN * (high - low);
        f1 = evaluate(x1).logPosterior;
      }
    }
    const shift = (low + high) / 2;
    if (Number.isFinite(shift) && Number.isFinite(weightTotal)) {
      retention = retentionAt(shift);
      valueFactor = Math.exp(evaluate(shift).level);
      // Never wider than the prior: observations can only add information.
      valueLogSd = Math.min(valueLogSd, Math.sqrt(1 / precision + levelVarAcrossRetention));
    }
  }

  const baseSurvival = survivalCurve(retention, shape);
  const baseLifetime = sum(baseSurvival);
  // The lab's stress changes how long customers stay while a month of an active customer is
  // worth the same, so the stressed curve adds up to more or less than the lifetime value.
  const stress = input.stress;
  const survival = stress
    ? survivalCurve(
        clamp(Math.pow(retention, Math.max(0.01, stress.churnSpeed)), 1e-6, RETENTION_BOUNDS.max),
        clamp(shape * stress.shape, 0.1, 1)
      )
    : baseSurvival;

  const monthlyShare = new Array<number>(HORIZON);
  const cumulativeShare = new Array<number>(HORIZON);
  let running = 0;
  for (let m = 0; m < HORIZON; m += 1) {
    monthlyShare[m] = (m === 0 ? upfrontShare : 0) + ((1 - upfrontShare) * survival[m]) / baseLifetime;
    running += monthlyShare[m];
    cumulativeShare[m] = running;
  }

  return {
    monthlyShare,
    cumulativeShare,
    survival,
    valueFactor,
    lifetimeMultiplier: running,
    valueLogSd,
    firstMonthRetention: retention,
    shape,
    isCalibrated,
  };
}

/**
 * First month (1-based) in which cumulative value per customer covers the cost per conversion;
 * null when it never does within `maxMonth`. `valuePerCustomer` is the lifetime value.
 */
export function paybackMonth(
  curve: ValueCurve,
  valuePerCustomer: number,
  costPerConversion: number | null,
  maxMonth = HORIZON
): number | null {
  if (!costPerConversion || !(costPerConversion > 0) || !(valuePerCustomer > 0)) return null;
  const limit = Math.min(maxMonth, curve.cumulativeShare.length);
  for (let m = 0; m < limit; m += 1) {
    if (valuePerCustomer * curve.cumulativeShare[m] >= costPerConversion) return m + 1;
  }
  return null;
}

/** Payback as a fraction of months (linear within the month it happens in); null when never. */
export function paybackMonthsExact(
  curve: ValueCurve,
  valuePerCustomer: number,
  costPerConversion: number | null
): number | null {
  const month = paybackMonth(curve, valuePerCustomer, costPerConversion);
  if (month === null || !costPerConversion) return null;
  const before = month === 1 ? 0 : valuePerCustomer * curve.cumulativeShare[month - 2];
  const after = valuePerCustomer * curve.cumulativeShare[month - 1];
  return after > before ? month - 1 + (costPerConversion - before) / (after - before) : month;
}

/**
 * Payback month as a range. The ratio value / cost is log-normal with `ratioLogSd`, so the early
 * end (p10) is the payback when the ratio is at its P90 and the late end when it is at its P10.
 */
export function paybackRange(
  curve: ValueCurve,
  valuePerCustomer: number,
  costPerConversion: number | null,
  ratioLogSd: number
): EngineMonthRange {
  const spread = Math.exp(Z_90 * Math.max(0, ratioLogSd));
  return {
    p10: paybackMonth(curve, valuePerCustomer * spread, costPerConversion),
    p50: paybackMonth(curve, valuePerCustomer, costPerConversion),
    p90: paybackMonth(curve, valuePerCustomer / spread, costPerConversion),
  };
}
