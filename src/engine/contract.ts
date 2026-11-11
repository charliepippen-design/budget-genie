// The engine port: the only contract between the UI and the planning engine.
//
// Widgets, pages, exports and AI context read plan numbers from an `EngineResult` and never
// compute them themselves. Any engine that implements `PlanEngine` can be plugged in through
// `setEngine` (see registry.ts) without touching the UI.
//
// Names are industry-neutral: a "conversion" is an FTD in iGaming, a sale in e-commerce, a
// customer in SaaS. The value of a conversion is `valuePerConversion` in the engine's terms
// (today the store still calls it `playerValue`).

import type {
  BlendedMetrics,
  ChannelData,
  ChannelWithMetrics,
  GeoAllocationState,
  GeoMarketOverride,
  GlobalMultipliers,
  ObservedLtvInputs,
} from '@/lib/media-plan/types';
import type { Vertical } from '@/lib/vertical-presets';
import type { PlanEconomics } from '@/lib/plan-economics';
import type { RoasPair } from '@/lib/roas-pair';
import type { LtvCurvePoint } from '@/lib/ltv-model';
import type { EfficiencyAlert, MetricIntegrityIssue, ScenarioEnvelopePoint } from '@/lib/planning-insights';

// ========== INPUT ==========

/** Markets the plan buys in: tier weights, named markets and per-market cost/value overrides. */
export interface EngineMarkets {
  tiers: GeoAllocationState;
  geos: string[];
  overrides: Record<string, GeoMarketOverride>;
}

/**
 * Everything the user can set that changes the numbers. The engine must be a pure function of
 * this input: same input, same result.
 */
export interface EngineInput {
  /** Monthly budget. */
  budget: number;
  /** Channels with their buying model, price, funnel rates and share of the variable budget. */
  channels: ChannelData[];
  /** Plan-wide assumptions: spend/CTR/CPM adjustments, targets, value per conversion, revenue-model rates. */
  assumptions: GlobalMultipliers;
  markets: EngineMarkets;
  /** Business type; null when the user has not picked one. */
  industry: Vertical | null;
  /** Value per customer the user has actually observed at months 1, 3 and 6 (calibrates the curve). */
  observedValue: ObservedLtvInputs;
}

// ========== OUTPUT ==========

export interface EngineTotals extends BlendedMetrics {
  /** Sum of active fixed-fee prices (spent in full whatever the budget). */
  fixedSpend: number;
  /** True when fixed fees alone exceed the budget. */
  overBudget: boolean;
  /** How far fixed fees exceed the budget (0 when within budget). */
  overBudgetBy: number;
  /** Budget left unspent (0 or more). */
  unallocated: number;
}

/** Value of one customer over time and when it pays back its acquisition cost. */
export interface EngineCustomerValue {
  /** 12 monthly points: cumulative value per customer, cohort value, LTV:CAC. */
  curve: LtvCurvePoint[];
  /** First month in which cumulative value per customer covers the CPA; null if not within 12 months. */
  paybackMonth: number | null;
  /** Cumulative value per customer after 12 months. */
  valuePerCustomer12m: number;
  /** 12-month value per customer / CPA; null when there is no CPA. */
  ltvToCac12m: number | null;
}

export interface EngineAlerts {
  efficiency: EfficiencyAlert[];
  integrity: MetricIntegrityIssue[];
}

export interface EngineResult {
  /** Which engine produced the numbers, so screens and exports can say so. */
  engine: { id: string; version: string };
  /** Per-channel results, in input order, including inactive channels (zeroed). */
  channels: ChannelWithMetrics[];
  totals: EngineTotals;
  /** Month-1 and cohort P&L: the only source of net value, loss and break-even CPA. */
  economics: PlanEconomics;
  roas: RoasPair;
  customerValue: EngineCustomerValue;
  /** Bear / Base / Bull cohort scenarios. */
  scenarios: ScenarioEnvelopePoint[];
  alerts: EngineAlerts;
}

// ========== ENGINE ==========

export interface PlanEngine {
  id: string;
  version: string;
  /** Pure: must not read stores, storage or the network. */
  compute(input: EngineInput): EngineResult;
}
