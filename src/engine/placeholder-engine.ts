// Placeholder engine: today's heuristics behind the engine port. The numbers are illustrative
// planning estimates, not a statistical model; the real engine replaces this through setEngine().

import { computePlanSnapshot } from '@/lib/media-plan/plan-snapshot';
import { computePlanEconomics } from '@/lib/plan-economics';
import { roasPairFromEconomics } from '@/lib/roas-pair';
import { buildLtvCurve, buildPlanScenarios, DEFAULT_CHURN_RATE } from '@/lib/ltv-model';
import { getEfficiencyAlerts, getMetricIntegrityIssues } from '@/lib/planning-insights';
import type { EngineInput, EngineResult, PlanEngine } from './contract';

function compute(input: EngineInput): EngineResult {
  const snapshot = computePlanSnapshot({
    totalBudget: input.budget,
    channels: input.channels,
    globalMultipliers: input.assumptions,
    activeTiers: input.markets.tiers,
    activeGeos: input.markets.geos,
    geoOverrides: input.markets.overrides,
  });
  const { blended } = snapshot;

  const economics = computePlanEconomics(blended, input.industry, input.assumptions);

  const aggregate = {
    totalSpend: blended.totalSpend,
    totalConversions: blended.totalConversions,
    blendedCpa: blended.blendedCpa,
    blendedRoas: blended.blendedRoas,
  };
  const valueModel = {
    playerValue: input.assumptions.playerValue,
    blendedRoas: blended.blendedRoas,
    churnRate: DEFAULT_CHURN_RATE,
    observedLtv: input.observedValue,
  };
  const curve = buildLtvCurve(aggregate, valueModel);
  const month12 = curve.points[11];

  return {
    engine: { id: placeholderEngine.id, version: placeholderEngine.version },
    channels: snapshot.channels,
    totals: {
      ...blended,
      fixedSpend: snapshot.fixedSpend,
      overBudget: snapshot.overBudget,
      overBudgetBy: snapshot.overBudgetBy,
      unallocated: Math.max(0, input.budget - blended.totalSpend),
    },
    economics,
    roas: roasPairFromEconomics(economics, blended.blendedRoas),
    customerValue: {
      curve: curve.points,
      paybackMonth: curve.paybackMonth,
      valuePerCustomer12m: month12?.cumulativeLtvPerUser ?? 0,
      ltvToCac12m: month12?.ltvToCac ?? null,
    },
    scenarios: buildPlanScenarios(aggregate, valueModel),
    alerts: {
      efficiency: getEfficiencyAlerts(snapshot.channels),
      integrity: getMetricIntegrityIssues(snapshot.channels),
    },
  };
}

export const placeholderEngine: PlanEngine = {
  id: 'placeholder',
  version: '0.1.0',
  compute,
};
