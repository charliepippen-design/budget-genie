// Placeholder what-if: the customer-value lab's heuristics (src/lib/what-if, ltv-model) behind
// the engine port. Formulas are kept as they were; the real engine replaces them through setEngine().

import { applyObservedCalibration, baselineLtvCurve, buildLtvCurve, clamp } from '@/lib/ltv-model';
import { computePlanSnapshot } from '@/lib/media-plan/plan-snapshot';
import { buildScenarioEnvelope } from '@/lib/planning-insights';
import { buildExportNumbers } from '@/lib/what-if/export-snapshot';
import {
  aggregateMetrics,
  computeSandboxChannelMetrics,
  groupSpendImpact,
  sandboxSummarySignals,
  toBaselineAggregate,
  weightedChurnDeltaPct,
} from '@/lib/what-if/sandbox-math';
import { baseScenarioRoiDelta, scenarioRoiData } from '@/lib/what-if/scenario-math';
import type { AggregateMetrics, ScenarioPoint } from '@/lib/what-if/types';
import type { EngineInput } from './contract';
import type { WhatIfInput, WhatIfResult } from './what-if';

export function computePlaceholderWhatIf(
  input: EngineInput,
  whatIf: WhatIfInput,
  engine: { id: string; version: string }
): WhatIfResult {
  const { churnRatePct, cpaShockPct, roasLiftPct, decayCurve, sandbox } = whatIf;
  const playerValue = input.assumptions.playerValue;
  const observedLtv = input.observedValue;

  const snapshot = computePlanSnapshot({
    totalBudget: input.budget,
    channels: input.channels,
    globalMultipliers: input.assumptions,
    activeTiers: input.markets.tiers,
    activeGeos: input.markets.geos,
    geoOverrides: input.markets.overrides,
  });

  const baseline = toBaselineAggregate(snapshot.blended);
  const selectedSet = new Set(sandbox.selectedChannelIds);
  const channels = computeSandboxChannelMetrics(
    snapshot.channels,
    selectedSet,
    sandbox.channelAdjustments,
    sandbox.groupAdjustments
  );
  const churnDeltaPct = weightedChurnDeltaPct(channels, selectedSet);
  const adjusted = aggregateMetrics(channels);
  const active = sandbox.enabled ? adjusted : baseline;

  const assumptions = {
    churnRate: clamp((churnRatePct + (sandbox.enabled ? churnDeltaPct : 0)) / 100, 0.01, 0.2),
    cpaMultiplier: 1 + cpaShockPct / 100,
    roasMultiplier: 1 + roasLiftPct / 100,
  };

  const calibrate = (blendedRoas: number) =>
    applyObservedCalibration(
      baselineLtvCurve({
        playerValue,
        blendedRoas: Math.max(0, blendedRoas),
        churnRate: assumptions.churnRate,
        roasLiftPct,
        decayCurve,
      }).cumulative,
      observedLtv
    );
  const baselineCalibration = calibrate(baseline.blendedRoas);
  const activeCalibration = calibrate(active.blendedRoas);

  const scenariosFor = (metrics: AggregateMetrics, calibrationMultiplier: number) =>
    buildScenarioEnvelope({
      baseLtvPerUser:
        (metrics.blendedCpa ?? 0) * Math.max(0, metrics.blendedRoas) * calibrationMultiplier,
      conversions: metrics.totalConversions,
      cpa: metrics.blendedCpa ?? 0,
      assumptions,
    }) as ScenarioPoint[];
  const baselineScenarios = scenariosFor(baseline, baselineCalibration.multiplier);
  const activeScenarios = scenariosFor(active, activeCalibration.multiplier);

  const baselineRoi = scenarioRoiData(baselineScenarios, baseline.totalSpend);
  // As before the port: the adjusted line always divides by the sandbox spend, enabled or not.
  const adjustedRoi = scenarioRoiData(activeScenarios, adjusted.totalSpend);

  const curve = buildLtvCurve(active, {
    playerValue,
    blendedRoas: active.blendedRoas,
    churnRate: assumptions.churnRate,
    roasLiftPct,
    decayCurve,
    cpaShockPct,
    observedLtv,
  });

  return {
    engine,
    baseline,
    adjusted,
    active,
    channels,
    groups: groupSpendImpact(channels),
    churnDeltaPct,
    assumptions,
    customerValue: {
      curve: curve.points,
      paybackMonth: curve.paybackMonth,
      monthlyChurn: assumptions.churnRate,
      monthlyExpansion: curve.monthlyExpansion,
      isCalibrated: baselineCalibration.isCalibrated,
    },
    scenarios: {
      baseline: baselineScenarios,
      active: activeScenarios,
      baselineRoi,
      adjustedRoi,
      baseRoiDelta: baseScenarioRoiDelta(baselineRoi, adjustedRoi),
    },
    summary: sandboxSummarySignals(baseline.roi, adjusted.roi, channels, churnDeltaPct),
    exportSnapshot: buildExportNumbers({
      sandboxEnabled: sandbox.enabled,
      baselineMetrics: baseline,
      sandboxMetrics: adjusted,
      sandboxChannelMetrics: channels,
      baselineScenarioData: baselineScenarios,
      scenarioData: activeScenarios,
    }),
  };
}
