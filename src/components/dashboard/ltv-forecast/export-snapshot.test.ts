import { describe, expect, it } from 'vitest';
import { buildExportSnapshot } from './export-snapshot';
import type { AggregateMetrics, SandboxChannelMetric, ScenarioPoint } from './types';

const baselineMetrics: AggregateMetrics = {
  totalSpend: 1000,
  totalConversions: 10,
  projectedRevenue: 1500,
  blendedCpa: 100,
  blendedRoas: 1.5,
  roi: 0.5,
};

const sandboxMetrics: AggregateMetrics = {
  totalSpend: 2000,
  totalConversions: 25,
  projectedRevenue: 5000,
  blendedCpa: 80,
  blendedRoas: 2.5,
  roi: 1.5,
};

const channelMetric: SandboxChannelMetric = {
  channelId: 'a',
  channelName: 'Google Ads',
  group: 'paid',
  baselineSpend: 1000,
  adjustedSpend: 2000,
  baselineCpa: 100,
  adjustedCpa: 80,
  baselineRoas: 1.5,
  adjustedRoas: 2.5,
  adjustedConversions: 25,
  adjustedRevenue: 5000,
  churnPct: 5,
};

const sp = (scenario: ScenarioPoint['scenario'], cohort: number, ltvToCac: number): ScenarioPoint => ({
  scenario,
  projectedLtvPerUser: 0,
  projectedCohortValue: cohort,
  ltvToCac,
});

describe('buildExportSnapshot', () => {
  const snapshot = buildExportSnapshot({
    sandboxEnabled: true,
    activeSummaryText: 'summary',
    baselineMetrics,
    sandboxMetrics,
    sandboxChannelMetrics: [channelMetric],
    baselineScenarioData: [sp('Bear', 500, 1), sp('Base', 1500, 2), sp('Bull', 3000, 3)],
    scenarioData: [sp('Bear', 1000, 1.5), sp('Base', 3000, 2.5)],
  });

  it('has the SandboxExportSnapshot top-level keys', () => {
    expect(Object.keys(snapshot).sort()).toEqual([
      'adjustedMetrics',
      'baselineMetrics',
      'channelComparisons',
      'enabled',
      'scenarioComparisons',
      'summaryText',
    ]);
    expect(snapshot.enabled).toBe(true);
    expect(snapshot.summaryText).toBe('summary');
  });

  it('adds roiPct to both metric blocks and keeps the fractional roi', () => {
    expect(snapshot.baselineMetrics).toEqual({ ...baselineMetrics, roiPct: 50 });
    expect(snapshot.adjustedMetrics).toEqual({ ...sandboxMetrics, roiPct: 150 });
  });

  it('maps channel comparisons without the conversion and revenue fields', () => {
    expect(snapshot.channelComparisons).toEqual([
      {
        channelId: 'a',
        channelName: 'Google Ads',
        group: 'paid',
        baselineSpend: 1000,
        adjustedSpend: 2000,
        baselineCpa: 100,
        adjustedCpa: 80,
        baselineRoas: 1.5,
        adjustedRoas: 2.5,
        churnPct: 5,
      },
    ]);
  });

  it('builds scenario comparisons in baseline order', () => {
    expect(snapshot.scenarioComparisons.map((s) => s.scenario)).toEqual(['Bear', 'Base', 'Bull']);
    expect(snapshot.scenarioComparisons[1]).toEqual({
      scenario: 'Base',
      baselineProjectedCohortValue: 1500,
      adjustedProjectedCohortValue: 3000,
      baselineLtvToCac: 2,
      adjustedLtvToCac: 2.5,
      baselineRoiPct: 50,
      adjustedRoiPct: 50,
    });
  });

  it('falls back to the baseline scenario when no adjusted one exists', () => {
    const bull = snapshot.scenarioComparisons[2];
    expect(bull.adjustedProjectedCohortValue).toBe(3000);
    expect(bull.adjustedLtvToCac).toBe(3);
    // 3000 cohort value against sandbox spend 2000
    expect(bull.adjustedRoiPct).toBe(50);
    expect(bull.baselineRoiPct).toBe(200);
  });

  it('reports 0 ROI percent for zero spend', () => {
    const zero = buildExportSnapshot({
      sandboxEnabled: false,
      activeSummaryText: '',
      baselineMetrics: { ...baselineMetrics, totalSpend: 0 },
      sandboxMetrics: { ...sandboxMetrics, totalSpend: 0 },
      sandboxChannelMetrics: [],
      baselineScenarioData: [sp('Base', 1500, 2)],
      scenarioData: [sp('Base', 3000, 2.5)],
    });
    expect(zero.enabled).toBe(false);
    expect(zero.channelComparisons).toEqual([]);
    expect(zero.scenarioComparisons[0].baselineRoiPct).toBe(0);
    expect(zero.scenarioComparisons[0].adjustedRoiPct).toBe(0);
  });
});
