import type {
  AggregateMetrics,
  SandboxChannelMetric,
  SandboxExportSnapshot,
  ScenarioPoint,
} from './types';

/** The snapshot's figures; the summary sentence is wording and is attached separately. */
export function buildExportNumbers(input: {
  sandboxEnabled: boolean;
  baselineMetrics: AggregateMetrics;
  sandboxMetrics: AggregateMetrics;
  sandboxChannelMetrics: SandboxChannelMetric[];
  baselineScenarioData: ScenarioPoint[];
  scenarioData: ScenarioPoint[];
}): Omit<SandboxExportSnapshot, 'summaryText'> {
  const {
    sandboxEnabled,
    baselineMetrics,
    sandboxMetrics,
    sandboxChannelMetrics,
    baselineScenarioData,
    scenarioData,
  } = input;

  return {
    enabled: sandboxEnabled,
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

export function withSummaryText(
  numbers: Omit<SandboxExportSnapshot, 'summaryText'>,
  summaryText: string
): SandboxExportSnapshot {
  return {
    enabled: numbers.enabled,
    summaryText,
    baselineMetrics: numbers.baselineMetrics,
    adjustedMetrics: numbers.adjustedMetrics,
    channelComparisons: numbers.channelComparisons,
    scenarioComparisons: numbers.scenarioComparisons,
  };
}

export function buildExportSnapshot(
  input: Parameters<typeof buildExportNumbers>[0] & { activeSummaryText: string }
): SandboxExportSnapshot {
  return withSummaryText(buildExportNumbers(input), input.activeSummaryText);
}
