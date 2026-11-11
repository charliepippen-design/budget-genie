// The what-if port: the customer-value lab.
//
// The lab stresses the single-month plan (`EngineInput`) with the user's assumptions and sandbox
// adjustments (`WhatIfInput`) and reads every number it shows from a `WhatIfResult`.

import type { DecayCurveArchitecture, LtvCurvePoint } from '@/lib/ltv-model';
import type { ChannelGroup, StressAssumptions } from '@/lib/planning-insights';
import type {
  AggregateMetrics,
  ChannelSandboxAdjustment,
  SandboxChannelMetric,
  SandboxExportSnapshot,
  SandboxGroupImpact,
  SandboxSummarySignals,
  ScenarioPoint,
  ScenarioRoiPoint,
} from '@/lib/what-if/types';

// ========== INPUT ==========

/** Shape of the retention curve over the 12 months. */
export type WhatIfDecayCurve = DecayCurveArchitecture;

/** % changes applied to one channel: spend, cost per conversion, return and churn. */
export type WhatIfChannelAdjustment = ChannelSandboxAdjustment;

/** The sandbox: per-channel and per-group adjustments compared against the untouched plan. */
export interface WhatIfSandboxInput {
  /** When false the adjustments are still computed (`adjusted`) but `active` stays the baseline. */
  enabled: boolean;
  /** Channels whose `channelAdjustments` apply; the others only get their group's shift. */
  selectedChannelIds: string[];
  channelAdjustments: Record<string, WhatIfChannelAdjustment>;
  /** Spend shift per channel group, in %. */
  groupAdjustments: Record<ChannelGroup, number>;
}

/**
 * Everything the user can set in the lab. The value per customer observed at months 1, 3 and 6
 * is part of `EngineInput.observedValue`.
 */
export interface WhatIfInput {
  /** Monthly churn in % (4.2 = 4.2% of customers lost each month). */
  churnRatePct: number;
  /** Rise in cost per conversion, in %. */
  cpaShockPct: number;
  /** Lift in return on spend, in %. */
  roasLiftPct: number;
  decayCurve: WhatIfDecayCurve;
  sandbox: WhatIfSandboxInput;
}

// ========== OUTPUT ==========

/** Spend, conversions, revenue, blended CPA / return and ROI (a fraction: 0.5 = 50%) of a plan. */
export type WhatIfTotals = AggregateMetrics;

/** One channel before and after its sandbox adjustments. */
export type WhatIfChannel = SandboxChannelMetric;

/** One channel group's spend before and after the sandbox adjustments. */
export type WhatIfGroupImpact = SandboxGroupImpact;

/** Bear / Base / Bull value of the cohort. */
export type WhatIfScenario = ScenarioPoint;

/** ROI of one scenario, in %. */
export type WhatIfScenarioRoi = ScenarioRoiPoint;

export interface WhatIfCustomerValue {
  /** 12 monthly points for the active plan: cumulative value per customer, cohort value, LTV:CAC. */
  curve: LtvCurvePoint[];
  /** First month in which cumulative value per customer covers the CPA; null if not within 12 months. */
  paybackMonth: number | null;
  /** Monthly churn actually applied, as a fraction (after sandbox churn and clamping). */
  monthlyChurn: number;
  /** Monthly growth in value of a retained customer, as a fraction. */
  monthlyExpansion: number;
  /** True when the curve is fitted to the observed value points. */
  isCalibrated: boolean;
}

export interface WhatIfScenarios {
  /** Scenarios of the untouched plan under the stress assumptions. */
  baseline: WhatIfScenario[];
  /** Scenarios of the active plan (the sandbox when enabled). */
  active: WhatIfScenario[];
  baselineRoi: WhatIfScenarioRoi[];
  adjustedRoi: WhatIfScenarioRoi[];
  /** Base-scenario ROI, adjusted minus baseline, in points; null when it cannot be compared. */
  baseRoiDelta: number | null;
}

export interface WhatIfResult {
  /** Which engine produced the numbers. */
  engine: { id: string; version: string };
  /** The untouched plan. */
  baseline: WhatIfTotals;
  /** The plan with every sandbox adjustment applied. */
  adjusted: WhatIfTotals;
  /** `adjusted` when the sandbox is enabled, otherwise `baseline`: what the lab's value model runs on. */
  active: WhatIfTotals;
  /** Per-channel comparison, in input order. */
  channels: WhatIfChannel[];
  /** Per-group spend comparison (organic, paid, affiliate, influencer). */
  groups: WhatIfGroupImpact[];
  /** Spend-weighted churn adjustment of the selected channels, in % points. */
  churnDeltaPct: number;
  /** The stress assumptions as applied: churn fraction, CPA and return multipliers. */
  assumptions: StressAssumptions;
  customerValue: WhatIfCustomerValue;
  scenarios: WhatIfScenarios;
  /** What the sandbox did overall: ROI change in % points and the risk flags. */
  summary: SandboxSummarySignals;
  /** The numbers exports and the AI context embed (the summary sentence is added by the UI). */
  exportSnapshot: Omit<SandboxExportSnapshot, 'summaryText'>;
}
