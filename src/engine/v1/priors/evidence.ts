// PRIOR: how uncertain a channel's efficiency (conversions per unit of spend) is before any
// campaign data exists. Every number below is an assumption chosen by judgement, not measured.
// It is to be replaced by the spread of observed results once the product collects them.

import type { BuyingModel } from '@/types/channel';

/** How well proven a channel is. Read from the industry packs' tags (see ../evidence.ts). */
export type EvidenceLevel = 'proven' | 'unrated' | 'restricted' | 'experimental';

/**
 * Standard deviation of log(efficiency) by the way the channel is bought: 0.10 means "the true
 * figure is typically within about +/-10% of the plan's", 0.40 "within about -33% / +49%".
 * The more of the funnel the price covers, the less is left to chance.
 */
export const EFFICIENCY_LOG_SD_BY_BUYING_MODEL: Record<BuyingModel, number> = {
  // Paid per conversion: cost per conversion is the contract price. What is left is delivery risk.
  CPA: 0.05,
  // Part paid per conversion, part as a share of revenue that is itself uncertain.
  HYBRID: 0.1,
  // Cost per conversion is a share of a customer value nobody knows yet.
  REV_SHARE: 0.15,
  // Clicks are bought; only the click -> conversion rate is uncertain.
  CPC: 0.25,
  // Impressions are bought; both click-through and conversion rate are uncertain.
  CPM: 0.4,
  // A fee buys a placement or a team; traffic and conversion are both uncertain.
  FLAT_FEE: 0.45,
  RETAINER: 0.45,
};

/**
 * Multiplier on the spread above by evidence level. `proven` channels have a long track record
 * in the industry; `experimental` ones are high-variance tests; `restricted` ones depend on a
 * platform approval that can change delivery; `unrated` is a channel the packs do not tag
 * (including every channel the user created).
 */
export const EFFICIENCY_SPREAD_MULTIPLIER: Record<EvidenceLevel, number> = {
  proven: 0.75,
  unrated: 1,
  restricted: 1.15,
  experimental: 1.5,
};

/** When a channel carries several tags the widest applicable level wins, in this order. */
export const EVIDENCE_PRECEDENCE: EvidenceLevel[] = ['experimental', 'restricted', 'proven', 'unrated'];
