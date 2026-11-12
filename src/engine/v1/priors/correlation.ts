// PRIOR: how much channels' efficiency errors move together. If the plan's conversion rates are
// too optimistic for one channel they are probably too optimistic for the others too (same
// landing pages, same offer, same market), so channels are not independent; but they are not
// identical either. Both numbers are assumptions, to be replaced by correlations estimated from
// observed channel results.

/** Correlation of log-efficiency between two channels of the same family (e.g. two paid-media channels). */
export const SAME_FAMILY_CORRELATION = 0.6;

/** Correlation of log-efficiency between two channels of different families. */
export const CROSS_FAMILY_CORRELATION = 0.3;
