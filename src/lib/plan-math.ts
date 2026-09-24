import { ChannelData, GlobalMultipliers, ChannelWithMetrics, BlendedMetrics, CalculatedChannelMetrics } from '../hooks/use-media-plan-store';
import { calculateUnifiedMetrics, ChannelTypeConfig } from '../types/channel';

export interface PlanAllocationResult {
  channelsWithMetrics: ChannelWithMetrics[];
  blendedMetrics: BlendedMetrics;
  categoryTotals: Record<string, { spend: number; percentage: number }>;
  totalAllocatedSpend: number;
  totalAllocationPct: number;
  unallocatedBudget: number;
  overBudgetAmount: number;
}

/**
 * Pure function to derive channel spend from total budget and channel configurations.
 * Fixed channels take their exact fixed cost.
 * Variable channels divide the remaining variable pool based on their relative weights.
 */
export function calculateChannelSpends(
  channels: ChannelData[],
  totalBudget: number
): Map<string, number> {
  const spendMap = new Map<string, number>();

  if (totalBudget <= 0) {
    channels.forEach(ch => spendMap.set(ch.id, 0));
    return spendMap;
  }

  const activeChannels = channels.filter(ch => ch.isActive !== false);

  // 1. Identify fixed channels
  const fixedChannels = activeChannels.filter(
    ch => ch.tier === 'fixed' || ch.buyingModel === 'FLAT_FEE' || ch.buyingModel === 'RETAINER'
  );
  let totalFixedCost = 0;
  fixedChannels.forEach(ch => {
    const cost = ch.typeConfig?.price || 0;
    spendMap.set(ch.id, cost);
    totalFixedCost += cost;
  });

  // 2. Identify variable channels
  const variableChannels = activeChannels.filter(
    ch => ch.tier !== 'fixed' && ch.buyingModel !== 'FLAT_FEE' && ch.buyingModel !== 'RETAINER'
  );

  const remainingPool = Math.max(0, totalBudget - totalFixedCost);

  // Calculate sum of variable weights
  // Use allocationPct as relative weight
  const totalVariableWeight = variableChannels.reduce(
    (sum, ch) => sum + (Number(ch.allocationPct) || 0),
    0
  );

  variableChannels.forEach(ch => {
    let spend = 0;
    if (totalVariableWeight > 0) {
      const share = (Number(ch.allocationPct) || 0) / totalVariableWeight;
      spend = remainingPool * share;
    } else if (variableChannels.length > 0) {
      spend = remainingPool / variableChannels.length;
    }
    spendMap.set(ch.id, spend);
  });

  // Inactive channels get 0
  channels.forEach(ch => {
    if (ch.isActive === false) {
      spendMap.set(ch.id, 0);
    }
  });

  return spendMap;
}

/**
 * Calculates complete metrics for a single channel given its allocated spend.
 */
export function calculateSingleChannelMetrics(
  channel: ChannelData,
  spend: number,
  multipliers: GlobalMultipliers
): CalculatedChannelMetrics {
  if (channel.isActive === false || spend <= 0) {
    return {
      spend: 0,
      impressions: 0,
      clicks: 0,
      registrations: 0,
      conversions: 0,
      cpl: null,
      cpa: null,
      revenue: 0,
      roas: 0,
      effectivePrice: channel.typeConfig?.price || 0,
      effectiveCtr: channel.typeConfig?.baselineMetrics?.ctr || 0,
      effectiveCr: channel.typeConfig?.baselineMetrics?.conversionRate || 0,
      clickToReg: channel.typeConfig?.baselineMetrics?.clickToReg,
      regToFtd: channel.typeConfig?.baselineMetrics?.regToFtd,
    };
  }

  const effectiveCtr = Math.max(0.01, (channel.typeConfig.baselineMetrics.ctr || 1) + (multipliers.ctrBump || 0));

  let effectivePrice = channel.typeConfig.price;
  if (channel.buyingModel === 'CPM' && multipliers.defaultCpmOverride) {
    effectivePrice = multipliers.defaultCpmOverride;
  }

  const effectiveConfig: ChannelTypeConfig = {
    ...channel.typeConfig,
    price: effectivePrice,
    baselineMetrics: {
      ...channel.typeConfig.baselineMetrics,
      ctr: effectiveCtr,
    },
  };

  const effectiveLtv = channel.typeConfig.baselineMetrics.expectedLtv || multipliers.playerValue || 150;
  const unified = calculateUnifiedMetrics(effectiveConfig, spend, effectiveLtv);

  return {
    spend: unified.spend,
    impressions: unified.impressions,
    clicks: unified.clicks,
    registrations: unified.registrations,
    conversions: unified.ftds,
    cpl: unified.cpl,
    cpa: unified.cpa,
    revenue: unified.revenue,
    roas: unified.roas,
    effectivePrice,
    effectiveCtr,
    effectiveCr: unified.effectiveCr,
    clickToReg: channel.typeConfig.baselineMetrics.clickToReg,
    regToFtd: channel.typeConfig.baselineMetrics.regToFtd,
  };
}

/**
 * Pure function to compute all channel and blended metrics for a media plan.
 * Guarantees single source of truth for spend, CPA, and ROAS.
 */
export function calculatePlanMetrics(
  channels: ChannelData[],
  totalBudget: number,
  multipliers: GlobalMultipliers
): PlanAllocationResult {
  const spendMap = calculateChannelSpends(channels, totalBudget);

  const { cpaTarget, roasTarget } = multipliers || {};

  let totalSpend = 0;
  let totalImpressions = 0;
  let totalClicks = 0;
  let totalRegistrations = 0;
  let totalConversions = 0;
  let totalRevenue = 0;

  const categoryTotals: Record<string, { spend: number; percentage: number }> = {};

  const channelsWithMetrics: ChannelWithMetrics[] = channels.map(channel => {
    const spend = spendMap.get(channel.id) || 0;
    const metrics = calculateSingleChannelMetrics(channel, spend, multipliers);

    // Derived display percentage: strictly equals spend / totalBudget * 100
    const rowPct = totalBudget > 0 ? (metrics.spend / totalBudget) * 100 : 0;

    if (channel.isActive !== false) {
      totalSpend += metrics.spend;
      totalImpressions += metrics.impressions;
      totalClicks += metrics.clicks;
      totalRegistrations += metrics.registrations;
      totalConversions += metrics.conversions;
      totalRevenue += metrics.revenue;

      if (!categoryTotals[channel.category]) {
        categoryTotals[channel.category] = { spend: 0, percentage: 0 };
      }
      categoryTotals[channel.category].spend += metrics.spend;
      categoryTotals[channel.category].percentage += rowPct;
    }

    const aboveCpaTarget = !!(cpaTarget && metrics.cpa && metrics.cpa > cpaTarget);
    const belowRoasTarget = !!(roasTarget && metrics.roas < roasTarget);

    return {
      ...channel,
      allocationPct: rowPct, // Display percentage strictly matches spend / totalBudget
      metrics,
      aboveCpaTarget,
      belowRoasTarget,
    };
  });

  const blendedCpl = totalRegistrations > 0 ? totalSpend / totalRegistrations : null;
  const blendedCpa = totalConversions > 0 ? totalSpend / totalConversions : null;
  const blendedRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

  const totalAllocationPct = totalBudget > 0 ? (totalSpend / totalBudget) * 100 : 0;
  const unallocatedBudget = Math.max(0, totalBudget - totalSpend);
  const overBudgetAmount = Math.max(0, totalSpend - totalBudget);

  const blendedMetrics: BlendedMetrics = {
    totalSpend,
    totalImpressions,
    totalClicks,
    totalRegistrations,
    totalConversions,
    blendedCpl,
    blendedCpa,
    projectedRevenue: totalRevenue,
    blendedRoas,
  };

  return {
    channelsWithMetrics,
    blendedMetrics,
    categoryTotals,
    totalAllocatedSpend: totalSpend,
    totalAllocationPct,
    unallocatedBudget,
    overBudgetAmount,
  };
}

/**
 * Calculates a statistically bounded confidence score (50% - 99%) for arbitrage.
 * Replaces the unbounded linear multiplier that produced >500% confidence.
 */
export function calculateArbitrageConfidence(winnerRoas: number, loserRoas: number): number {
  const roasSpread = Math.max(0, winnerRoas - loserRoas);
  if (roasSpread === 0) return 50;
  // Asymptotic curve approaching 99%
  return Math.min(99, Math.max(50, Math.round(50 + 49 * (1 - Math.exp(-roasSpread / 1.8)))));
}

/**
 * Selects arbitrage winner and loser while strictly preventing saturated channels
 * from being recommended as arbitrage winners.
 */
export function selectArbitrageCandidates(
  channels: any[],
  targetRoas: number = 2.5
): {
  loser: any | null;
  winner: any | null;
  arbitragePossible: boolean;
} {
  const candidates = channels.filter(ch =>
    ch.isActive &&
    !ch.locked &&
    ch.metrics?.spend > 0 &&
    (ch.buyingModel === 'CPM' || ch.buyingModel === 'CPC' || ch.buyingModel === 'CPA')
  );

  if (candidates.length < 2) {
    return { loser: null, winner: null, arbitragePossible: false };
  }

  // Loser: Lowest ROAS among candidates that is below target ROAS
  const sortedByRoasAsc = [...candidates].sort((a, b) => a.metrics.roas - b.metrics.roas);
  const potentialLoser = sortedByRoasAsc[0];

  if (!potentialLoser || potentialLoser.metrics.roas >= targetRoas) {
    return { loser: null, winner: null, arbitragePossible: false };
  }

  // Winner: Highest ROAS candidate that is NOT approaching/exceeding saturation (<80% ceiling)
  // and is not the same as loser
  const eligibleWinners = candidates
    .filter(ch => {
      if (ch.id === potentialLoser.id) return false;
      const ceil = ch.typeConfig?.baselineMetrics?.saturationCeiling || 50000;
      const saturationRatio = ch.metrics.spend / ceil;
      return saturationRatio < 0.8; // Must have headroom to scale
    })
    .sort((a, b) => b.metrics.roas - a.metrics.roas);

  const potentialWinner = eligibleWinners[0] || null;

  if (potentialWinner && potentialWinner.metrics.roas > potentialLoser.metrics.roas) {
    return {
      loser: potentialLoser,
      winner: potentialWinner,
      arbitragePossible: true,
    };
  }

  return { loser: null, winner: null, arbitragePossible: false };
}

/**
 * Calculates lifetime GGR per player applying monthly churn decay over lifespan.
 * Standard iGaming formula: sum(m=0..L-1, monthlyGgr * (1 - churnRate)^m).
 */
export function calculateLifetimeGgrWithChurn(
  monthlyGgr: number,
  churnRatePct: number,
  lifespanMonths: number
): number {
  if (lifespanMonths <= 0 || monthlyGgr <= 0) return 0;
  const retentionRate = Math.max(0, 1 - (churnRatePct / 100));
  let totalDiscountedMonths = 0;
  for (let m = 0; m < lifespanMonths; m++) {
    totalDiscountedMonths += Math.pow(retentionRate, m);
  }
  return monthlyGgr * totalDiscountedMonths;
}

export interface BenchmarkComparisonResult {
  pctDiff: number;
  status: 'no_data' | 'in_line' | 'unrealistic' | 'outperforming' | 'needs_optimization';
  badgeText: string;
  badgeVariant: 'outline' | 'default' | 'secondary' | 'destructive';
  badgeColorClass: string;
}

/**
 * Evaluates a metric against an industry benchmark with tolerance bands and realism bounds.
 */
export function evaluateBenchmarkComparison(
  planVal: number,
  benchVal: number,
  invertColors: boolean = false // true for CPA (lower is better)
): BenchmarkComparisonResult {
  if (planVal <= 0 || benchVal <= 0) {
    return {
      pctDiff: 0,
      status: 'no_data',
      badgeText: 'No plan data',
      badgeVariant: 'outline',
      badgeColorClass: 'text-slate-400 border-slate-800 bg-slate-900/50',
    };
  }

  // Percentage diff:
  // For CPA (invertColors): positive means plan is cheaper than benchmark (better)
  // For ROAS/CTR/CR: positive means plan is higher than benchmark (better)
  const rawDiff = invertColors
    ? ((benchVal - planVal) / benchVal) * 100
    : ((planVal - benchVal) / benchVal) * 100;

  // Realism check: if CPA is >70% lower than benchmark in competitive iGaming verticals, flag it
  if (invertColors && planVal < benchVal * 0.3) {
    return {
      pctDiff: rawDiff,
      status: 'unrealistic',
      badgeText: 'Unrealistic / Verify Data',
      badgeVariant: 'outline',
      badgeColorClass: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
    };
  }

  // Tolerance band: within +-2.5% is "In Line with Benchmark"
  if (Math.abs(rawDiff) <= 2.5) {
    return {
      pctDiff: rawDiff,
      status: 'in_line',
      badgeText: 'In Line (±2%)',
      badgeVariant: 'outline',
      badgeColorClass: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
    };
  }

  if (rawDiff > 0) {
    return {
      pctDiff: rawDiff,
      status: 'outperforming',
      badgeText: 'Outperforming',
      badgeVariant: 'outline',
      badgeColorClass: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5',
    };
  }

  return {
    pctDiff: rawDiff,
    status: 'needs_optimization',
    badgeText: 'Needs Optimization',
    badgeVariant: 'outline',
    badgeColorClass: 'text-red-400 border-red-500/20 bg-red-500/5',
  };
}

