import { describe, expect, it } from 'vitest';
import { placeholderEngine } from '../placeholder-engine';
import type { EngineRange } from '../contract';
import { responseCurveEngine } from './index';
import { inputFor } from './testing';

// Placeholder versus response-curve engine on three reference plans. Run with
//   npx vitest run src/engine/v1/comparison.test.ts
// to print the table (it goes into the PR description). The assertions only check that both
// engines produce a comparable, complete headline; they do not say which one is right.

const PLANS = [
  { name: 'iGaming 60k DE+CA', brief: { industry: 'igaming' as const, monthlyBudget: 60_000, markets: ['DE', 'CA'] } },
  { name: 'E-commerce 25k DE', brief: { industry: 'ecommerce' as const, monthlyBudget: 25_000, markets: ['DE'] } },
  { name: 'SaaS 40k US', brief: { industry: 'saas' as const, monthlyBudget: 40_000, markets: ['US'] } },
];

const n0 = (value: number | null | undefined) => (typeof value === 'number' ? Math.round(value).toLocaleString('en-US') : 'n/a');
const n2 = (value: number | null | undefined) => (typeof value === 'number' ? value.toFixed(2) : 'n/a');
const range = (r: EngineRange | null | undefined, fmt: (v: number) => string) =>
  r ? `${fmt(r.p10)} / ${fmt(r.p50)} / ${fmt(r.p90)}` : 'n/a';

describe('placeholder versus response-curve engine', () => {
  it('prints the headline comparison for the three reference plans', () => {
    const lines = [
      '| Plan | Engine | Spend | Conversions | Cost / conv. | Lifetime value | ROAS | Month-1 ROAS | Payback (month) |',
      '|---|---|---|---|---|---|---|---|---|',
    ];
    PLANS.forEach(({ name, brief }) => {
      const input = inputFor(brief);
      const old = placeholderEngine.compute(input);
      const v1 = responseCurveEngine.compute(input);
      const ranges = v1.ranges!;

      lines.push(
        `| ${name} | placeholder | ${n0(old.totals.totalSpend)} | ${n0(old.totals.totalConversions)} | ${n0(old.totals.blendedCpa)} | ${n0(old.totals.projectedRevenue)} | ${n2(old.totals.blendedRoas)} | ${n2(old.roas.month1)} | ${old.customerValue.paybackMonth ?? '>12'} |`,
        `| | response-curve P50 | ${n0(v1.totals.totalSpend)} | ${n0(v1.totals.totalConversions)} | ${n0(v1.totals.blendedCpa)} | ${n0(v1.totals.projectedRevenue)} | ${n2(v1.totals.blendedRoas)} | ${n2(v1.roas.month1)} | ${v1.customerValue.paybackMonth ?? '>12'} |`,
        `| | response-curve P10 / P50 / P90 | | ${range(ranges.totals.conversions, n0)} | ${range(ranges.totals.costPerConversion, n0)} | ${range(ranges.totals.revenue, n0)} | ${range(ranges.totals.roas, n2)} | | ${ranges.paybackMonth.p10 ?? '>36'} / ${ranges.paybackMonth.p50 ?? '>36'} / ${ranges.paybackMonth.p90 ?? '>36'} |`
      );

      expect(v1.totals.totalSpend).toBeCloseTo(old.totals.totalSpend, 6);
      expect(v1.totals.totalConversions).toBeGreaterThan(0);
      expect(ranges.totals.conversions.p50).toBeCloseTo(v1.totals.totalConversions, 9);
    });
    console.log(`\n${lines.join('\n')}\n`);
  });
});
