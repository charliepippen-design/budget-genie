/** Minimal channel shape the insight actions need. */
interface AllocChannel {
  id: string;
  allocationPct: number;
  locked: boolean;
}

/** Share of the weaker channel's budget the Arbitrage card proposes to move. */
export const REALLOCATE_SHARE = 0.2;
/** How much the Efficiency card's Auto-Fix trims the flagged channel. */
export const AUTO_FIX_REDUCTION = 0.1;

/**
 * Arbitrage "Reallocate Budget": move REALLOCATE_SHARE of the loser's allocation to the
 * winner. Only these two channels change, so the plan still sums to 100%.
 * Returns null when either channel is locked or there is nothing to move.
 */
export function planReallocation(
  winner: AllocChannel,
  loser: AllocChannel
): Record<string, number> | null {
  if (winner.locked || loser.locked || winner.id === loser.id) return null;
  const moved = loser.allocationPct * REALLOCATE_SHARE;
  if (moved <= 0) return null;
  return {
    [loser.id]: loser.allocationPct - moved,
    [winner.id]: winner.allocationPct + moved,
  };
}

/** Efficiency "Auto-Fix (Reduce Spend)": the flagged channel's new allocation, or null if it can't be cut. */
export function planAutoFixAllocation(channel: AllocChannel): number | null {
  if (channel.locked || channel.allocationPct <= 0) return null;
  return channel.allocationPct * (1 - AUTO_FIX_REDUCTION);
}
