import { describe, expect, it } from 'vitest';
import type { ObservedLtvInputs } from '@/lib/media-plan/types';
import type { EngineInput, EngineRange } from '../contract';
import { responseCurveEngine as engine } from './index';
import { buildPlanModel } from './model';
import { RETENTION_BY_INDUSTRY, SEASONALITY_BY_INDUSTRY, VALUE_HORIZON_MONTHS } from './priors';
import { INDUSTRIES, inputFor } from './testing';

const NONE: ObservedLtvInputs = { m1: null, m3: null, m6: null };
const withObserved = (input: EngineInput, observed: Partial<ObservedLtvInputs>): EngineInput => ({
  ...input,
  observedValue: { ...NONE, ...observed },
});
const width = (range: EngineRange) => range.p90 / range.p10;
const at = (input: EngineInput, month: number) => engine.compute(input).customerValue.curve[month - 1].cumulativeLtvPerUser;

describe.each(INDUSTRIES)('value curve calibration: %s', (industry) => {
  const base = inputFor({ industry, monthlyBudget: 50_000, markets: ['DE'] });
  const prior = engine.compute(base);
  const priorAt = (month: number) => prior.customerValue.curve[month - 1].cumulativeLtvPerUser;

  it('without observed value the curve is the prior: stated lifetime value spread by the retention assumption', () => {
    const model = buildPlanModel(base);
    expect(model.value.isCalibrated).toBe(false);
    expect(model.value.valueFactor).toBe(1);
    expect(model.value.cumulativeShare).toHaveLength(VALUE_HORIZON_MONTHS);
    expect(model.value.cumulativeShare[VALUE_HORIZON_MONTHS - 1]).toBeCloseTo(1, 9);
    // Shares are positive and shrink as customers churn.
    model.value.monthlyShare.slice(1).forEach((share, idx) => {
      expect(share).toBeGreaterThan(0);
      expect(share).toBeLessThanOrEqual(model.value.monthlyShare[idx]);
    });
  });

  it.each([
    ['above the prior', 1.6],
    ['below the prior', 0.55],
  ])('an observed point %s pulls the curve toward it and narrows the range', (_label, factor) => {
    const target = priorAt(3) * factor;
    const calibrated = withObserved(base, { m3: target });
    const result = engine.compute(calibrated);

    // Toward the point: closer than the prior was, without overshooting it.
    const after = at(calibrated, 3);
    expect(Math.abs(after - target)).toBeLessThan(Math.abs(priorAt(3) - target));
    expect(Math.sign(after - priorAt(3))).toBe(Math.sign(target - priorAt(3)));
    expect(Math.sign(target - after)).toBe(Math.sign(target - priorAt(3)));
    // A single point is trusted far more than the prior: most of the gap closes.
    expect(Math.abs(after - target) / Math.abs(priorAt(3) - target)).toBeLessThan(0.35);

    // Narrower: value per customer is less of a guess.
    expect(width(result.ranges!.totals.revenue)).toBeLessThan(width(prior.ranges!.totals.revenue));
    expect(width(result.ranges!.totals.roas)).toBeLessThan(width(prior.ranges!.totals.roas));
    // Conversions are not informed by value observations.
    expect(result.ranges!.totals.conversions).toEqual(prior.ranges!.totals.conversions);
    expect(result.totals.totalConversions).toBe(prior.totals.totalConversions);
    // Lifetime value moves with the calibration, in the same direction.
    expect(Math.sign(result.totals.projectedRevenue - prior.totals.projectedRevenue)).toBe(Math.sign(factor - 1));
  });

  it('a point that agrees with the prior leaves the curve where it is and still narrows the range', () => {
    const calibrated = withObserved(base, { m3: priorAt(3) });
    const result = engine.compute(calibrated);
    expect(at(calibrated, 3)).toBeCloseTo(priorAt(3), 6);
    expect(result.totals.projectedRevenue).toBeCloseTo(prior.totals.projectedRevenue, 4);
    expect(width(result.ranges!.totals.revenue)).toBeLessThan(width(prior.ranges!.totals.revenue));
  });

  it('more observed points narrow the range further', () => {
    const one = engine.compute(withObserved(base, { m3: priorAt(3) * 1.3 }));
    const three = engine.compute(
      withObserved(base, { m1: priorAt(1) * 1.3, m3: priorAt(3) * 1.3, m6: priorAt(6) * 1.3 })
    );
    expect(width(three.ranges!.totals.revenue)).toBeLessThan(width(one.ranges!.totals.revenue));
    expect(width(one.ranges!.totals.revenue)).toBeLessThan(width(prior.ranges!.totals.revenue));
    // All three points sit 30% above the prior, so the whole curve lifts by about that much.
    [1, 3, 6].forEach((month) => {
      const lifted = three.customerValue.curve[month - 1].cumulativeLtvPerUser / priorAt(month);
      expect(lifted).toBeGreaterThan(1.2);
      expect(lifted).toBeLessThan(1.35);
    });
  });

  it('two points also bend the shape: value that builds slower than the prior flattens the curve', () => {
    // Same month-1 value, but month 6 well below what the prior expects. A curve that could
    // only move up and down would keep its month-6 / month-1 ratio; this one follows the points.
    const ratio = (input: EngineInput) => at(input, 6) / at(input, 1);
    const gap = priorAt(6) - priorAt(1);
    const slower = withObserved(base, { m1: priorAt(1), m6: priorAt(1) + gap * 0.5 });
    expect(ratio(slower)).toBeLessThan(ratio(base));
    expect(buildPlanModel(slower).value.firstMonthRetention).not.toBe(buildPlanModel(base).value.firstMonthRetention);
    const slowTarget = slower.observedValue.m6!;
    expect(Math.abs(at(slower, 6) - slowTarget)).toBeLessThan(Math.abs(priorAt(6) - slowTarget));

    // Value that builds faster: the month-6 point is still approached. Whether the curve can
    // steepen depends on the industry prior (one retention parameter cannot make every shape,
    // see README "what it cannot know"); it must at least not flatten materially.
    const faster = withObserved(base, { m1: priorAt(1), m6: priorAt(1) + gap * 1.6 });
    const fastTarget = faster.observedValue.m6!;
    expect(Math.abs(at(faster, 6) - fastTarget)).toBeLessThan(Math.abs(priorAt(6) - fastTarget));
    expect(ratio(faster)).toBeGreaterThan(ratio(base) * 0.99);
    expect(ratio(faster)).toBeGreaterThan(ratio(slower));
  });

  it('payback follows the calibrated curve and its range does not widen', () => {
    const higher = engine.compute(withObserved(base, { m1: priorAt(1) * 2, m3: priorAt(3) * 2 }));
    const span = (r: { p10: number | null; p90: number | null }) => (r.p90 ?? VALUE_HORIZON_MONTHS + 1) - (r.p10 ?? VALUE_HORIZON_MONTHS + 1);
    const month = (value: number | null) => value ?? VALUE_HORIZON_MONTHS + 1;
    expect(month(higher.ranges!.paybackMonth.p50)).toBeLessThanOrEqual(month(prior.ranges!.paybackMonth.p50));
    expect(span(higher.ranges!.paybackMonth)).toBeLessThanOrEqual(span(prior.ranges!.paybackMonth));
  });

  it('invalid observed values are ignored', () => {
    const garbage = engine.compute({ ...base, observedValue: { m1: 0, m3: -10, m6: NaN } });
    expect(garbage.totals.projectedRevenue).toBe(prior.totals.projectedRevenue);
    expect(garbage.ranges).toEqual(prior.ranges);
  });

  it('the customer-value lab reports the calibration and reads the same curve', () => {
    const controls = {
      churnRatePct: 4.2,
      cpaShockPct: 0,
      roasLiftPct: 0,
      decayCurve: 'standard-linear' as const,
      sandbox: { enabled: false, selectedChannelIds: [], channelAdjustments: {}, groupAdjustments: { organic: 0, paid: 0, affiliate: 0, influencer: 0 } },
    };
    const calibrated = withObserved(base, { m3: priorAt(3) * 1.5 });
    const lab = engine.computeWhatIf(calibrated, controls);
    expect(lab.customerValue.isCalibrated).toBe(true);
    expect(engine.computeWhatIf(base, controls).customerValue.isCalibrated).toBe(false);
    // At the lab's defaults the lab curve is the plan's curve.
    const plan = engine.compute(calibrated);
    lab.customerValue.curve.forEach((point, idx) => {
      expect(point.cumulativeLtvPerUser).toBeCloseTo(plan.customerValue.curve[idx].cumulativeLtvPerUser, 6);
    });
    expect(lab.customerValue.paybackMonth).toBe(plan.customerValue.paybackMonth);

    // More churn shortens the customer's life: less value, later payback.
    const stressed = engine.computeWhatIf(calibrated, { ...controls, churnRatePct: 8.4 });
    expect(stressed.customerValue.curve[11].cumulativeLtvPerUser).toBeLessThan(lab.customerValue.curve[11].cumulativeLtvPerUser);
    expect(stressed.scenarios.active[1].projectedCohortValue).toBeLessThan(lab.scenarios.active[1].projectedCohortValue);
    // A cost shock makes each customer dearer, so the same value takes longer to pay it back.
    const shocked = engine.computeWhatIf(calibrated, { ...controls, cpaShockPct: 50 });
    expect(shocked.customerValue.curve[0].cpaLine).toBeCloseTo(lab.customerValue.curve[0].cpaLine * 1.5, 6);
    expect(shocked.customerValue.paybackMonth ?? 99).toBeGreaterThanOrEqual(lab.customerValue.paybackMonth ?? 99);
  });
});

describe('priors are well-formed', () => {
  it('every seasonality index has 12 positive months averaging 1', () => {
    Object.entries(SEASONALITY_BY_INDUSTRY).forEach(([industry, index]) => {
      expect(index, industry).toHaveLength(12);
      index.forEach((value) => expect(value).toBeGreaterThan(0));
      expect(index.reduce((total, value) => total + value, 0) / 12, industry).toBeCloseTo(1, 9);
    });
  });

  it('retention priors are probabilities with a shape that slows churn down, never speeds it up', () => {
    Object.values(RETENTION_BY_INDUSTRY).forEach((prior) => {
      expect(prior.firstMonthRetention).toBeGreaterThan(0);
      expect(prior.firstMonthRetention).toBeLessThan(1);
      expect(prior.shape).toBeGreaterThan(0);
      expect(prior.shape).toBeLessThanOrEqual(1);
      expect(prior.upfrontShare).toBeGreaterThanOrEqual(0);
      expect(prior.upfrontShare).toBeLessThan(1);
      expect(prior.valueLogSd).toBeGreaterThan(0);
    });
  });

  it('the iGaming curve follows the plan retention setting', () => {
    const base = inputFor({ industry: 'igaming', monthlyBudget: 50_000, markets: ['DE'] });
    const sticky = engine.compute({ ...base, assumptions: { ...base.assumptions, retentionRate: 0.8 } });
    const leaky = engine.compute({ ...base, assumptions: { ...base.assumptions, retentionRate: 0.3 } });
    // Stickier players earn their value later: less of it in month 1.
    expect(sticky.roas.month1!).toBeLessThan(leaky.roas.month1!);
    expect(sticky.roas.lifetime).toBeCloseTo(leaky.roas.lifetime, 9);
  });
});
