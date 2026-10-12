import {
  computePlanSnapshot,
  type ChannelWithMetrics,
  type PlanInputs,
} from '@/hooks/use-media-plan-store';
import { planReallocation } from '@/lib/insight-actions';

/** The winner must beat the loser's return on spend by at least this factor to be worth surfacing. */
const MIN_ROAS_GAP = 1.2;
/** Modelled revenue gains below this (in plan currency) are noise, not an insight. */
const MIN_REVENUE_GAIN = 1;

export interface ArbitrageResult {
  winner: ChannelWithMetrics;
  loser: ChannelWithMetrics;
  /** Spend moved from the loser to the winner, in plan currency. */
  shiftAmount: number;
  /** Modelled change in projected plan revenue after the move. Always positive. */
  revenueDelta: number;
  blendedRoasBefore: number;
  blendedRoasAfter: number;
  /** Winner's share of eligible spend today, 0-100. */
  winnerSharePct: number;
}

function isFixedFee(channel: ChannelWithMetrics): boolean {
  return (
    channel.tier === 'fixed' ||
    channel.buyingModel === 'FLAT_FEE' ||
    channel.buyingModel === 'RETAINER'
  );
}

/**
 * Finds the best and worst variable-spend channels by return on spend and models the plan
 * with 20% of the worst channel's allocation moved to the best one (the same move the
 * Reallocate button applies). Revenue and blended return come from the plan engine, so the
 * winner's saturation is respected. Returns null when there is no eligible pair or the
 * modelled move does not add revenue.
 */
export function computeArbitrage(input: PlanInputs): ArbitrageResult | null {
  const before = computePlanSnapshot(input);
  const eligible = before.channels.filter(
    (c) => c.isActive !== false && !isFixedFee(c) && c.metrics.spend > 0 && c.metrics.roas > 0
  );
  if (eligible.length < 2) return null;

  const sorted = [...eligible].sort((a, b) => b.metrics.roas - a.metrics.roas);
  const winner = sorted[0];
  const loser = sorted[sorted.length - 1];
  if (winner.id === loser.id) return null;
  if (winner.metrics.roas < loser.metrics.roas * MIN_ROAS_GAP) return null;

  // Lock state only blocks the action, it does not change what the move would do.
  const allocations = planReallocation(
    { ...winner, locked: false },
    { ...loser, locked: false }
  );
  if (!allocations) return null;

  const after = computePlanSnapshot({
    ...input,
    channels: input.channels.map((ch) =>
      allocations[ch.id] !== undefined ? { ...ch, allocationPct: allocations[ch.id] } : ch
    ),
  });

  const revenueDelta = after.blended.projectedRevenue - before.blended.projectedRevenue;
  if (!(revenueDelta >= MIN_REVENUE_GAIN)) return null;

  const eligibleSpend = eligible.reduce((sum, c) => sum + c.metrics.spend, 0);
  const afterLoser = after.channels.find((c) => c.id === loser.id);
  const shiftAmount = afterLoser
    ? Math.max(0, loser.metrics.spend - afterLoser.metrics.spend)
    : loser.metrics.spend * 0.2;

  return {
    winner,
    loser,
    shiftAmount,
    revenueDelta,
    blendedRoasBefore: before.blended.blendedRoas,
    blendedRoasAfter: after.blended.blendedRoas,
    winnerSharePct: eligibleSpend > 0 ? Math.round((winner.metrics.spend / eligibleSpend) * 100) : 0,
  };
}
