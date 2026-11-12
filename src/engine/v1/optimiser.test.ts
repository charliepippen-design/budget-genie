import { describe, expect, it, vi } from 'vitest';

// Several tests compare against an exhaustive search, which takes seconds on CI runners.
vi.setConfig({ testTimeout: 60_000 });
import type { ChannelCategory } from '@/lib/mediaplan-data';
import { DEFAULT_MULTIPLIERS_FALLBACK } from '@/lib/media-plan/plan-snapshot';
import type { ChannelData } from '@/lib/media-plan/types';
import type { BuyingModel, ChannelFamily } from '@/types/channel';
import type { EngineInput } from '../contract';
import type { OptimiseConstraints, OptimiseGoal } from '../optimise';
import { applyAllocation, optimiseAllocation, responseCurveEngine as engine } from './index';
import { buildPlanModel } from './model';
import { marginalConversionsAt } from './response-curve';
import { generatedInputs } from './testing';

const GOALS: OptimiseGoal[] = ['conversions', 'value', 'net'];
const CASES = generatedInputs().filter((c) => c.input.channels.length > 0);

const goalOf = (goal: OptimiseGoal, input: EngineInput): number => {
  const { totals } = engine.compute(input);
  if (goal === 'conversions') return totals.totalConversions;
  if (goal === 'value') return totals.projectedRevenue;
  return totals.projectedRevenue - totals.totalSpend;
};

// ---- Small hand-built plans, for the brute-force comparison ----

function channel(
  id: string,
  buyingModel: BuyingModel,
  family: ChannelFamily,
  price: number,
  conversionRate: number,
  value: number,
  saturationCeiling: number,
  allocationPct: number
): ChannelData {
  return {
    id,
    name: id,
    category: 'Paid Search' as ChannelCategory,
    allocationPct,
    family,
    buyingModel,
    typeConfig: { family, buyingModel, price, baselineMetrics: { ctr: 1, conversionRate, aov: value, saturationCeiling } },
    tier: 'scalable',
    locked: false,
    isActive: true,
  };
}

function planOf(budget: number, channels: ChannelData[]): EngineInput {
  return {
    budget,
    channels,
    assumptions: { ...DEFAULT_MULTIPLIERS_FALLBACK, playerValue: 100 },
    markets: { tiers: { tier1: 100, tier2: 0, tier3: 0 }, geos: [], overrides: {} },
    industry: 'other',
    observedValue: { m1: null, m3: null, m6: null },
  };
}

const SEARCH = channel('search', 'CPC', 'paid_media', 2, 4, 120, 8_000, 40);
const SOCIAL = channel('social', 'CPM', 'paid_media', 8, 2.5, 90, 20_000, 35);
const PARTNERS = channel('partners', 'CPA', 'affiliate', 70, 5, 150, 30_000, 25);
/** Unprofitable at any spend: lifetime value below the contract price. */
const WEAK = channel('weak', 'CPA', 'affiliate', 200, 5, 80, 30_000, 25);

const SMALL_PLANS: Array<{ name: string; input: EngineInput }> = [
  { name: '2 channels', input: planOf(20_000, [SEARCH, { ...SOCIAL, allocationPct: 60 }]) },
  { name: '3 channels', input: planOf(30_000, [SEARCH, SOCIAL, PARTNERS]) },
  { name: '3 channels, one unprofitable', input: planOf(30_000, [SEARCH, SOCIAL, WEAK]) },
  { name: '2 channels, budget far above saturation', input: planOf(400_000, [SEARCH, SOCIAL]) },
];

/**
 * Exhaustive search on a grid of spends (every split whose total is at most the budget), scored
 * by the engine itself. `filter` drops splits that break a constraint.
 */
function bruteForce(
  input: EngineInput,
  goal: OptimiseGoal,
  steps: number,
  filter: (spend: number[], cpa: number | null) => boolean = () => true
): number {
  const n = input.channels.length;
  const unit = input.budget / steps;
  let best = -Infinity;
  const visit = (index: number, left: number, picked: number[]) => {
    if (index === n) {
      const total = picked.reduce((sum, s) => sum + s, 0);
      const candidate: EngineInput = {
        ...input,
        budget: total * unit,
        channels: input.channels.map((c, i) => ({ ...c, allocationPct: total > 0 ? (picked[i] / total) * 100 : 0 })),
      };
      const { totals } = engine.compute(candidate);
      if (!filter(picked.map((s) => s * unit), totals.blendedCpa)) return;
      const score =
        goal === 'conversions'
          ? totals.totalConversions
          : goal === 'value'
            ? totals.projectedRevenue
            : totals.projectedRevenue - totals.totalSpend;
      if (score > best) best = score;
      return;
    }
    for (let s = 0; s <= left; s += 1) visit(index + 1, left - s, [...picked, s]);
  };
  visit(0, steps, []);
  return best;
}

const stepsFor = (input: EngineInput) => (input.channels.length === 2 ? 400 : 60);

describe('optimiser: optimal against brute force on small plans', () => {
  describe.each(SMALL_PLANS)('$name', ({ input }) => {
    it.each(GOALS)('goal %s: no split on the grid beats it, and it is close to the best one', (goal) => {
      const result = optimiseAllocation(input, { goal });
      const best = bruteForce(input, goal, stepsFor(input));
      const achieved = goalOf(goal, applyAllocation(input, result));
      const scale = Math.max(1, Math.abs(best));

      // The grid is a subset of the splits the optimiser may choose, so it must not lose to it...
      expect(achieved).toBeGreaterThanOrEqual(best - 1e-9 * scale);
      // ...and a fine grid gets close to the optimum, so the optimiser cannot be far above it either.
      expect((achieved - best) / scale).toBeLessThan(5e-3);
      expect(result.feasible).toBe(true);
      expect(result.after.spend).toBeLessThanOrEqual(input.budget + 1e-6);
    });
  });

  it('with share bounds and a cost ceiling it still matches the best feasible split', () => {
    const input = planOf(30_000, [SEARCH, SOCIAL, PARTNERS]);
    const constraints: OptimiseConstraints = {
      maxSharePct: { search: 30 },
      minSharePct: { social: 20 },
      maxCostPerConversion: 60,
    };
    const result = optimiseAllocation(input, { goal: 'conversions', constraints });
    const feasible = (spend: number[], cpa: number | null) =>
      spend[0] <= 0.3 * input.budget + 1e-6 && spend[1] >= 0.2 * input.budget - 1e-6 && cpa !== null && cpa <= 60;
    const best = bruteForce(input, 'conversions', 120, feasible);

    expect(result.feasible).toBe(true);
    expect(result.spend.search).toBeLessThanOrEqual(0.3 * input.budget + 1e-6);
    expect(result.spend.social).toBeGreaterThanOrEqual(0.2 * input.budget - 1e-6);
    expect(result.after.costPerConversion!).toBeLessThanOrEqual(60 * (1 + 1e-6));
    expect(result.after.conversions).toBeGreaterThanOrEqual(best - 1e-9);
    expect((result.after.conversions - best) / best).toBeLessThan(5e-3);
    // The ceiling binds: without it the plan would buy more conversions at a higher cost.
    const free = optimiseAllocation(input, { goal: 'conversions', constraints: { ...constraints, maxCostPerConversion: null } });
    expect(free.after.costPerConversion!).toBeGreaterThan(60);
    expect(free.after.conversions).toBeGreaterThan(result.after.conversions);
    expect(result.unspent).toBeGreaterThan(0);
  }, 60_000); // exhaustive search over the grid: slow on CI runners

  it('equalises marginal returns: the last unit buys the same in every channel it funds', () => {
    const input = planOf(30_000, [SEARCH, SOCIAL, PARTNERS]);
    const result = optimiseAllocation(input, { goal: 'conversions' });
    const model = buildPlanModel(applyAllocation(input, result));
    const marginals = model.channels.map((c) => marginalConversionsAt(c.curve, c.spend));
    marginals.forEach((m) => expect(m / marginals[0]).toBeCloseTo(1, 6));

    // For value the equalised quantity is value per extra unit of spend.
    const byValue = optimiseAllocation(input, { goal: 'value' });
    const valueModel = buildPlanModel(applyAllocation(input, byValue));
    const valueMarginals = valueModel.channels.map((c) => marginalConversionsAt(c.curve, c.spend) * c.valuePerConversion);
    valueMarginals.forEach((m) => expect(m / valueMarginals[0]).toBeCloseTo(1, 6));
  });

  it('net: stops spending where an extra unit returns less than it costs, and drops channels that never pay', () => {
    const input = planOf(400_000, [SEARCH, SOCIAL, WEAK]);
    const result = optimiseAllocation(input, { goal: 'net' });
    expect(result.spend.weak).toBe(0);
    expect(result.unspent).toBeGreaterThan(0);
    expect(result.recommendedBudget).toBeCloseTo(input.budget - result.unspent, 6);
    const model = buildPlanModel(applyAllocation(input, result));
    model.channels
      .filter((c) => c.spend > 0)
      .forEach((c) => expect(marginalConversionsAt(c.curve, c.spend) * c.valuePerConversion).toBeCloseTo(1, 6));
    expect(result.after.net).toBeGreaterThan(result.before.net);
  });
});

describe('optimiser: properties over generated plans', () => {
  it.each(CASES)('$name: never worse than the starting split, for every goal', ({ input }) => {
    GOALS.forEach((goal) => {
      const result = optimiseAllocation(input, { goal });
      expect(result.goal).toBe(goal);
      expect(result.gain).toBeGreaterThanOrEqual(0);
      const before = goalOf(goal, input);
      const after = goalOf(goal, applyAllocation(input, result));
      expect(after).toBeGreaterThanOrEqual(before - 1e-7 * Math.max(1, Math.abs(before)));
      // What the optimiser reports is what the engine computes once the split is applied.
      expect(after).toBeCloseTo(before + result.gain, 4);
      expect(result.feasible).toBe(true);
    });
  });

  it.each(CASES)('$name: applying the result reproduces its spends, and the budget is not exceeded', ({ input }) => {
    GOALS.forEach((goal) => {
      const result = optimiseAllocation(input, { goal });
      const applied = engine.compute(applyAllocation(input, result));
      applied.channels.forEach((c) => expect(c.metrics.spend).toBeCloseTo(result.spend[c.id], 4));
      expect(applied.totals.totalSpend).toBeCloseTo(result.after.spend, 4);
      expect(applied.totals.totalConversions).toBeCloseTo(result.after.conversions, 6);
      expect(result.after.spend).toBeLessThanOrEqual(result.before.spend + 1e-6);
      expect(result.unspent).toBeGreaterThanOrEqual(0);
      expect(result.recommendedBudget).toBeLessThanOrEqual(input.budget + 1e-9);
      expect(Object.keys(result.shares).sort()).toEqual(input.channels.map((c) => c.id).sort());
    });
  });

  it.each(CASES)('$name: locked, inactive and fixed-fee channels are left alone; share bounds hold', ({ input }) => {
    const variable = input.channels.filter(
      (c) => c.buyingModel !== 'FLAT_FEE' && c.buyingModel !== 'RETAINER' && c.tier !== 'fixed'
    );
    if (variable.length < 4) return;
    const [capped, floored, locked, off] = variable;
    const constrained: EngineInput = {
      ...input,
      channels: input.channels.map((c) =>
        c.id === locked.id ? { ...c, locked: true } : c.id === off.id ? { ...c, isActive: false } : c
      ),
    };
    const before = engine.compute(constrained);
    const spendBefore = (id: string) => before.channels.find((c) => c.id === id)!.metrics.spend;
    const constraints: OptimiseConstraints = { maxSharePct: { [capped.id]: 5 }, minSharePct: { [floored.id]: 15 } };

    GOALS.forEach((goal) => {
      const result = optimiseAllocation(constrained, { goal, constraints });
      expect(result.spend[locked.id]).toBeCloseTo(spendBefore(locked.id), 6);
      expect(result.spend[off.id]).toBe(0);
      expect(result.movedChannelIds).not.toContain(locked.id);
      expect(result.movedChannelIds).not.toContain(off.id);
      constrained.channels
        .filter((c) => c.isActive && (c.buyingModel === 'FLAT_FEE' || c.buyingModel === 'RETAINER' || c.tier === 'fixed'))
        .forEach((c) => {
          expect(result.spend[c.id]).toBe(c.typeConfig.price);
          expect(result.shares[c.id]).toBe(c.allocationPct);
          expect(result.movedChannelIds).not.toContain(c.id);
        });
      expect(result.spend[capped.id]).toBeLessThanOrEqual(0.05 * constrained.budget + 1e-6);
      if (result.feasible) {
        expect(result.spend[floored.id]).toBeGreaterThanOrEqual(0.15 * constrained.budget - 1e-6);
      }
      // The applied plan agrees.
      const applied = engine.compute(applyAllocation(constrained, result));
      expect(applied.channels.find((c) => c.id === locked.id)!.metrics.spend).toBeCloseTo(spendBefore(locked.id), 4);
      expect(applied.channels.find((c) => c.id === capped.id)!.metrics.spend).toBeLessThanOrEqual(0.05 * constrained.budget + 1e-4);
    });
  });

  it.each(CASES)('$name: a cost-per-conversion ceiling is met when it can be, and reported when it cannot', ({ input }) => {
    const start = optimiseAllocation(input, { goal: 'conversions' });
    if (start.after.costPerConversion === null) return;
    const ceiling = start.after.costPerConversion * 0.9;
    GOALS.forEach((goal) => {
      const result = optimiseAllocation(input, { goal, constraints: { maxCostPerConversion: ceiling } });
      if (result.feasible) {
        expect(result.after.costPerConversion!).toBeLessThanOrEqual(ceiling * (1 + 1e-6));
        const applied = engine.compute(applyAllocation(input, result));
        expect(applied.totals.blendedCpa!).toBeLessThanOrEqual(ceiling * (1 + 1e-6));
      }
      expect(result.after.spend).toBeLessThanOrEqual(result.before.spend + 1e-6);
    });
    // A ceiling nothing can meet is reported, not silently ignored.
    const impossible = optimiseAllocation(input, { goal: 'conversions', constraints: { maxCostPerConversion: 0.01 } });
    expect(impossible.feasible).toBe(false);
    expect(impossible.after.conversions).toBeGreaterThanOrEqual(impossible.before.conversions);
  });

  it.each(CASES)('$name: optimising an optimum changes nothing material', ({ input }) => {
    GOALS.forEach((goal) => {
      const first = optimiseAllocation(input, { goal });
      const optimum = applyAllocation(input, first);
      const second = optimiseAllocation(optimum, { goal });
      const scale = Math.max(1, input.budget);
      input.channels.forEach((c) => {
        expect(Math.abs(second.spend[c.id] - first.spend[c.id]) / scale).toBeLessThan(1e-6);
      });
      expect(Math.abs(second.gain)).toBeLessThan(1e-6 * Math.max(1, Math.abs(goalOf(goal, optimum))));
      expect(second.recommendedBudget).toBeCloseTo(first.recommendedBudget, 4);
    });
  });
});

describe('optimiser: through the engine port', () => {
  it('is exposed as the optional `optimise` method and never mutates its input', () => {
    const input = CASES[0].input;
    const frozen = JSON.stringify(input);
    const result = engine.optimise!(input, { goal: 'value' });
    expect(JSON.stringify(input)).toBe(frozen);
    expect(result).toEqual(optimiseAllocation(input, { goal: 'value' }));
  });
});
