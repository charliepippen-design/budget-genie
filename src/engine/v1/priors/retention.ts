// PRIOR: how a customer's value arrives over time, by industry. The plan states a lifetime
// value per conversion; these numbers only decide WHEN it is earned. Every number is an
// assumption, to be replaced by the user's own cohort data (the value they observe at months
// 1, 3 and 6 already pulls the curve, see ../value-curve.ts).

import type { Vertical } from '@/lib/vertical-presets';

export interface RetentionPrior {
  /** Share of customers still active one month after converting (0-1). */
  firstMonthRetention: number;
  /**
   * How quickly churn slows down among survivors: the share still active after t months is
   * firstMonthRetention ^ (t ^ shape). 1 = the same churn every month; below 1 = the customers
   * who stay become steadily less likely to leave.
   */
  shape: number;
  /** Share of lifetime value earned at the moment of conversion (first order, first deposit). */
  upfrontShare: number;
  /** Standard deviation of log(lifetime value per customer): how wrong the stated value may be. */
  valueLogSd: number;
}

export const RETENTION_BY_INDUSTRY: Record<Vertical, RetentionPrior> = {
  // Most depositors play for a few weeks; a small loyal group carries the tail. For iGaming the
  // first-month retention is taken from the plan's own "retention rate" setting when it is set;
  // the figure here is the fallback. Player value is heavy-tailed, hence the wide spread.
  igaming: { firstMonthRetention: 0.55, shape: 0.6, upfrontShare: 0.1, valueLogSd: 0.45 },
  // The first order is most of the value; a minority reorders.
  ecommerce: { firstMonthRetention: 0.25, shape: 0.5, upfrontShare: 0.55, valueLogSd: 0.3 },
  // Subscriptions: no upfront value, a few percent of logos lost each month.
  saas: { firstMonthRetention: 0.96, shape: 0.9, upfrontShare: 0, valueLogSd: 0.35 },
  // A lead is worth most when it closes; some repeat business.
  lead_gen: { firstMonthRetention: 0.5, shape: 0.7, upfrontShare: 0.5, valueLogSd: 0.4 },
  // Unknown business: a middle-of-the-road curve with a wide spread.
  other: { firstMonthRetention: 0.7, shape: 0.7, upfrontShare: 0.2, valueLogSd: 0.4 },
};

/** Months over which "lifetime value" is earned. Value after this horizon is ignored. */
export const VALUE_HORIZON_MONTHS = 36;

/** Bounds applied to a first-month retention, whether read from the plan's settings or calibrated. */
export const RETENTION_BOUNDS = { min: 0.02, max: 0.99 } as const;

/**
 * Standard deviation of the prior on logit(first-month retention): how far the retention shape
 * may move when observed value points disagree with it.
 */
export const RETENTION_LOGIT_SD = 0.75;

/**
 * Standard deviation of log(observed value) around the true curve for one observed point: how
 * much a figure the user typed in is trusted. 0.15 = "within about 15%".
 */
export const OBSERVATION_LOG_SD = 0.15;

/**
 * The customer-value lab's churn slider is read relative to this default (4.2% a month): at the
 * default the curve is the industry prior, at twice the default customers churn twice as fast.
 */
export const LAB_REFERENCE_CHURN = 0.042;

/** The lab's "decay curve" choices as adjustments of the prior: churn speed and shape multipliers. */
export const LAB_DECAY_CURVES = {
  'standard-linear': { churnSpeed: 1, shape: 1 },
  // More customers lost early, the survivors stickier.
  'front-loaded-dropoff': { churnSpeed: 1.35, shape: 0.8 },
  // Fewer lost early.
  'stable-long-term-retention': { churnSpeed: 0.75, shape: 1 },
} as const;

/**
 * Share of realised value spent on running the business in the timeline's P&L. Carried over
 * from the multi-month view, which assumed the same 15% before this engine.
 */
export const OPERATING_COST_SHARE = 0.15;
