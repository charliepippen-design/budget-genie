import type { ChannelGroup } from '@/lib/planning-insights';

export interface ScenarioPoint {
  scenario: 'Bear' | 'Base' | 'Bull';
  projectedLtvPerUser: number;
  projectedCohortValue: number;
  ltvToCac: number | null;
}

export interface AggregateMetrics {
  totalSpend: number;
  totalConversions: number;
  projectedRevenue: number;
  blendedCpa: number | null;
  blendedRoas: number;
  roi: number;
}

export interface SandboxChannelMetric {
  channelId: string;
  channelName: string;
  group: ChannelGroup;
  baselineSpend: number;
  adjustedSpend: number;
  baselineCpa: number;
  adjustedCpa: number;
  baselineRoas: number;
  adjustedRoas: number;
  adjustedConversions: number;
  adjustedRevenue: number;
  churnPct: number;
}

/** Percentage adjustments the user applies to one channel in the sandbox. */
export interface ChannelSandboxAdjustment {
  spendPct: number;
  cpaPct: number;
  roasPct: number;
  churnPct: number;
}

export interface SandboxMetricSummary {
  totalSpend: number;
  totalConversions: number;
  blendedCpa: number | null;
  blendedRoas: number;
  projectedRevenue: number;
  roiPct: number;
}

export interface SandboxChannelComparison {
  channelId: string;
  channelName: string;
  group: ChannelGroup;
  baselineSpend: number;
  adjustedSpend: number;
  baselineCpa: number;
  adjustedCpa: number;
  baselineRoas: number;
  adjustedRoas: number;
  churnPct: number;
}

export interface SandboxScenarioComparison {
  scenario: 'Bear' | 'Base' | 'Bull';
  baselineProjectedCohortValue: number;
  adjustedProjectedCohortValue: number;
  baselineLtvToCac: number | null;
  adjustedLtvToCac: number | null;
  baselineRoiPct: number;
  adjustedRoiPct: number;
}

export interface SandboxExportSnapshot {
  enabled: boolean;
  summaryText: string;
  baselineMetrics: SandboxMetricSummary;
  adjustedMetrics: SandboxMetricSummary;
  channelComparisons: SandboxChannelComparison[];
  scenarioComparisons: SandboxScenarioComparison[];
}

/** One channel group's spend before and after the sandbox adjustments. */
export interface SandboxGroupImpact {
  group: ChannelGroup;
  baselineSpend: number;
  sandboxSpend: number;
  delta: number;
}

/** The figures behind the sandbox summary sentence. */
export interface SandboxSummarySignals {
  /** Adjusted ROI minus baseline ROI, in percentage points. */
  roiDeltaPct: number;
  paidRiskRaised: boolean;
  churnPressure: boolean;
}

export interface ScenarioRoiPoint {
  scenario: ScenarioPoint['scenario'];
  roi: number;
}
