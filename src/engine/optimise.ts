// The optimise port: re-splitting the budget across channels for a goal.
//
// An engine that can do it implements `PlanEngine.optimise`. It never changes the plan itself:
// it returns the shares to apply and what the engine expects to gain from them.

/** What the split should maximise: conversions, their lifetime value, or value minus spend. */
export type OptimiseGoal = 'conversions' | 'value' | 'net';

export interface OptimiseConstraints {
  /** Smallest spend per channel as a % of the monthly budget, keyed by channel id. */
  minSharePct?: Record<string, number>;
  /** Largest spend per channel as a % of the monthly budget, keyed by channel id. */
  maxSharePct?: Record<string, number>;
  /** Ceiling on the plan's blended cost per conversion (all channels, fixed fees included), met by a split that still buys conversions. */
  maxCostPerConversion?: number | null;
}

export interface OptimiseOptions {
  goal: OptimiseGoal;
  constraints?: OptimiseConstraints;
}

/** The plan's expected (P50) figures under one split. */
export interface OptimiseOutcome {
  spend: number;
  conversions: number;
  /** Lifetime value of the conversions. */
  value: number;
  /** Value minus spend. */
  net: number;
  /** Spend / conversions; null without conversions. */
  costPerConversion: number | null;
}

export interface OptimiseResult {
  goal: OptimiseGoal;
  /**
   * New `allocationPct` for every input channel. Channels the optimiser may not move (inactive,
   * locked, fixed-fee) keep a share that reproduces their current spend.
   */
  shares: Record<string, number>;
  /** Spend per channel under the new split. */
  spend: Record<string, number>;
  /**
   * The monthly budget the new split needs. Lower than the input budget when spending all of it
   * would hurt the goal (`net`) or break a constraint; apply it together with `shares`.
   */
  recommendedBudget: number;
  /** Budget the new split leaves unspent (0 or more). */
  unspent: number;
  before: OptimiseOutcome;
  after: OptimiseOutcome;
  /** Change in the goal's figure, after minus before (never negative when the starting split met the constraints). */
  gain: number;
  /** `gain` as a % of the starting figure (0 when that is 0). */
  gainPct: number;
  /**
   * False when the constraints cannot all be met. Minimum shares that do not fit are scaled back
   * to fit; a cost ceiling that is out of reach is dropped and the best split without it returned.
   */
  feasible: boolean;
  /** Ids of the channels whose spend the optimiser was free to change. */
  movedChannelIds: string[];
}
