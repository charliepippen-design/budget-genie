import { describe, expect, it } from 'vitest';
import { getIndustryPack } from '@/lib/industries';
import { DEFAULT_BRIEF } from '@/lib/plan-generator';
import { responseCurveEngine as engine } from './index';
import { INDUSTRIES, inputFor } from './testing';

// PLAUSIBILITY CHECKS, NOT TRUTH. Nothing here validates the model against real campaigns:
// there is no data to validate against. The bands only catch a model (or a pack edit) that
// drifts far away from the packs' own benchmark figures, which are themselves estimates.

/** The budget the planner starts from, in a Tier-1 market. */
const BENCHMARK_BUDGET = DEFAULT_BRIEF.monthlyBudget;
/** Blended cost per conversion must be within this multiple of the pack's benchmark CPA, either way. */
const CPA_BAND = 2;
/** No channel may return more than this multiple of its spend over the customer's lifetime. */
const ROAS_CEILING = 25;

const benchmarkPlan = (industry: (typeof INDUSTRIES)[number]) =>
  engine.compute(inputFor({ industry, monthlyBudget: BENCHMARK_BUDGET, markets: ['DE'] }));

describe('response-curve engine: sanity bands at the benchmark budget', () => {
  it('the benchmark budget is the planner default', () => {
    expect(BENCHMARK_BUDGET).toBe(50_000);
  });

  it.each(INDUSTRIES)('%s: blended cost per conversion is within 2x of the pack benchmark, either way', (industry) => {
    const pack = getIndustryPack(industry);
    const { totals, ranges } = benchmarkPlan(industry);
    expect(totals.blendedCpa).not.toBeNull();
    expect(totals.blendedCpa!).toBeGreaterThan(pack.benchmarks.cpa / CPA_BAND);
    expect(totals.blendedCpa!).toBeLessThan(pack.benchmarks.cpa * CPA_BAND);
    // The benchmark sits inside a generous reading of the engine's own range.
    expect(ranges!.totals.costPerConversion!.p10 / CPA_BAND).toBeLessThan(pack.benchmarks.cpa);
    expect(ranges!.totals.costPerConversion!.p90 * CPA_BAND).toBeGreaterThan(pack.benchmarks.cpa);
  });

  it.each(INDUSTRIES)('%s: no channel returns more than 25x its spend, and the plan less than 10x', (industry) => {
    const { channels, totals } = benchmarkPlan(industry);
    channels.forEach((c) => expect(c.metrics.roas, c.id).toBeLessThan(ROAS_CEILING));
    expect(totals.blendedRoas).toBeLessThan(10);
    expect(totals.blendedRoas).toBeGreaterThan(0.2);
  });

  it.each(INDUSTRIES)('%s: the plan range is neither a point nor absurdly wide', (industry) => {
    const { ranges } = benchmarkPlan(industry);
    const conversions = ranges!.totals.conversions;
    const revenue = ranges!.totals.revenue;
    expect(conversions.p90 / conversions.p10).toBeGreaterThan(1.2);
    expect(conversions.p90 / conversions.p10).toBeLessThan(3);
    // Value adds its own uncertainty on top of conversions.
    expect(revenue.p90 / revenue.p10).toBeGreaterThan(conversions.p90 / conversions.p10);
    expect(revenue.p90 / revenue.p10).toBeLessThan(6);
  });

  it.each(INDUSTRIES)('%s: the first month earns part of lifetime value, never more than all of it', (industry) => {
    const { roas, customerValue, totals } = benchmarkPlan(industry);
    expect(roas.month1!).toBeGreaterThan(0);
    expect(roas.month1!).toBeLessThan(roas.lifetime);
    const lifetimePerCustomer = totals.projectedRevenue / totals.totalConversions;
    expect(customerValue.valuePerCustomer12m).toBeLessThanOrEqual(lifetimePerCustomer);
    expect(customerValue.valuePerCustomer12m).toBeGreaterThan(lifetimePerCustomer * 0.3);
  });
});
