import type { ChannelGroup } from '@/lib/planning-insights';

export interface ScenarioPoint {
  scenario: 'Bear' | 'Base' | 'Bull';
  projectedLtvPerUser: number;
  projectedCohortValue: number;
  ltvToCac: number;
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
