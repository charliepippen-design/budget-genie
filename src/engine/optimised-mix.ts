import { setChannelAllocations } from '@/lib/media-plan/actions';
import { isFixedCostChannel } from '@/lib/media-plan/plan-snapshot';
import type { OptimiseOptions, OptimiseResult } from './optimise';
import { getEngine } from './registry';
import { selectEngineInput, type EngineSource } from './input';

/** Smallest gain, in % of the goal's starting figure, worth proposing a new mix for. */
const MATERIAL_GAIN_PCT = 0.5;
/** A channel is listed in the preview when its share of spend moves by more than this many points. */
const SHARE_CHANGE_POINTS = 1;

export interface OptimisedMixChange {
  id: string;
  name: string;
  /** Share of total plan spend, 0-100, before and after. */
  beforePct: number;
  afterPct: number;
}

/** What the optimiser proposes for the live plan, ready to preview and to apply. */
export interface OptimisedMix {
  /** The engine's own result: before / after outcomes, gain, feasibility. */
  result: OptimiseResult;
  /** `allocationPct` to write for the channels the optimiser moved (for `setAllocations`). */
  shares: Record<string, number>;
  /** The monthly budget to write with the shares; the current budget unless the split needs less. */
  budget: number;
  /** False when the new mix gains too little to be worth applying. */
  material: boolean;
  /** Channels whose share of spend moves by more than a point, in plan order. */
  changes: OptimisedMixChange[];
}

/**
 * Asks the active engine for a better split of the live plan (see optimise.ts) and prepares it
 * for the screen. Null when the engine has no optimiser. Changes nothing.
 */
export function computeOptimisedMix(state: EngineSource, options: OptimiseOptions): OptimisedMix | null {
  const engine = getEngine();
  if (!engine.optimise) return null;
  const input = selectEngineInput(state);
  const result = engine.optimise(input, options);

  // The engine's shares add up to 100 over the active share-based channels. The store keeps
  // fixed-fee channels inside the 100, so the shares are scaled to the total those channels hold
  // today: same spend, and every channel the optimiser did not move keeps its share as it is.
  const cohortTotal = state.channels
    .filter((channel) => channel.isActive !== false && !isFixedCostChannel(channel))
    .reduce((total, channel) => total + (channel.allocationPct || 0), 0);
  const scale = cohortTotal > 0 ? cohortTotal / 100 : 1;
  const shares: Record<string, number> = {};
  result.movedChannelIds.forEach((id) => {
    shares[id] = result.shares[id] * scale;
  });

  // A budget is only lowered by whole units: rounding noise must not move it.
  const budget = result.unspent >= 1 ? Math.round(result.recommendedBudget) : state.totalBudget;
  const before = engine.compute(input);
  const after = engine.compute(
    selectEngineInput({
      ...state,
      totalBudget: budget,
      channels: setChannelAllocations(state.channels, shares),
    })
  );
  const changes = state.channels
    .map((channel) => ({
      id: channel.id,
      name: channel.name,
      beforePct: before.channelInsights[channel.id]?.spendSharePct ?? 0,
      afterPct: after.channelInsights[channel.id]?.spendSharePct ?? 0,
    }))
    .filter((change) => Math.abs(change.afterPct - change.beforePct) > SHARE_CHANGE_POINTS);

  // Meeting a cost ceiling the starting mix broke is a gain in itself, even when the goal's figure drops.
  const ceiling = options.constraints?.maxCostPerConversion ?? null;
  const above = (cost: number | null) => ceiling !== null && ceiling > 0 && cost !== null && cost > ceiling;
  const fixesCeiling = above(result.before.costPerConversion) && !above(result.after.costPerConversion) && result.feasible;

  return {
    result,
    shares,
    budget,
    material: result.gainPct >= MATERIAL_GAIN_PCT || fixesCeiling,
    changes,
  };
}
