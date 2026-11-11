// The timeline port: the plan spread over several months.
//
// Screens of the multi-month view (P&L table, charts, scenario comparison, optimiser) read
// their numbers from a `TimelineResult` and never compute them themselves. The engine gets the
// single-month plan (`EngineInput`) plus everything the user set on the timeline (`TimelineInput`).

import type { IgamingRevenueMonthValues } from '@/lib/igaming-revenue-model';
import type {
  ChannelMonthConfig,
  GlobalPlanSettings,
  OptimizationGoal,
  ProgressionPattern,
} from '@/lib/multi-month/types';

// ========== INPUT ==========

/** How the period budget is shaped across months (flat, growing, seasonal, ...). */
export type TimelinePattern = ProgressionPattern;

/** What the optimiser ranks budget patterns by. */
export type TimelineGoal = OptimizationGoal;

/** One channel inside one month: its share of the month's budget and its unit economics. */
export type TimelineChannel = ChannelMonthConfig;

/** Plan-wide timeline settings: base monthly budget, growth, spend multiplier, CTR bump, targets. */
export type TimelineSettings = GlobalPlanSettings;

export interface TimelineMonthInput {
  id: string;
  /** Display name, e.g. "March 2027". */
  label: string;
  isSoftLaunch: boolean;
  /** Budget allocated to the month, before multipliers. */
  budget: number;
  budgetMultiplier: number;
  /** Per-month overrides; null means "use the plan-wide setting". */
  spendMultiplier: number | null;
  cpmOverride: number | null;
  ctrBump: number | null;
  channels: TimelineChannel[];
}

/** A saved alternative timeline. */
export interface TimelineScenarioInput {
  id: string;
  name: string;
  months: TimelineMonthInput[];
  settings: TimelineSettings;
}

/**
 * Everything the user can set on the timeline. With `EngineInput` it fully determines the
 * result: same inputs, same result.
 */
export interface TimelineInput {
  includeSoftLaunch: boolean;
  /** Months planned, not counting the soft-launch month. */
  planningMonths: number;
  /** First month as "YYYY-MM". */
  startMonth: string;
  pattern: TimelinePattern;
  /** Pattern parameters (today only `growthRate`, which `settings.growthRate` overrides). */
  patternParams: Record<string, number>;
  settings: TimelineSettings;
  /** The months of the active timeline, in order, with the user's per-month edits. */
  months: TimelineMonthInput[];
  scenarios: TimelineScenarioInput[];
  /** The saved scenario compared against the active timeline; null when none is picked. */
  comparisonScenarioId: string | null;
  optimisationGoal: TimelineGoal;
  /**
   * The period budget and month count `patternBudgets` is computed for. Omitted: the current
   * months and the sum of their budgets ("re-apply the pattern").
   */
  redistribute?: { totalBudget: number; monthCount: number };
}

// ========== OUTPUT ==========

/** One month of the conversion-value model: registrations, active customers, gross/net revenue, contribution. */
export type TimelineRevenueModelMonth = Omit<IgamingRevenueMonthValues, 'ngrPerPlayer'>;

export interface TimelineMonthResult {
  /** Same id and label as the input month at this position. */
  id: string;
  label: string;
  isSoftLaunch: boolean;
  /** Budget allocated to the month (the input value). */
  budget: number;
  spend: number;
  conversions: number;
  /** Revenue attributed by the channels. */
  revenue: number;
  operatingCosts: number;
  netProfit: number;
  /** Net profit summed from the first month up to this one. */
  cumulativeProfit: number;
  /** The month's spend per channel, in the month's channel order. */
  channelSpend: Array<{ channelId: string; name: string; spend: number }>;
  /**
   * The conversion-value model for this month (activity, gross and net revenue, contribution);
   * null when the industry has no such model (today: all but iGaming).
   */
  revenueModel: TimelineRevenueModelMonth | null;
  /** Contribution of the conversion-value model set against the month's spend (0 without a model). */
  contributionDelta: number;
}

export interface TimelineTotals {
  allocatedBudget: number;
  spend: number;
  conversions: number;
  revenue: number;
  /** Net revenue of the conversion-value model over the period (0 without a model). */
  netRevenue: number;
  /** Contribution of the conversion-value model over the period (0 without a model). */
  grossContribution: number;
  operatingCosts: number;
  netProfit: number;
  avgMonthlyBudget: number;
  /** Spend / conversions over the period; null without conversions. */
  cpa: number | null;
  /** Revenue / spend over the period. */
  roas: number;
  /** Index (0-based) of the first month whose cumulative profit is not negative; null if never. */
  breakEvenMonth: number | null;
  endingCumulativeProfit: number;
}

/** One timeline computed month by month: the P&L rows and their totals. */
export interface TimelinePlan {
  months: TimelineMonthResult[];
  totals: TimelineTotals;
}

export type TimelineComparisonMetric =
  | 'allocatedBudget'
  | 'revenue'
  | 'netProfit'
  | 'roas'
  | 'cpa'
  | 'breakEvenMonth';

/** One line of "active timeline (A) versus saved scenario (B)". */
export interface TimelineComparisonRow {
  metric: TimelineComparisonMetric;
  /** null only for `breakEvenMonth` when the side never breaks even. */
  a: number | null;
  b: number | null;
  /** a - b. */
  diff: number;
  /** `diff` as a % of |b| (0 when b is 0, and always 0 for `breakEvenMonth`). */
  diffPct: number;
  winner: 'A' | 'B' | 'tie';
}

export interface TimelineComparison {
  scenarioId: string;
  rows: TimelineComparisonRow[];
  /** Month-by-month overlay, as long as the longer of the two timelines (missing months are 0). */
  overlay: Array<{
    aRevenue: number;
    aCumulativeProfit: number;
    bRevenue: number;
    bCumulativeProfit: number;
  }>;
}

/** The active timeline re-budgeted with one pattern, and how well it meets the goal. */
export interface TimelineOptimisationCandidate {
  pattern: TimelinePattern;
  /** Higher is better for `TimelineInput.optimisationGoal`. */
  score: number;
  /** 0-100. */
  confidence: number;
  totals: Pick<
    TimelineTotals,
    'allocatedBudget' | 'spend' | 'revenue' | 'netProfit' | 'roas' | 'cpa' | 'breakEvenMonth'
  >;
}

export interface TimelineResult {
  /** Which engine produced the numbers. */
  engine: { id: string; version: string };
  /** The active timeline. */
  plan: TimelinePlan;
  /** Every saved scenario computed the same way, keyed by scenario id. */
  scenarios: Record<string, TimelinePlan>;
  /** Active timeline versus `comparisonScenarioId`; null when no (known) scenario is picked. */
  comparison: TimelineComparison | null;
  /** Candidate patterns, best score first. */
  optimisation: TimelineOptimisationCandidate[];
  /** Budget per month when the pattern is applied to `TimelineInput.redistribute`. */
  patternBudgets: number[];
  /** The channel mix a newly generated month starts from: the single-month plan's live channels. */
  baseChannels: TimelineChannel[];
}
