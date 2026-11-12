// Placeholder timeline: today's multi-month heuristics (src/lib/multi-month/calc.ts) behind the
// engine port. Formulas are kept as they were; the real engine replaces them through setEngine().

import { normalizeIgamingRevenueInputs } from '@/lib/igaming-revenue-model';
import { computePlanSnapshot } from '@/lib/media-plan/plan-snapshot';
import {
  calculateDistribution,
  calculatePlanMetrics,
  channelsFromPlanSnapshot,
} from '@/lib/multi-month/calc';
import type { EngineInput } from './contract';
import type {
  TimelineComparison,
  TimelineComparisonRow,
  TimelineInput,
  TimelineMonthInput,
  TimelineOptimisationCandidate,
  TimelinePattern,
  TimelinePlan,
  TimelineResult,
  TimelineSettings,
  TimelineTotals,
} from './timeline';

type RevenueModel = Parameters<typeof calculatePlanMetrics>[2];

/** The budget patterns the optimiser tries. */
export const OPTIMISATION_PATTERNS: TimelinePattern[] = [
  'linear',
  'exponential',
  'aggressive-launch',
  'flat',
  'step',
];

function computePlan(
  months: TimelineMonthInput[],
  settings: TimelineSettings,
  revenueModel: RevenueModel
): TimelinePlan {
  const { months: rows, totals } = calculatePlanMetrics(months, settings, revenueModel);
  return {
    months: rows.map((m) => ({
      id: m.id,
      label: m.label,
      isSoftLaunch: m.isSoftLaunch,
      budget: m.budget,
      spend: m.totalSpend,
      conversions: m.totalConversions,
      revenue: m.revenue,
      operatingCosts: m.operatingCosts,
      netProfit: m.netProfit,
      cumulativeProfit: m.cumulativeProfit,
      channelSpend: m.channels.map((ch) => ({
        channelId: ch.channelId,
        name: ch.name,
        spend: (ch.allocationPct / 100) * (m.totalSpend || m.budget),
      })),
      revenueModel:
        m.ngr === undefined
          ? null
          : {
              registrations: m.registrations ?? 0,
              activePlayers: m.activePlayers ?? 0,
              ggr: m.ggr ?? 0,
              bonus: m.bonus ?? 0,
              ngr: m.ngr,
              grossContribution: m.grossContribution ?? 0,
            },
      // As the dashboard's plan-health chart computed it (grossContribution is already net of spend).
      contributionDelta: (m.grossContribution || 0) - (m.totalSpend || 0),
    })),
    totals: {
      allocatedBudget: totals.totalAllocatedBudget,
      spend: totals.totalSpend,
      conversions: totals.totalConversions,
      revenue: totals.totalRevenue,
      netRevenue: totals.totalNgr,
      grossContribution: totals.totalGrossContribution,
      operatingCosts: totals.operatingCosts,
      netProfit: totals.netProfit,
      avgMonthlyBudget: totals.avgMonthlyBudget,
      cpa: totals.avgCpa,
      roas: totals.avgRoas,
      breakEvenMonth: totals.breakEvenMonth,
      endingCumulativeProfit: totals.endingCumulativeProfit,
    },
  };
}

function compareValues(
  aVal: number,
  bVal: number,
  higherIsBetter: boolean
): Pick<TimelineComparisonRow, 'diff' | 'diffPct' | 'winner'> {
  const diff = aVal - bVal;
  const diffPct = bVal !== 0 ? (diff / Math.abs(bVal)) * 100 : 0;
  let winner: 'A' | 'B' | 'tie' = 'tie';
  if (Math.abs(diff) > 0.01) {
    winner = higherIsBetter ? (diff > 0 ? 'A' : 'B') : diff < 0 ? 'A' : 'B';
  }
  return { diff, diffPct, winner };
}

export function comparePlans(scenarioId: string, planA: TimelinePlan, planB: TimelinePlan): TimelineComparison {
  const a = planA.totals;
  const b = planB.totals;
  const row = (
    metric: TimelineComparisonRow['metric'],
    aVal: number,
    bVal: number,
    higherIsBetter: boolean
  ): TimelineComparisonRow => ({ metric, a: aVal, b: bVal, ...compareValues(aVal, bVal, higherIsBetter) });

  const overlay: TimelineComparison['overlay'] = [];
  const maxLen = Math.max(planA.months.length, planB.months.length);
  for (let i = 0; i < maxLen; i++) {
    const monthA = planA.months[i];
    const monthB = planB.months[i];
    overlay.push({
      aRevenue: monthA?.revenue || 0,
      aCumulativeProfit: monthA?.cumulativeProfit || 0,
      bRevenue: monthB?.revenue || 0,
      bCumulativeProfit: monthB?.cumulativeProfit || 0,
    });
  }

  return {
    scenarioId,
    rows: [
      row('allocatedBudget', a.allocatedBudget, b.allocatedBudget, false),
      row('revenue', a.revenue, b.revenue, true),
      row('netProfit', a.netProfit, b.netProfit, true),
      row('roas', a.roas, b.roas, true),
      row('cpa', a.cpa || 0, b.cpa || 0, false),
      {
        metric: 'breakEvenMonth',
        a: a.breakEvenMonth,
        b: b.breakEvenMonth,
        diff: (a.breakEvenMonth ?? 99) - (b.breakEvenMonth ?? 99),
        diffPct: 0,
        winner:
          a.breakEvenMonth !== null && b.breakEvenMonth !== null
            ? a.breakEvenMonth < b.breakEvenMonth
              ? 'A'
              : a.breakEvenMonth > b.breakEvenMonth
                ? 'B'
                : 'tie'
            : a.breakEvenMonth !== null
              ? 'A'
              : b.breakEvenMonth !== null
                ? 'B'
                : 'tie',
      },
    ],
    overlay,
  };
}

export function optimisationScore(goal: TimelineInput['optimisationGoal'], totals: TimelineTotals): number {
  switch (goal) {
    case 'maximize-roas':
      return totals.roas * 100;
    case 'minimize-cac':
      return totals.cpa ? 100 / totals.cpa : 0;
    case 'maximize-revenue':
      return totals.revenue / 10000;
    case 'maximize-profit':
      return totals.netProfit / 1000;
    case 'breakeven-fastest':
      return totals.breakEvenMonth !== null ? (12 - totals.breakEvenMonth) * 10 : 0;
    default:
      return totals.roas * 20 + totals.netProfit / 5000;
  }
}

function optimise(input: TimelineInput): TimelineOptimisationCandidate[] {
  const baseTotal = input.settings.baseMonthlyBudget * input.months.length;

  const candidates = OPTIMISATION_PATTERNS.map((pattern) => {
    const budgets = calculateDistribution(pattern, baseTotal, input.months.length, {
      growthRate: input.settings.growthRate,
    });
    const testMonths = input.months.map((m, idx) => ({ ...m, budget: budgets[idx] }));
    // As before the port: candidates are scored on channel revenue, without the conversion-value model.
    const { totals } = computePlan(testMonths, input.settings, undefined);
    const score = optimisationScore(input.optimisationGoal, totals);

    return {
      pattern,
      score,
      confidence: Math.min(95, 60 + score / 10),
      totals: {
        allocatedBudget: totals.allocatedBudget,
        spend: totals.spend,
        revenue: totals.revenue,
        netProfit: totals.netProfit,
        roas: totals.roas,
        cpa: totals.cpa,
        breakEvenMonth: totals.breakEvenMonth,
      },
    };
  });

  return candidates.sort((a, b) => b.score - a.score);
}

export function computePlaceholderTimeline(
  input: EngineInput,
  timeline: TimelineInput,
  engine: { id: string; version: string }
): TimelineResult {
  const revenueModel =
    input.industry === 'igaming'
      ? normalizeIgamingRevenueInputs(input.assumptions, input.assumptions.playerValue)
      : undefined;

  const plan = computePlan(timeline.months, timeline.settings, revenueModel);
  const scenarios: Record<string, TimelinePlan> = {};
  timeline.scenarios.forEach((scenario) => {
    scenarios[scenario.id] = computePlan(scenario.months, scenario.settings, revenueModel);
  });
  const comparisonId = timeline.comparisonScenarioId;
  const compared = comparisonId !== null ? scenarios[comparisonId] : undefined;

  const redistribute = timeline.redistribute ?? {
    totalBudget: timeline.months.reduce((sum, m) => sum + m.budget, 0),
    monthCount: timeline.months.length,
  };

  const snapshot = computePlanSnapshot({
    totalBudget: input.budget,
    channels: input.channels,
    globalMultipliers: input.assumptions,
    activeTiers: input.markets.tiers,
    activeGeos: input.markets.geos,
    geoOverrides: input.markets.overrides,
  });

  return {
    engine,
    plan,
    scenarios,
    comparison: comparisonId !== null && compared ? comparePlans(comparisonId, plan, compared) : null,
    optimisation: optimise(timeline),
    patternBudgets: calculateDistribution(
      timeline.pattern,
      redistribute.totalBudget,
      redistribute.monthCount,
      { ...timeline.patternParams, growthRate: timeline.settings.growthRate }
    ),
    baseChannels: channelsFromPlanSnapshot(snapshot.channels),
  };
}
