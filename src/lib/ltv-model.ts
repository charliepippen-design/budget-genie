import { buildScenarioEnvelope, type ScenarioEnvelopePoint, type StressAssumptions } from '@/lib/planning-insights';

// Single customer-value model shared by the dashboard LTV lab, /report and /output,
// so payback, LTV:CAC and cohort value are the same number on every screen.

export type DecayCurveArchitecture =
  | 'standard-linear'
  | 'front-loaded-dropoff'
  | 'stable-long-term-retention';

export type ObservedLtvPoints = {
  m1: number | null;
  m3: number | null;
  m6: number | null;
};

export interface LtvCurvePoint {
  month: number;
  label: string;
  cumulativeLtvPerUser: number;
  monthlyLtvPerUser: number;
  cohortValue: number;
  netCohortValue: number;
  ltvToCac: number;
  cpaLine: number;
}

export interface PlanAggregate {
  totalSpend: number;
  totalConversions: number;
  blendedCpa: number | null;
  blendedRoas: number;
}

export const DEFAULT_CHURN_RATE = 0.042;
export const DEFAULT_LTV_ASSUMPTIONS: StressAssumptions = {
  churnRate: DEFAULT_CHURN_RATE,
  cpaMultiplier: 1,
  roasMultiplier: 1,
};

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function toAnchors(observed: ObservedLtvPoints): Array<{ month: number; value: number }> {
  const candidates = [
    { month: 1, value: observed.m1 },
    { month: 3, value: observed.m3 },
    { month: 6, value: observed.m6 },
  ];

  return candidates
    .filter((entry): entry is { month: number; value: number } => {
      return entry.value !== null && Number.isFinite(entry.value) && entry.value > 0;
    })
    .sort((a, b) => a.month - b.month);
}

export function applyObservedCalibration(
  baselineCumulative: number[],
  observed: ObservedLtvPoints
): { cumulative: number[]; multiplier: number; isCalibrated: boolean } {
  const anchors = toAnchors(observed);
  if (anchors.length === 0 || baselineCumulative.length === 0) {
    return {
      cumulative: baselineCumulative,
      multiplier: 1,
      isCalibrated: false,
    };
  }

  const lastAnchor = anchors[anchors.length - 1];
  const baselineAtLastAnchor = baselineCumulative[lastAnchor.month - 1] || 1;
  const scaleAtLastAnchor = lastAnchor.value / Math.max(1, baselineAtLastAnchor);
  const projectedMonth12 = Math.max(
    lastAnchor.value,
    baselineCumulative[11] * clamp(scaleAtLastAnchor, 0.25, 4)
  );

  const segmentAnchors = [{ month: 0, value: 0 }, ...anchors];
  if (segmentAnchors[segmentAnchors.length - 1].month < 12) {
    segmentAnchors.push({ month: 12, value: projectedMonth12 });
  }

  const calibrated = [...baselineCumulative];
  for (let month = 1; month <= 12; month += 1) {
    const right = segmentAnchors.find((anchor) => anchor.month >= month);
    const left = [...segmentAnchors].reverse().find((anchor) => anchor.month <= month);

    if (!left || !right) {
      calibrated[month - 1] = baselineCumulative[month - 1];
      continue;
    }

    if (left.month === right.month) {
      calibrated[month - 1] = left.value;
      continue;
    }

    const progress = (month - left.month) / (right.month - left.month);
    const interpolated = left.value + (right.value - left.value) * progress;
    calibrated[month - 1] = Math.max(0, interpolated);
  }

  for (let idx = 1; idx < calibrated.length; idx += 1) {
    if (calibrated[idx] < calibrated[idx - 1]) {
      calibrated[idx] = calibrated[idx - 1];
    }
  }

  const baselineTerminal = Math.max(0.01, baselineCumulative[11]);
  const multiplier = calibrated[11] / baselineTerminal;

  return {
    cumulative: calibrated,
    multiplier: clamp(multiplier, 0.25, 4),
    isCalibrated: true,
  };
}

export interface LtvCurveInput {
  playerValue: number;
  blendedRoas: number;
  churnRate: number;
  roasLiftPct?: number;
  decayCurve?: DecayCurveArchitecture;
}

function monthlyExpansionRate({ blendedRoas, roasLiftPct = 0, decayCurve = 'standard-linear' }: LtvCurveInput) {
  const roasLift = 1 + roasLiftPct / 100;
  const baseExpansion = clamp(0.008 + Math.max(0, blendedRoas * roasLift - 1) * 0.004, 0.008, 0.05);
  if (decayCurve === 'front-loaded-dropoff') return clamp(baseExpansion * 0.85, 0.006, 0.05);
  if (decayCurve === 'stable-long-term-retention') return clamp(baseExpansion * 1.1, 0.008, 0.055);
  return baseExpansion;
}

/** Uncalibrated 12-month cumulative value per acquired customer, plus the month-by-month values. */
export function baselineLtvCurve(input: LtvCurveInput): { cumulative: number[]; monthly: number[]; expansion: number } {
  const { playerValue, churnRate, roasLiftPct = 0, decayCurve = 'standard-linear' } = input;
  const expansionRate = monthlyExpansionRate(input);
  const initialMonetization = playerValue * 0.15 * (1 + roasLiftPct / 100);
  let rollingRetention = 1;
  let cumulative = 0;
  const cumulativeCurve: number[] = [];
  const monthly: number[] = [];

  for (let idx = 0; idx < 12; idx += 1) {
    const month = idx + 1;
    const dynamicChurnRate =
      decayCurve === 'front-loaded-dropoff'
        ? month <= 3
          ? churnRate * 1.7
          : churnRate * 0.72
        : decayCurve === 'stable-long-term-retention'
          ? month <= 3
            ? churnRate * 0.72
            : churnRate * 0.85
          : churnRate;
    rollingRetention *= 1 - clamp(dynamicChurnRate, 0.003, 0.35);
    const value = initialMonetization * rollingRetention * (1 + expansionRate * idx);
    cumulative += value;
    monthly.push(value);
    cumulativeCurve.push(cumulative);
  }

  return { cumulative: cumulativeCurve, monthly, expansion: expansionRate };
}

/** 12-month LTV curve for a plan, calibrated to observed LTV when the user entered any. */
export function buildLtvCurve(
  plan: PlanAggregate,
  input: LtvCurveInput & { cpaShockPct?: number; observedLtv: ObservedLtvPoints }
): { points: LtvCurvePoint[]; paybackMonth: number | null; monthlyExpansion: number } {
  const safeCpa = (plan.blendedCpa ?? 0) * (1 + (input.cpaShockPct ?? 0) / 100);
  const safeConversions = Math.max(0, plan.totalConversions);
  const baseline = baselineLtvCurve(input);
  const calibrated = applyObservedCalibration(baseline.cumulative, input.observedLtv);

  const points = Array.from({ length: 12 }, (_, idx) => {
    const month = idx + 1;
    const cumulative = calibrated.cumulative[idx] ?? baseline.cumulative[idx] ?? 0;
    const previous = idx === 0 ? 0 : (calibrated.cumulative[idx - 1] ?? baseline.cumulative[idx - 1] ?? 0);
    const cohortValue = cumulative * safeConversions;
    return {
      month,
      label: `M${month}`,
      cumulativeLtvPerUser: cumulative,
      monthlyLtvPerUser: Math.max(0, cumulative - previous || baseline.monthly[idx] || 0),
      cohortValue,
      netCohortValue: cohortValue - plan.totalSpend,
      ltvToCac: safeCpa > 0 ? cumulative / safeCpa : 0,
      cpaLine: safeCpa,
    };
  });

  return {
    points,
    paybackMonth: points.find((point) => point.ltvToCac >= 1)?.month ?? null,
    monthlyExpansion: baseline.expansion,
  };
}

/** Bear/Base/Bull cohort scenarios, calibrated the same way as the dashboard LTV lab. */
export function buildPlanScenarios(
  plan: PlanAggregate,
  input: LtvCurveInput & { observedLtv: ObservedLtvPoints; assumptions?: StressAssumptions }
): ScenarioEnvelopePoint[] {
  const calibration = applyObservedCalibration(baselineLtvCurve(input).cumulative, input.observedLtv);
  return buildScenarioEnvelope({
    baseLtvPerUser: (plan.blendedCpa ?? 0) * Math.max(0, plan.blendedRoas) * calibration.multiplier,
    conversions: plan.totalConversions,
    cpa: plan.blendedCpa ?? 0,
    assumptions: input.assumptions ?? { ...DEFAULT_LTV_ASSUMPTIONS, churnRate: input.churnRate },
  });
}
