import { getChannelGroup, GROUP_LABELS, type ChannelGroup } from '@/lib/planning-insights';
import type { ChannelWithMetrics } from '@/hooks/use-media-plan-store';
import type { ChannelSandboxAdjustment } from '@/store/useSandboxStore';
import { computeSandboxChannel } from '@/components/dashboard/ltv-sandbox-calc';
import {
  CHANNEL_GROUPS,
  SANDBOX_DECREASE_FILL,
  SANDBOX_DEFAULT_ADJUSTMENT,
  SANDBOX_INCREASE_FILL,
  SANDBOX_NEUTRAL_FILL,
} from './constants';
import type { AggregateMetrics, SandboxChannelMetric } from './types';

export function toBaselineAggregate(blended: {
  totalSpend: number;
  totalConversions: number;
  projectedRevenue: number;
  blendedCpa: number | null;
  blendedRoas: number;
}): AggregateMetrics {
  return {
    totalSpend: blended.totalSpend,
    totalConversions: blended.totalConversions,
    projectedRevenue: blended.projectedRevenue,
    blendedCpa: blended.blendedCpa,
    blendedRoas: blended.blendedRoas,
    roi:
      blended.totalSpend > 0
        ? (blended.projectedRevenue - blended.totalSpend) / blended.totalSpend
        : 0,
  };
}

export function computeSandboxChannelMetrics(
  channels: ChannelWithMetrics[],
  selectedSet: Set<string>,
  channelAdjustments: Record<string, ChannelSandboxAdjustment>,
  groupAdjustments: Record<ChannelGroup, number>
): SandboxChannelMetric[] {
  return channels.map((channel) => {
    const group = getChannelGroup(channel);
    const groupDelta = groupAdjustments[group] ?? 0;
    const adjustment = selectedSet.has(channel.id)
      ? (channelAdjustments[channel.id] ?? SANDBOX_DEFAULT_ADJUSTMENT)
      : SANDBOX_DEFAULT_ADJUSTMENT;

    const {
      adjustedSpend,
      baselineCpa,
      adjustedCpa,
      baselineRoas,
      adjustedRoas,
      adjustedConversions,
      adjustedRevenue,
    } = computeSandboxChannel(channel.metrics, adjustment, groupDelta);

    return {
      channelId: channel.id,
      channelName: channel.name,
      group,
      baselineSpend: channel.metrics.spend,
      adjustedSpend,
      baselineCpa,
      adjustedCpa,
      baselineRoas,
      adjustedRoas,
      adjustedConversions,
      adjustedRevenue,
      churnPct: adjustment.churnPct,
    };
  });
}

export function weightedChurnDeltaPct(
  sandboxChannelMetrics: SandboxChannelMetric[],
  selectedSet: Set<string>
): number {
  const activeChannels = sandboxChannelMetrics.filter((channel) =>
    selectedSet.has(channel.channelId)
  );
  const totalSelectedSpend = activeChannels.reduce(
    (sum, channel) => sum + channel.adjustedSpend,
    0
  );

  if (totalSelectedSpend <= 0) {
    return 0;
  }

  return activeChannels.reduce(
    (sum, channel) => sum + (channel.adjustedSpend / totalSelectedSpend) * channel.churnPct,
    0
  );
}

export function aggregateMetrics(sandboxChannelMetrics: SandboxChannelMetric[]): AggregateMetrics {
  const totals = sandboxChannelMetrics.reduce(
    (acc, channel) => {
      acc.spend += channel.adjustedSpend;
      acc.revenue += channel.adjustedRevenue;
      acc.conversions += channel.adjustedConversions;
      return acc;
    },
    { spend: 0, revenue: 0, conversions: 0 }
  );

  const blendedCpa = totals.conversions > 0 ? totals.spend / totals.conversions : null;
  const blendedRoas = totals.spend > 0 ? totals.revenue / totals.spend : 0;

  return {
    totalSpend: totals.spend,
    totalConversions: totals.conversions,
    projectedRevenue: totals.revenue,
    blendedCpa,
    blendedRoas,
    roi: totals.spend > 0 ? (totals.revenue - totals.spend) / totals.spend : 0,
  };
}

export function buildSandboxSummary(
  baselineRoi: number,
  sandboxRoi: number,
  sandboxChannelMetrics: SandboxChannelMetric[],
  weightedSandboxChurnDeltaPct: number
): string {
  const baselineRoiPct = baselineRoi * 100;
  const sandboxRoiPct = sandboxRoi * 100;
  const roiDeltaPct = sandboxRoiPct - baselineRoiPct;

  const paidChannels = sandboxChannelMetrics.filter((item) => item.group === 'paid');
  const paidBaselineSpend = paidChannels.reduce((sum, item) => sum + item.baselineSpend, 0);
  const paidSandboxSpend = paidChannels.reduce((sum, item) => sum + item.adjustedSpend, 0);

  const paidBaselineRoas =
    paidBaselineSpend > 0
      ? paidChannels.reduce((sum, item) => sum + item.baselineRoas * item.baselineSpend, 0) /
        paidBaselineSpend
      : 0;
  const paidSandboxRoas =
    paidSandboxSpend > 0
      ? paidChannels.reduce((sum, item) => sum + item.adjustedRoas * item.adjustedSpend, 0) /
        paidSandboxSpend
      : 0;

  const paidRiskRaised =
    paidSandboxRoas < paidBaselineRoas * 0.92 ||
    (paidBaselineSpend > 0 && paidSandboxSpend > paidBaselineSpend * 1.18);

  const direction = roiDeltaPct >= 0 ? 'increase' : 'reduce';
  const riskSignals = [
    paidRiskRaised ? 'raise risk in Paid Ads' : null,
    weightedSandboxChurnDeltaPct > 2.5 ? 'increase churn pressure' : null,
  ].filter(Boolean);

  const riskText =
    riskSignals.length > 0 ? `but ${riskSignals.join(' and ')}.` : 'while keeping risk stable.';

  return `Your changes ${direction} total ROI by ${Math.abs(roiDeltaPct).toFixed(1)}% ${riskText}`;
}

export function groupImpact(sandboxChannelMetrics: SandboxChannelMetric[]) {
  return CHANNEL_GROUPS.map((group) => {
    const groupChannels = sandboxChannelMetrics.filter((channel) => channel.group === group);
    const baselineSpend = groupChannels.reduce((sum, item) => sum + item.baselineSpend, 0);
    const sandboxSpend = groupChannels.reduce((sum, item) => sum + item.adjustedSpend, 0);
    const delta = sandboxSpend - baselineSpend;

    return {
      group: GROUP_LABELS[group],
      baselineSpend,
      sandboxSpend,
      delta,
      sandboxFill:
        delta > 0
          ? SANDBOX_INCREASE_FILL
          : delta < 0
            ? SANDBOX_DECREASE_FILL
            : SANDBOX_NEUTRAL_FILL,
    };
  });
}

export function spendDistributionSummary(groupImpactData: ReturnType<typeof groupImpact>): string {
  const increases = groupImpactData.filter((item) => item.delta > 0).map((item) => item.group);
  const decreases = groupImpactData.filter((item) => item.delta < 0).map((item) => item.group);

  const increaseText =
    increases.length > 0 ? `Increases: ${increases.join(', ')}.` : 'No group increases.';
  const decreaseText =
    decreases.length > 0 ? `Decreases: ${decreases.join(', ')}.` : 'No group decreases.';

  return `${increaseText} ${decreaseText}`;
}

export function filterGroupedChannels(channels: ChannelWithMetrics[], channelFilter: string) {
  const normalizedFilter = channelFilter.trim().toLowerCase();

  return CHANNEL_GROUPS.map((group) => ({
    group,
    channels: channels.filter((channel) => {
      const matchesGroup = getChannelGroup(channel) === group;
      const matchesFilter =
        normalizedFilter.length === 0 ||
        channel.name.toLowerCase().includes(normalizedFilter) ||
        GROUP_LABELS[group].toLowerCase().includes(normalizedFilter);

      return matchesGroup && matchesFilter;
    }),
  })).filter((entry) => entry.channels.length > 0);
}
