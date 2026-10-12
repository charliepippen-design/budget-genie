import type { SandboxExportSnapshot } from '@/store/useSandboxStore';
import type { AggregateMetrics, SandboxChannelMetric, ScenarioPoint } from './types';

export function buildExportSnapshot(input: {
  sandboxEnabled: boolean;
  activeSummaryText: string;
  baselineMetrics: AggregateMetrics;
  sandboxMetrics: AggregateMetrics;
  sandboxChannelMetrics: SandboxChannelMetric[];
  baselineScenarioData: ScenarioPoint[];
  scenarioData: ScenarioPoint[];
}): SandboxExportSnapshot {
  const {
    sandboxEnabled,
    activeSummaryText,
    baselineMetrics,
    sandboxMetrics,
    sandboxChannelMetrics,
    baselineScenarioData,
    scenarioData,
  } = input;

  return {
    enabled: sandboxEnabled,
    summaryText: activeSummaryText,
    baselineMetrics: {
      ...baselineMetrics,
      roiPct: baselineMetrics.roi * 100,
    },
    adjustedMetrics: {
      ...sandboxMetrics,
      roiPct: sandboxMetrics.roi * 100,
    },
    channelComparisons: sandboxChannelMetrics.map((channel) => ({
      channelId: channel.channelId,
      channelName: channel.channelName,
      group: channel.group,
      baselineSpend: channel.baselineSpend,
      adjustedSpend: channel.adjustedSpend,
      baselineCpa: channel.baselineCpa,
      adjustedCpa: channel.adjustedCpa,
      baselineRoas: channel.baselineRoas,
      adjustedRoas: channel.adjustedRoas,
      churnPct: channel.churnPct,
    })),
    scenarioComparisons: baselineScenarioData.map((baselineScenario) => {
      const adjustedScenario =
        scenarioData.find((scenario) => scenario.scenario === baselineScenario.scenario) ??
        baselineScenario;
      const baselineRoiPct =
        baselineMetrics.totalSpend > 0
          ? ((baselineScenario.projectedCohortValue - baselineMetrics.totalSpend) /
              baselineMetrics.totalSpend) *
            100
          : 0;
      const adjustedRoiPct =
        sandboxMetrics.totalSpend > 0
          ? ((adjustedScenario.projectedCohortValue - sandboxMetrics.totalSpend) /
              sandboxMetrics.totalSpend) *
            100
          : 0;

      return {
        scenario: baselineScenario.scenario,
        baselineProjectedCohortValue: baselineScenario.projectedCohortValue,
        adjustedProjectedCohortValue: adjustedScenario.projectedCohortValue,
        baselineLtvToCac: baselineScenario.ltvToCac,
        adjustedLtvToCac: adjustedScenario.ltvToCac,
        baselineRoiPct,
        adjustedRoiPct,
      };
    }),
  };
}
