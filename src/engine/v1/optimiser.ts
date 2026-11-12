// Budget optimiser: the split across channels that maximises a goal on the response curves.
//
// Every channel's curve is concave and channels add up, so the best split is the one where the
// last unit of spend buys the same in every channel that is not pinned at a bound ("equal
// marginal returns", found by water-filling). For a budget price `lambda` each channel's best
// spend has a closed form; `lambda` is found by bisection so that the spends add up to the
// budget. A ceiling on the blended cost per conversion adds a second multiplier `mu`, found by
// an outer bisection. See README.md for the derivation.

import type { EngineInput } from '../contract';
import type { OptimiseOptions, OptimiseOutcome, OptimiseResult } from '../optimise';
import { buildPlanModel, type ChannelModel } from './model';
import { conversionsAt } from './response-curve';
import { finiteOr } from './stats';

interface Free {
  model: ChannelModel;
  /** Smallest and largest spend allowed. */
  lo: number;
  hi: number;
}

const BISECTION_STEPS = 80;

/**
 * Best spend of one channel when a unit of budget costs `lambda`:
 * maximises weight * conversions(s) - (lambda + unitCost) * s over [lo, hi].
 * From d/ds: weight * slope / (1 + s / K)^2 = lambda + unitCost.
 */
function bestSpend(free: Free, weight: number, price: number): number {
  const { slope, halfSaturation } = free.model.curve;
  const gain = weight * slope;
  if (!(gain > 0)) return free.lo;
  if (!(price > 0)) return free.hi;
  const unconstrained = halfSaturation * (Math.sqrt(gain / price) - 1);
  return Math.min(free.hi, Math.max(free.lo, unconstrained));
}

/**
 * Water-filling: spends that maximise sum(weight_i * conversions_i(s_i)) - unitCost * sum(s_i)
 * with sum(s_i) <= pool and lo_i <= s_i <= hi_i.
 */
function waterFill(frees: Free[], weights: number[], unitCost: number, pool: number): number[] {
  const at = (lambda: number) => frees.map((f, i) => bestSpend(f, weights[i], lambda + unitCost));
  const total = (spends: number[]) => spends.reduce((sum, s) => sum + s, 0);

  // With a free budget (lambda = 0) the split may already fit: then budget is left over.
  const unpriced = at(0);
  if (total(unpriced) <= pool) return unpriced;

  // Otherwise raise the budget price until the spends fit. Marginal return never exceeds
  // weight * slope, so above that price every channel sits at its lower bound.
  let low = 0;
  let high = Math.max(...frees.map((f, i) => weights[i] * f.model.curve.slope), 1e-12);
  for (let step = 0; step < BISECTION_STEPS; step += 1) {
    const mid = (low + high) / 2;
    if (total(at(mid)) > pool) low = mid;
    else high = mid;
  }
  // `high` is feasible (spends fit). Hand the rounding remainder to channels with room.
  const spends = at(high);
  let remainder = pool - total(spends);
  if (remainder > 0 && low > 0) {
    const upper = at(low);
    for (let i = 0; i < spends.length && remainder > 0; i += 1) {
      const room = Math.min(remainder, upper[i] - spends[i]);
      if (room > 0) {
        spends[i] += room;
        remainder -= room;
      }
    }
  }
  return spends;
}

function outcome(pinned: ChannelModel[], frees: Free[], spends: number[]): OptimiseOutcome {
  let spend = 0;
  let conversions = 0;
  let value = 0;
  pinned.forEach((c) => {
    spend += c.spend;
    conversions += c.conversions;
    value += c.revenue;
  });
  frees.forEach((f, i) => {
    const channelConversions = conversionsAt(f.model.curve, spends[i]);
    spend += spends[i];
    conversions += channelConversions;
    value += channelConversions * f.model.valuePerConversion;
  });
  return { spend, conversions, value, net: value - spend, costPerConversion: conversions > 0 ? spend / conversions : null };
}

const goalValue = (goal: OptimiseOptions['goal'], o: OptimiseOutcome) =>
  goal === 'conversions' ? o.conversions : goal === 'value' ? o.value : o.net;

export function optimiseAllocation(input: EngineInput, options: OptimiseOptions): OptimiseResult {
  const { goal } = options;
  const constraints = options.constraints ?? {};
  const model = buildPlanModel(input);
  const budget = Math.max(0, finiteOr(input.budget, 0));
  const maxCpa =
    typeof constraints.maxCostPerConversion === 'number' && constraints.maxCostPerConversion > 0
      ? constraints.maxCostPerConversion
      : null;

  // Channels the optimiser may move: active, share-based and not locked. Everything else is pinned.
  const isFree = (c: ChannelModel) => c.active && !c.fixed && !c.channel.locked;
  const pinned = model.channels.filter((c) => !isFree(c));
  const freeModels = model.channels.filter(isFree);
  const pool = freeModels.reduce((sum, c) => sum + c.spend, 0);

  const shareToSpend = (pct: number | undefined, fallback: number) =>
    typeof pct === 'number' && Number.isFinite(pct) ? Math.max(0, (pct / 100) * budget) : fallback;
  const frees: Free[] = freeModels.map((c) => {
    const hi = Math.min(pool, shareToSpend(constraints.maxSharePct?.[c.channel.id], pool));
    const lo = Math.min(hi, shareToSpend(constraints.minSharePct?.[c.channel.id], 0));
    return { model: c, lo, hi };
  });
  const startSpends = freeModels.map((c) => c.spend);
  const before = outcome(pinned, frees, startSpends);

  let feasible = true;
  // Minimum shares that do not fit the movable budget are scaled back to fit.
  const minTotal = frees.reduce((sum, f) => sum + f.lo, 0);
  if (minTotal > pool && minTotal > 0) {
    feasible = false;
    frees.forEach((f) => {
      f.lo *= pool / minTotal;
      f.hi = Math.max(f.hi, f.lo);
    });
  }

  const valueOf = (f: Free) => (goal === 'conversions' ? 1 : f.model.valuePerConversion);
  const unitCost = goal === 'net' ? 1 : 0;
  // With a cost ceiling T the constraint spend - T * conversions <= 0 joins the objective with
  // multiplier mu: each conversion is worth mu * T more and each unit of spend costs mu more.
  const solve = (mu: number) =>
    waterFill(
      frees,
      frees.map((f) => valueOf(f) + mu * (maxCpa ?? 0)),
      unitCost + mu,
      pool
    );
  // A ceiling is met by a split that still buys conversions: "spend nothing" does not count.
  const meetsCpa = (o: OptimiseOutcome) =>
    maxCpa === null || (o.costPerConversion !== null && o.costPerConversion <= maxCpa * (1 + 1e-9));

  let spends = frees.length > 0 ? solve(0) : [];
  let after = outcome(pinned, frees, spends);
  if (!meetsCpa(after)) {
    // Raise mu until the ceiling holds; the blended cost falls as mu grows. When no mu works
    // the ceiling is out of reach and the split found without it is returned, flagged.
    let low = 0;
    let high = 1;
    let found = false;
    for (let grow = 0; frees.length > 0 && grow < 40 && !found; grow += 1) {
      if (meetsCpa(outcome(pinned, frees, solve(high)))) found = true;
      else high *= 4;
    }
    if (found) {
      for (let step = 0; step < BISECTION_STEPS; step += 1) {
        const mid = (low + high) / 2;
        if (meetsCpa(outcome(pinned, frees, solve(mid)))) high = mid;
        else low = mid;
      }
      spends = solve(high);
      after = outcome(pinned, frees, spends);
    } else {
      feasible = false;
    }
  }

  // The starting split is kept when it already meets the constraints and nothing better was found.
  const startMeetsBounds = frees.every((f, i) => startSpends[i] >= f.lo - 1e-9 && startSpends[i] <= f.hi + 1e-9);
  if (startMeetsBounds && meetsCpa(before) && goalValue(goal, after) <= goalValue(goal, before)) {
    spends = startSpends;
    after = before;
  }

  // Shares that reproduce the spends under the plan's own rules: movable and locked channels
  // share the variable budget in proportion to their spend; the rest keep their share.
  const spendById = new Map<string, number>();
  model.channels.forEach((c) => spendById.set(c.channel.id, c.spend));
  frees.forEach((f, i) => spendById.set(f.model.channel.id, spends[i]));
  const variable = model.channels.filter((c) => c.active && !c.fixed);
  const variableSpend = variable.reduce((sum, c) => sum + (spendById.get(c.channel.id) ?? 0), 0);
  const shares: Record<string, number> = {};
  const spend: Record<string, number> = {};
  model.channels.forEach((c) => {
    const channelSpend = spendById.get(c.channel.id) ?? 0;
    spend[c.channel.id] = channelSpend;
    shares[c.channel.id] =
      c.active && !c.fixed && variableSpend > 0 ? (channelSpend / variableSpend) * 100 : finiteOr(c.channel.allocationPct, 0);
  });

  const spendMultiplier = model.assumptions.spendMultiplier;
  const unspent = Math.max(0, before.spend - after.spend);
  const startGoal = goalValue(goal, before);
  const gain = goalValue(goal, after) - startGoal;

  return {
    goal,
    shares,
    spend,
    // The budget that makes the plan's rules spend exactly the new split.
    recommendedBudget: unspent > 0 && spendMultiplier > 0 ? Math.max(0, budget - unspent / spendMultiplier) : budget,
    unspent,
    before,
    after,
    gain,
    gainPct: startGoal !== 0 ? (gain / Math.abs(startGoal)) * 100 : 0,
    feasible,
    movedChannelIds: frees.map((f) => f.model.channel.id),
  };
}

/** The plan with an optimiser result applied: new shares and the budget they need. */
export function applyAllocation(input: EngineInput, result: OptimiseResult): EngineInput {
  return {
    ...input,
    budget: result.recommendedBudget,
    channels: input.channels.map((c) => ({ ...c, allocationPct: result.shares[c.id] ?? c.allocationPct })),
  };
}
