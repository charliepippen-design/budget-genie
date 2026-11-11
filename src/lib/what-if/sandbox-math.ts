import { getChannelGroup, GROUP_LABELS, type ChannelGroup } from '@/lib/planning-insights';
import type { ChannelWithMetrics } from '@/lib/media-plan/types';
import { CHANNEL_GROUPS, SANDBOX_DEFAULT_ADJUSTMENT } from './constants';
import { computeSandboxChannel } from './sandbox-channel';
import type {
  AggregateMetrics,
  ChannelSandboxAdjustment,
  SandboxChannelMetric,
  SandboxGroupImpact,
  SandboxSummarySignals,
} from './types';

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

/** The numbers behind the sandbox summary: ROI change and the two risk flags. */
export function sandboxSummarySignals(
  baselineRoi: number,
  sandboxRoi: number,
  sandboxChannelMetrics: SandboxChannelMetric[],
  weightedSandboxChurnDeltaPct: number
): SandboxSummarySignals {
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

  return { roiDeltaPct, paidRiskRaised, churnPressure: weightedSandboxChurnDeltaPct > 2.5 };
}

/** Wording only: turns the summary signals into the sentence shown in the lab and exports. */
export function formatSandboxSummary(signals: SandboxSummarySignals): string {
  const direction = signals.roiDeltaPct >= 0 ? 'increase' : 'reduce';
  const riskSignals = [
    signals.paidRiskRaised ? 'raise risk in Paid Ads' : null,
    signals.churnPressure ? 'increase churn pressure' : null,
  ].filter(Boolean);

  const riskText =
    riskSignals.length > 0 ? `but ${riskSignals.join(' and ')}.` : 'while keeping risk stable.';

  return `Your changes ${direction} total ROI by ${Math.abs(signals.roiDeltaPct).toFixed(1)}% ${riskText}`;
}

export function buildSandboxSummary(
  baselineRoi: number,
  sandboxRoi: number,
  sandboxChannelMetrics: SandboxChannelMetric[],
  weightedSandboxChurnDeltaPct: number
): string {
  return formatSandboxSummary(
    sandboxSummarySignals(baselineRoi, sandboxRoi, sandboxChannelMetrics, weightedSandboxChurnDeltaPct)
  );
}

export function groupSpendImpact(sandboxChannelMetrics: SandboxChannelMetric[]): SandboxGroupImpact[] {
  return CHANNEL_GROUPS.map((group) => {
    const groupChannels = sandboxChannelMetrics.filter((channel) => channel.group === group);
    const baselineSpend = groupChannels.reduce((sum, item) => sum + item.baselineSpend, 0);
    const sandboxSpend = groupChannels.reduce((sum, item) => sum + item.adjustedSpend, 0);

    return { group, baselineSpend, sandboxSpend, delta: sandboxSpend - baselineSpend };
  });
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
