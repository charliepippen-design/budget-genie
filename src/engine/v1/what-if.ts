// `computeWhatIf`: the customer-value lab on the response-curve model.
//
// Sandbox spend changes move each channel along its own curve (more spend buys fewer
// conversions per unit), and the lab's churn and decay controls stress the retention curve.

import { clamp } from '@/lib/ltv-model';
import { getChannelGroup, type ChannelGroup, type StressAssumptions } from '@/lib/planning-insights';
import { SANDBOX_DEFAULT_ADJUSTMENT } from '@/lib/what-if/constants';
import { buildExportNumbers } from '@/lib/what-if/export-snapshot';
import { churnEffectFor } from '@/lib/what-if/sandbox-channel';
import {
  aggregateMetrics,
  groupSpendImpact,
  sandboxSummarySignals,
  toBaselineAggregate,
  weightedChurnDeltaPct,
} from '@/lib/what-if/sandbox-math';
import { baseScenarioRoiDelta, scenarioRoiData } from '@/lib/what-if/scenario-math';
import type { AggregateMetrics, ScenarioPoint } from '@/lib/what-if/types';
import type { EngineInput } from '../contract';
import type { WhatIfChannel, WhatIfInput, WhatIfResult } from '../what-if';
import { ENGINE_REF, buildScenarios, buildValuePoints, rangeAssumptions } from './compute';
import { buildPlanModel, rangeSet, type ChannelModel, type PlanModel } from './model';
import { LAB_DECAY_CURVES, LAB_REFERENCE_CHURN } from './priors';
import { conversionsAt } from './response-curve';
import { lognormalRange } from './stats';
import { paybackMonth, paybackRange } from './value-curve';

function sandboxChannel(
  c: ChannelModel,
  selected: boolean,
  whatIf: WhatIfInput,
  group: ChannelGroup
): WhatIfChannel {
  const adjustment = selected
    ? (whatIf.sandbox.channelAdjustments[c.channel.id] ?? SANDBOX_DEFAULT_ADJUSTMENT)
    : SANDBOX_DEFAULT_ADJUSTMENT;
  const groupDelta = whatIf.sandbox.groupAdjustments[group] ?? 0;
  const spendMultiplier = (1 + groupDelta / 100) * (1 + clamp(adjustment.spendPct, -80, 200) / 100);
  const adjustedSpend = Math.max(0, c.spend * spendMultiplier);

  const cpaFactor = 1 + clamp(adjustment.cpaPct, -70, 300) / 100;
  const roasFactor = 1 + clamp(adjustment.roasPct, -90, 300) / 100;
  const churnEffect = churnEffectFor(adjustment.churnPct);

  const baselineCpa = c.conversions > 0 ? c.spend / c.conversions : 0;
  const baselineRoas = c.spend > 0 ? c.revenue / c.spend : 0;
  // The new spend is read off the channel's curve, then the user's cost shock is applied.
  const curveConversions = c.active ? conversionsAt(c.curve, adjustedSpend) / cpaFactor : 0;
  const curveRevenue = curveConversions * c.valuePerConversion * roasFactor;

  return {
    channelId: c.channel.id,
    channelName: c.channel.name,
    group,
    baselineSpend: c.spend,
    adjustedSpend,
    baselineCpa,
    adjustedCpa: curveConversions > 0 ? adjustedSpend / curveConversions : Math.max(0.01, baselineCpa * cpaFactor),
    baselineRoas,
    adjustedRoas: adjustedSpend > 0 ? curveRevenue / adjustedSpend : Math.max(0, baselineRoas * roasFactor),
    adjustedConversions: Math.max(0, curveConversions * churnEffect),
    adjustedRevenue: Math.max(0, curveRevenue * churnEffect),
    churnPct: adjustment.churnPct,
  };
}

function baselineOf(model: PlanModel): AggregateMetrics {
  return toBaselineAggregate({
    totalSpend: model.totalSpend,
    totalConversions: model.totalConversions,
    projectedRevenue: model.totalRevenue,
    blendedCpa: model.totalConversions > 0 ? model.totalSpend / model.totalConversions : null,
    blendedRoas: model.totalSpend > 0 ? model.totalRevenue / model.totalSpend : 0,
  });
}

export function computeWhatIf(input: EngineInput, whatIf: WhatIfInput): WhatIfResult {
  const { churnRatePct, cpaShockPct, roasLiftPct, decayCurve, sandbox } = whatIf;

  // The sandbox's churn adjustment needs the channels first, so the unstressed model comes first.
  const plain = buildPlanModel(input);
  const selected = new Set(sandbox.selectedChannelIds);
  const channels = plain.channels.map((c) =>
    sandboxChannel(c, selected.has(c.channel.id), whatIf, getChannelGroup(c.channel))
  );
  const churnDeltaPct = weightedChurnDeltaPct(channels, selected);

  const assumptions: StressAssumptions = {
    churnRate: clamp((churnRatePct + (sandbox.enabled ? churnDeltaPct : 0)) / 100, 0.01, 0.2),
    cpaMultiplier: 1 + cpaShockPct / 100,
    roasMultiplier: 1 + roasLiftPct / 100,
  };

  // Churn is a stress relative to the lab's default: at the default the curve is the prior.
  const decay = LAB_DECAY_CURVES[decayCurve] ?? LAB_DECAY_CURVES['standard-linear'];
  const stressed = buildPlanModel(input, {
    churnSpeed: (assumptions.churnRate / LAB_REFERENCE_CHURN) * decay.churnSpeed,
    shape: decay.shape,
  });
  const value = stressed.value;
  // Faster churn shortens the customer's life, so it lowers lifetime value as well as delaying it.
  const valueMultiplier = assumptions.roasMultiplier * value.lifetimeMultiplier;

  const baseline = baselineOf(plain);
  const adjusted = aggregateMetrics(channels);
  const active = sandbox.enabled ? adjusted : baseline;

  // A cost shock means the same spend buys fewer conversions, so the cohort and its value shrink with it.
  const shocked = (metrics: AggregateMetrics) => ({
    conversions: metrics.totalConversions / assumptions.cpaMultiplier,
    revenue: (metrics.projectedRevenue * valueMultiplier) / assumptions.cpaMultiplier,
    cpa: (metrics.blendedCpa ?? 0) * assumptions.cpaMultiplier,
  });
  const scenariosFor = (metrics: AggregateMetrics): ScenarioPoint[] => {
    const s = shocked(metrics);
    return buildScenarios(lognormalRange(s.revenue, plain.revenueLogSd), s.conversions, s.cpa);
  };
  const baselineScenarios = scenariosFor(baseline);
  const activeScenarios = scenariosFor(active);
  const baselineRoi = scenarioRoiData(baselineScenarios, baseline.totalSpend);
  const adjustedRoi = scenarioRoiData(activeScenarios, active.totalSpend);

  const activeShocked = shocked(active);
  // Stated lifetime value per customer under the return lift; the curve carries the churn stress.
  const valuePerCustomer =
    active.totalConversions > 0 ? (active.projectedRevenue / active.totalConversions) * assumptions.roasMultiplier : 0;

  return {
    engine: { ...ENGINE_REF },
    baseline,
    adjusted,
    active,
    channels,
    groups: groupSpendImpact(channels),
    churnDeltaPct,
    assumptions,
    customerValue: {
      curve: buildValuePoints(value, valuePerCustomer, activeShocked.conversions, active.totalSpend, activeShocked.cpa),
      paybackMonth: paybackMonth(value, valuePerCustomer, activeShocked.cpa || null, 12),
      monthlyChurn: assumptions.churnRate,
      // The model has no expansion term: a retained customer is worth the same each month.
      monthlyExpansion: 0,
      isCalibrated: value.isCalibrated,
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
    ranges: {
      totals: rangeSet(
        active.totalSpend,
        activeShocked.conversions,
        activeShocked.revenue,
        plain.conversionsLogSd,
        plain.revenueLogSd
      ),
      paybackMonth: paybackRange(value, valuePerCustomer, activeShocked.cpa || null, plain.revenueLogSd),
      assumptions: rangeAssumptions(plain),
    },
  };
}
