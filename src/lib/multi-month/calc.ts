import {
  calculateIgamingRevenueSeries,
  normalizeIgamingRevenueInputs,
} from '@/lib/igaming-revenue-model';
import type { ChannelWithMetrics } from '@/lib/media-plan/types';
import { DEFAULT_CHANNELS } from './defaults';
import type {
  ChannelMonthConfig,
  GlobalPlanSettings,
  MonthData,
  ProgressionPattern,
} from './types';

// ========== PROGRESSION FORMULAS ==========

export function calculateDistribution(
  pattern: ProgressionPattern,
  totalBudget: number,
  months: number,
  params: Record<string, number> = {}
): number[] {
  if (months <= 0) return [];
  if (months === 1) return [totalBudget];

  const weights: number[] = [];
  const growthRate = params.growthRate ?? 10; // Default 10% per step

  for (let i = 0; i < months; i++) {
    switch (pattern) {
      case 'linear':
        weights.push(1);
        break;
      case 'exponential':
        // Start low, grow by rate
        weights.push(Math.pow(1 + growthRate / 100, i));
        break;
      case 'u-shaped': {
        // y = a(x-h)^2 + k
        // High at ends, low in middle
        const mid = (months - 1) / 2;
        const x = (i - mid) / mid; // -1 to 1
        weights.push(Math.pow(x, 2) + 0.5); // +0.5 to keep center non-zero
        break;
      }
      case 'inverse-u': {
        // High in middle, low at ends
        const mid = (months - 1) / 2;
        const x = (i - mid) / mid; // -1 to 1
        weights.push(1 - Math.pow(x, 2) + 0.1);
        break;
      }
      case 'seasonal': {
        // Simple sine wave simulation + baseline
        // Peak at index 1 and 7? Just generic seasonality
        const x = (i / months) * Math.PI * 2; // 0 to 2PI
        weights.push(Math.sin(x) + 1.5); // Ensure positive
        break;
      }
      case 'step': {
        // Step up every 3 months
        const step = Math.floor(i / 3);
        weights.push(1 + step * 0.5);
        break;
      }
      case 'aggressive-launch': {
        // High start, then decay
        // 1 / (1 + i) decay
        weights.push(10 / (2 + i));
        break;
      }
      case 'flat':
      default:
        weights.push(1);
    }
  }

  // Normalize and distribute
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let distributedTotal = 0;

  const budgets = weights.map((w) => {
    const amount = Math.floor((w / totalWeight) * totalBudget);
    distributedTotal += amount;
    return amount;
  });

  // Distribute remainder to avoid rounding errors
  let remainder = totalBudget - distributedTotal;
  let i = 0;
  while (remainder > 0) {
    budgets[i % months]++;
    remainder--;
    i++;
  }

  return budgets;
}

// ========== MONTH GENERATION ==========

export function generateMonthLabel(startDate: Date, monthOffset: number, isSoftLaunch: boolean): string {
  const date = new Date(startDate);
  date.setMonth(date.getMonth() + monthOffset);
  const formatter = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
  return isSoftLaunch ? `${formatter.format(date)} (Soft Launch)` : formatter.format(date);
}

/** "YYYY-MM" in local time (toISOString would shift to the previous month east of UTC). */
export function toMonthValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Month channels mirror the main plan: each channel's share and unit economics are read from
 * the engine snapshot, so month totals reproduce the dashboard's numbers at the same budget.
 */
export function channelsFromPlanSnapshot(channels: ChannelWithMetrics[]): ChannelMonthConfig[] {
  const live = channels.filter((c) => c.isActive !== false && c.metrics.spend > 0);
  const totalSpend = live.reduce((sum, c) => sum + c.metrics.spend, 0);
  if (live.length === 0 || totalSpend <= 0) return JSON.parse(JSON.stringify(DEFAULT_CHANNELS));

  return live.map((c) => {
    const m = c.metrics;
    const hasImpressions = m.impressions > 0;
    const ctr = hasImpressions ? (m.clicks / m.impressions) * 100 : 1;
    return {
      channelId: c.id,
      name: c.name,
      category: c.category,
      allocationPct: (m.spend / totalSpend) * 100,
      cpm: hasImpressions ? (m.spend / m.impressions) * 1000 : 0,
      ctr,
      cr: m.clicks > 0 ? (m.conversions / m.clicks) * 100 : 0,
      roas: m.spend > 0 ? m.revenue / m.spend : 0,
      // Fixed-fee channels deliver a set volume regardless of the month's budget.
      impressionMode: hasImpressions ? 'CPM' : 'FIXED',
      fixedImpressions: hasImpressions ? 0 : m.clicks / (ctr / 100),
      locked: c.locked,
      family: c.family,
      buyingModel: c.buyingModel,
      typeConfig: c.typeConfig,
    };
  });
}

export function createMonth(
  index: number,
  startDate: Date,
  isSoftLaunch: boolean,
  budget: number,
  baseChannels: ChannelMonthConfig[]
): MonthData {
  return {
    id: `month-${index}`,
    label: generateMonthLabel(startDate, index, isSoftLaunch),
    monthIndex: index,
    isSoftLaunch,
    budget,
    budgetMultiplier: 1.0,
    budgetLocked: false,
    spendMultiplier: null,
    cpmOverride: null,
    ctrBump: null,
    channels: JSON.parse(JSON.stringify(baseChannels)),
    useGlobalChannels: true,
  };
}

// ========== METRICS CALCULATION ==========

export function calculateMonthMetrics(
  month: MonthData,
  globalSettings: GlobalPlanSettings
): {
  totalSpend: number;
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
  revenue: number;
  avgCpa: number | null;
  avgRoas: number;
} {
  const spendMultiplier = month.spendMultiplier ?? globalSettings.spendMultiplier;
  const actualBudget = month.budget * month.budgetMultiplier * spendMultiplier;

  let totalSpend = 0;
  let totalImpressions = 0;
  let totalClicks = 0;
  let totalConversions = 0;
  let totalRevenue = 0;

  month.channels.forEach((ch) => {
    const spend = (ch.allocationPct / 100) * actualBudget;
    const cpm = ch.cpm;
    const ctr = ch.ctr + (month.ctrBump ?? globalSettings.ctrBump);

    let impressions: number;
    if (ch.impressionMode === 'FIXED') {
      impressions = ch.fixedImpressions;
    } else {
      impressions = cpm > 0 ? (spend / cpm) * 1000 : 0;
    }

    const clicks = impressions * (Math.max(0.01, ctr) / 100);
    const conversions = clicks * (ch.cr / 100);
    const revenue = spend * ch.roas;

    totalSpend += spend;
    totalImpressions += impressions;
    totalClicks += clicks;
    totalConversions += conversions;
    totalRevenue += revenue;
  });

  return {
    totalSpend,
    totalImpressions,
    totalClicks,
    totalConversions,
    revenue: totalRevenue,
    avgCpa: totalConversions > 0 ? totalSpend / totalConversions : null,
    avgRoas: totalSpend > 0 ? totalRevenue / totalSpend : 0,
  };
}

export function calculatePlanMetrics(
  months: MonthData[],
  globalSettings: GlobalPlanSettings,
  revenueModel?: {
    playerValue: number;
    retentionRate: number;
    regToFtdCvr: number;
    turnoverRate: number;
    margin: number;
    bonusRate: number;
  }
): {
  months: MonthData[];
  totals: {
    totalAllocatedBudget: number;
    totalSpend: number;
    totalConversions: number;
    totalRevenue: number;
    totalNgr: number;
    totalGrossContribution: number;
    operatingCosts: number;
    netProfit: number;
    avgMonthlyBudget: number;
    avgCpa: number | null;
    avgRoas: number;
    breakEvenMonth: number | null;
    endingCumulativeProfit: number;
  };
} {
  const baseMonths = months.map((month) => {
    const metrics = calculateMonthMetrics(month, globalSettings);
    return {
      ...month,
      totalSpend: metrics.totalSpend,
      totalConversions: metrics.totalConversions,
      revenue: metrics.revenue,
    };
  });

  const waterfallSeries = revenueModel
    ? calculateIgamingRevenueSeries(
        baseMonths.map((month) => ({
          ftds: month.totalConversions || 0,
          marketingCost: month.totalSpend || 0,
        })),
        normalizeIgamingRevenueInputs(revenueModel, revenueModel.playerValue)
      )
    : [];

  let cumulativeProfit = 0;
  let breakEvenMonth: number | null = null;

  const enrichedMonths = baseMonths.map((month, idx) => {
    const waterfall = waterfallSeries[idx];
    // iGaming P/L is earned on NGR (after bonuses); other industries use channel revenue.
    const netRevenue = waterfall ? waterfall.ngr : month.revenue;
    const operatingCosts = netRevenue * 0.15; // 15% operating costs
    const netProfit = netRevenue - month.totalSpend - operatingCosts;
    cumulativeProfit += netProfit;

    if (breakEvenMonth === null && cumulativeProfit >= 0) {
      breakEvenMonth = idx;
    }

    return {
      ...month,
      operatingCosts,
      netProfit,
      cumulativeProfit,
      registrations: waterfall?.registrations,
      activePlayers: waterfall?.activePlayers,
      ggr: waterfall?.ggr,
      bonus: waterfall?.bonus,
      ngr: waterfall?.ngr,
      grossContribution: waterfall?.grossContribution,
    };
  });

  const totalAllocatedBudget = enrichedMonths.reduce((sum, m) => sum + (m.budget || 0), 0);
  const totalSpend = enrichedMonths.reduce((sum, m) => sum + (m.totalSpend || 0), 0);
  const totalConversions = enrichedMonths.reduce((sum, m) => sum + (m.totalConversions || 0), 0);
  const totalRevenue = enrichedMonths.reduce((sum, m) => sum + (m.revenue || 0), 0);
  const totalNgr = enrichedMonths.reduce((sum, m) => sum + (m.ngr || 0), 0);
  const totalGrossContribution = enrichedMonths.reduce(
    (sum, m) => sum + (m.grossContribution || 0),
    0
  );
  const totalOperatingCosts = enrichedMonths.reduce((sum, m) => sum + (m.operatingCosts || 0), 0);
  const endingCumulativeProfit =
    enrichedMonths.length > 0 ? enrichedMonths[enrichedMonths.length - 1].cumulativeProfit : 0;

  return {
    months: enrichedMonths,
    totals: {
      totalAllocatedBudget,
      totalSpend,
      totalConversions,
      totalRevenue,
      totalNgr,
      totalGrossContribution,
      operatingCosts: totalOperatingCosts,
      netProfit: enrichedMonths.reduce((sum, m) => sum + m.netProfit, 0),
      avgMonthlyBudget:
        enrichedMonths.length > 0 ? totalAllocatedBudget / enrichedMonths.length : 0, // Keeping for backward compat if needed
      avgCpa: totalConversions > 0 ? totalSpend / totalConversions : null,
      avgRoas: totalSpend > 0 ? totalRevenue / totalSpend : 0,
      breakEvenMonth,
      endingCumulativeProfit,
    },
  };
}
