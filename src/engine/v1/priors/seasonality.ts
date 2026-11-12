// PRIOR: how demand moves through the calendar year, by industry. Each list has 12 values,
// January first, averaging 1.0: 1.10 means "the same spend buys about 10% more conversions than
// in an average month". These are judgement calls about a Northern-hemisphere, Europe-led
// business. They are assumptions, to be replaced by the seasonality of the user's own data.

import type { Vertical } from '@/lib/vertical-presets';

export type SeasonalityIndex = readonly number[];

/** No seasonality: used for industries without a prior and when the start month is unknown. */
export const FLAT_SEASONALITY: SeasonalityIndex = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];

export const SEASONALITY_BY_INDUSTRY: Record<Vertical, SeasonalityIndex> = {
  // Driven by the sports calendar: football leagues run August to May with the busiest fixtures
  // and cup rounds from September to March; June and July are the off-season. Summers with a
  // World Cup or Euros are stronger than this, which the prior cannot know.
  igaming: [1.05, 1.0, 1.05, 1.0, 1.0, 0.9, 0.85, 0.95, 1.05, 1.05, 1.05, 1.05],
  // Driven by Q4: Black Friday / Cyber Monday in November and Christmas in December, paid for
  // by a quiet January and February.
  ecommerce: [0.85, 0.85, 0.9, 0.9, 0.95, 0.95, 0.95, 0.95, 0.95, 1.05, 1.4, 1.3],
  // B2B buying follows the working year: new budgets in Q1, a push before year end in autumn,
  // slow in the July/August holidays and the second half of December.
  saas: [1.05, 1.05, 1.1, 1.0, 1.0, 0.95, 0.85, 0.85, 1.05, 1.1, 1.05, 0.95],
  // No defensible prior: left flat.
  lead_gen: FLAT_SEASONALITY,
  other: FLAT_SEASONALITY,
};
