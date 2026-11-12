// Test support: engine inputs built from generated plans, without touching any store.

import { industryToVertical, INDUSTRY_PACKS, type IndustryId } from '@/lib/industries';
import { DEFAULT_MULTIPLIERS_FALLBACK } from '@/lib/media-plan/plan-snapshot';
import { generatePlan, type PlanBrief } from '@/lib/plan-generator';
import type { EngineInput } from '../contract';

/** The engine input a generated plan produces once applied (as `applyGeneratedPlan` + `selectEngineInput` do). */
export function inputFor(brief: Partial<PlanBrief>): EngineInput {
  const plan = generatePlan(brief);
  return {
    budget: plan.totalBudget,
    channels: JSON.parse(JSON.stringify(plan.channels)),
    assumptions: { ...DEFAULT_MULTIPLIERS_FALLBACK, ...plan.multipliers },
    markets: { tiers: { ...plan.geo.activeTiers }, geos: [...plan.geo.activeGeos], overrides: {} },
    industry: industryToVertical(plan.brief.industry),
    observedValue: { m1: null, m3: null, m6: null },
  };
}

export const INDUSTRIES: IndustryId[] = INDUSTRY_PACKS.map((pack) => pack.id);
export const BUDGETS = [5_000, 25_000, 60_000, 150_000, 400_000];
export const MARKET_SETS: string[][] = [['DE'], ['DE', 'CA'], ['US'], ['BR', 'MX'], ['IN'], []];

/** Every generated plan the property tests run over: industry x budget x markets. */
export function generatedInputs(): Array<{ name: string; input: EngineInput }> {
  const cases: Array<{ name: string; input: EngineInput }> = [];
  INDUSTRIES.forEach((industry) =>
    BUDGETS.forEach((monthlyBudget) =>
      MARKET_SETS.forEach((markets) => {
        cases.push({
          name: `${industry} ${monthlyBudget} ${markets.join('+') || 'no market'}`,
          input: inputFor({ industry, monthlyBudget, markets }),
        });
      })
    )
  );
  return cases;
}

/** Every number reachable in a value, with its path (for "all figures finite" checks). */
export function numbersIn(value: unknown, path = ''): Array<{ path: string; value: number }> {
  if (typeof value === 'number') return [{ path, value }];
  if (Array.isArray(value)) return value.flatMap((item, idx) => numbersIn(item, `${path}[${idx}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => numbersIn(item, path ? `${path}.${key}` : key));
  }
  return [];
}
