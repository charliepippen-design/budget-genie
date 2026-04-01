import type { ChannelWithMetrics } from '@/hooks/use-media-plan-store';

export type ChannelGroup = 'organic' | 'paid' | 'affiliate' | 'influencer';

export interface StressAssumptions {
  churnRate: number;
  cpaMultiplier: number;
  roasMultiplier: number;
}

export interface ScenarioEnvelopePoint {
  scenario: 'Bear' | 'Base' | 'Bull';
  projectedLtvPerUser: number;
  projectedCohortValue: number;
  ltvToCac: number;
}

export interface EfficiencyAlert {
  channelId: string;
  channelName: string;
  reason: string;
  severity: 'high' | 'medium';
}

export interface MetricIntegrityIssue {
  channelId: string;
  channelName: string;
  issue: string;
}

export interface BudgetUtilizationPoint {
  group: ChannelGroup;
  label: string;
  spend: number;
  utilizationPct: number;
  status: 'overspend' | 'underfunded' | 'balanced';
}

export const GROUP_LABELS: Record<ChannelGroup, string> = {
  organic: 'Organic',
  paid: 'Paid',
  affiliate: 'Affiliate',
  influencer: 'Influencer',
};

export const GROUP_COLORS: Record<ChannelGroup, string> = {
  organic: '#22c55e',
  paid: '#3b82f6',
  affiliate: '#f59e0b',
  influencer: '#ec4899',
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function getChannelGroup(
  channel: Pick<ChannelWithMetrics, 'family' | 'name'>
): ChannelGroup {
  if (channel.family === 'seo_content') return 'organic';
  if (channel.family === 'affiliate') return 'affiliate';
  if (channel.family === 'influencer') return 'influencer';

  const lower = channel.name.toLowerCase();
  if (lower.includes('seo') || lower.includes('content')) return 'organic';
  if (lower.includes('affiliate')) return 'affiliate';
  if (lower.includes('influencer')) return 'influencer';

  return 'paid';
}

export function buildGroupSpendTotals(
  channels: ChannelWithMetrics[]
): Record<ChannelGroup, number> {
  const totals: Record<ChannelGroup, number> = {
    organic: 0,
    paid: 0,
    affiliate: 0,
    influencer: 0,
  };

  channels.forEach((channel) => {
    const key = getChannelGroup(channel);
    totals[key] += channel.metrics.spend;
  });

  return totals;
}

export function buildBudgetUtilization(
  channels: ChannelWithMetrics[],
  totalBudget: number
): BudgetUtilizationPoint[] {
  const totals = buildGroupSpendTotals(channels);
  const safeBudget = totalBudget > 0 ? totalBudget : 1;

  return (Object.keys(totals) as ChannelGroup[]).map((group) => {
    const spend = totals[group];
    const utilizationPct = (spend / safeBudget) * 100;
    const status =
      utilizationPct > 35 ? 'overspend' : utilizationPct < 15 ? 'underfunded' : 'balanced';

    return {
      group,
      label: GROUP_LABELS[group],
      spend,
      utilizationPct,
      status,
    };
  });
}

export function buildChannelStackData(channels: ChannelWithMetrics[]) {
  const row: Record<string, number | string> = { name: 'Spend Mix' };

  channels.forEach((channel) => {
    row[channel.name] = channel.metrics.spend;
  });

  return [row];
}

export function buildRoasTrendData(
  channels: ChannelWithMetrics[],
  assumptions: StressAssumptions,
  months = 6
): Array<Record<string, number | string>> {
  const grouped = (Object.keys(GROUP_LABELS) as ChannelGroup[]).reduce(
    (acc, group) => {
      acc[group] = channels.filter((channel) => getChannelGroup(channel) === group);
      return acc;
    },
    {} as Record<ChannelGroup, ChannelWithMetrics[]>
  );

  return Array.from({ length: months }, (_, index) => {
    const month = index + 1;
    const point: Record<string, number | string> = { month: `M${month}` };

    (Object.keys(grouped) as ChannelGroup[]).forEach((group) => {
      const channelsInGroup = grouped[group];
      const spendWeight = channelsInGroup.reduce((sum, channel) => sum + channel.metrics.spend, 0);

      const weightedRoas = channelsInGroup.reduce((sum, channel) => {
        const baseRoas = channel.metrics.roas;
        const retentionDrag = clamp(1 - assumptions.churnRate * 0.45 * index, 0.4, 1);
        const stressedRoas =
          baseRoas * assumptions.roasMultiplier * (1 / assumptions.cpaMultiplier) * retentionDrag;
        return sum + stressedRoas * channel.metrics.spend;
      }, 0);

      point[GROUP_LABELS[group]] = spendWeight > 0 ? weightedRoas / spendWeight : 0;
    });

    return point;
  });
}

export function buildScenarioEnvelope(input: {
  baseLtvPerUser: number;
  conversions: number;
  cpa: number;
  assumptions: StressAssumptions;
}): ScenarioEnvelopePoint[] {
  const { baseLtvPerUser, conversions, cpa, assumptions } = input;

  const retentionFactor = clamp(1 - (assumptions.churnRate - 0.04) * 2.5, 0.6, 1.2);
  const baseLtv = baseLtvPerUser * assumptions.roasMultiplier * retentionFactor;
  const stressedCpa = cpa * assumptions.cpaMultiplier;

  const scenarios: Array<{ scenario: 'Bear' | 'Base' | 'Bull'; lift: number }> = [
    { scenario: 'Bear', lift: 0.85 },
    { scenario: 'Base', lift: 1 },
    { scenario: 'Bull', lift: 1.15 },
  ];

  return scenarios.map(({ scenario, lift }) => {
    const projectedLtvPerUser = baseLtv * lift;
    const projectedCohortValue = projectedLtvPerUser * conversions;

    return {
      scenario,
      projectedLtvPerUser,
      projectedCohortValue,
      ltvToCac: stressedCpa > 0 ? projectedLtvPerUser / stressedCpa : 0,
    };
  });
}

export function getMetricIntegrityIssues(channels: ChannelWithMetrics[]): MetricIntegrityIssue[] {
  const issues: MetricIntegrityIssue[] = [];

  channels.forEach((channel) => {
    const baselineCtr = channel.typeConfig.baselineMetrics.ctr ?? 0;

    if (baselineCtr > 0 && channel.metrics.impressions <= 0) {
      issues.push({
        channelId: channel.id,
        channelName: channel.name,
        issue: 'CTR is configured but impressions are missing.',
      });
    }

    if (channel.metrics.clicks > 0 && channel.metrics.impressions <= 0) {
      issues.push({
        channelId: channel.id,
        channelName: channel.name,
        issue: 'Clicks exist without impression volume.',
      });
    }

    if (channel.metrics.conversions > 0 && channel.metrics.clicks <= 0) {
      issues.push({
        channelId: channel.id,
        channelName: channel.name,
        issue: 'Conversions exist without tracked clicks.',
      });
    }
  });

  return issues;
}

export function getEfficiencyAlerts(channels: ChannelWithMetrics[]): EfficiencyAlert[] {
  const avgSpend =
    channels.length > 0
      ? channels.reduce((sum, channel) => sum + channel.metrics.spend, 0) / channels.length
      : 0;

  const alerts: EfficiencyAlert[] = [];

  channels.forEach((channel) => {
    const ceiling = channel.typeConfig.baselineMetrics.saturationCeiling;

    if (ceiling && channel.metrics.spend > ceiling * 0.9) {
      alerts.push({
        channelId: channel.id,
        channelName: channel.name,
        reason: 'Approaching saturation ceiling and likely facing diminishing returns.',
        severity: 'high',
      });
    }

    if (channel.metrics.roas < 1 && channel.metrics.spend >= avgSpend) {
      alerts.push({
        channelId: channel.id,
        channelName: channel.name,
        reason: 'Low ROAS at above-average spend indicates inefficient allocation.',
        severity: 'medium',
      });
    }
  });

  return alerts;
}
