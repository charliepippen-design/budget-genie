import { describe, expect, it } from 'vitest';
import { buildLtvCurve, buildPlanScenarios, DEFAULT_CHURN_RATE } from '@/lib/ltv-model';

const plan = { totalSpend: 50000, totalConversions: 220, blendedCpa: 227, blendedRoas: 1.04 };
const model = { playerValue: 250, blendedRoas: 1.04, churnRate: DEFAULT_CHURN_RATE, observedLtv: { m1: null, m3: null, m6: null } };

describe('ltv-model', () => {
  it('payback is the first month where cumulative value covers CPA', () => {
    const { points, paybackMonth } = buildLtvCurve(plan, model);
    expect(points).toHaveLength(12);
    const expected = points.find((p) => p.ltvToCac >= 1)?.month ?? null;
    expect(paybackMonth).toBe(expected);
    for (let i = 1; i < 12; i++) expect(points[i].cumulativeLtvPerUser).toBeGreaterThanOrEqual(points[i - 1].cumulativeLtvPerUser);
  });

  it('observed LTV calibrates both the curve and the scenarios', () => {
    const observed = { ...model, observedLtv: { m1: null, m3: 400, m6: null } };
    expect(buildLtvCurve(plan, observed).points[2].cumulativeLtvPerUser).toBeCloseTo(400);
    const base = buildPlanScenarios(plan, model)[1].projectedLtvPerUser;
    expect(buildPlanScenarios(plan, observed)[1].projectedLtvPerUser).not.toBeCloseTo(base);
  });

  it('scenarios are ordered bear < base < bull', () => {
    const [bear, base, bull] = buildPlanScenarios(plan, model);
    expect(bear.projectedCohortValue).toBeLessThan(base.projectedCohortValue);
    expect(base.projectedCohortValue).toBeLessThan(bull.projectedCohortValue);
  });
});
