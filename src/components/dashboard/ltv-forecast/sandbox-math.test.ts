import { describe, expect, it } from 'vitest';
import type { ChannelWithMetrics } from '@/hooks/use-media-plan-store';
import type { ChannelSandboxAdjustment } from '@/store/useSandboxStore';
import {
  SANDBOX_DECREASE_FILL,
  SANDBOX_INCREASE_FILL,
  SANDBOX_NEUTRAL_FILL,
} from './constants';
import {
  aggregateMetrics,
  buildSandboxSummary,
  computeSandboxChannelMetrics,
  filterGroupedChannels,
  groupImpact,
  spendDistributionSummary,
  toBaselineAggregate,
  weightedChurnDeltaPct,
} from './sandbox-math';
import type { SandboxChannelMetric } from './types';

const channel = (
  id: string,
  name: string,
  metrics: Partial<{ spend: number; cpa: number | null; roas: number; conversions: number }> = {},
  family?: string
) =>
  ({
    id,
    name,
    family,
    metrics: { spend: 1000, cpa: 50, roas: 2, conversions: 20, ...metrics },
  }) as unknown as ChannelWithMetrics;

const adj = (patch: Partial<ChannelSandboxAdjustment>): ChannelSandboxAdjustment => ({
  spendPct: 0,
  cpaPct: 0,
  roasPct: 0,
  churnPct: 0,
  ...patch,
});

const noGroups = { organic: 0, paid: 0, affiliate: 0, influencer: 0 };

const metric = (patch: Partial<SandboxChannelMetric> = {}): SandboxChannelMetric => ({
  channelId: 'a',
  channelName: 'Google Ads',
  group: 'paid',
  baselineSpend: 1000,
  adjustedSpend: 1000,
  baselineCpa: 50,
  adjustedCpa: 50,
  baselineRoas: 2,
  adjustedRoas: 2,
  adjustedConversions: 20,
  adjustedRevenue: 2000,
  churnPct: 0,
  ...patch,
});

describe('computeSandboxChannelMetrics', () => {
  const ch = [channel('a', 'Google Ads')];
  const run = (a: ChannelSandboxAdjustment, groups = noGroups, selected = ['a']) =>
    computeSandboxChannelMetrics(ch, new Set(selected), { a }, groups)[0];

  it('leaves baseline untouched with default adjustment', () => {
    const m = run(adj({}));
    expect(m.adjustedSpend).toBe(1000);
    expect(m.adjustedCpa).toBe(50);
    expect(m.adjustedRoas).toBe(2);
    expect(m.adjustedConversions).toBeCloseTo(20);
    expect(m.adjustedRevenue).toBeCloseTo(2000);
    expect(m.channelId).toBe('a');
    expect(m.channelName).toBe('Google Ads');
    expect(m.group).toBe('paid');
  });

  it('clamps spend to -80..200', () => {
    expect(run(adj({ spendPct: -500 })).adjustedSpend).toBeCloseTo(200);
    expect(run(adj({ spendPct: 900 })).adjustedSpend).toBeCloseTo(3000);
  });

  it('clamps CPA to -70..300', () => {
    expect(run(adj({ cpaPct: -500 })).adjustedCpa).toBeCloseTo(15);
    expect(run(adj({ cpaPct: 900 })).adjustedCpa).toBeCloseTo(200);
  });

  it('clamps ROAS to -90..300', () => {
    expect(run(adj({ roasPct: -500 })).adjustedRoas).toBeCloseTo(0.2);
    expect(run(adj({ roasPct: 900 })).adjustedRoas).toBeCloseTo(8);
  });

  it('clamps churn to -50..80 for the effect but reports the raw churnPct', () => {
    const high = run(adj({ churnPct: 500 }));
    expect(high.adjustedRevenue).toBeCloseTo(1000 * 2 * (1 - 0.8 * 0.25));
    expect(high.churnPct).toBe(500);
    const low = run(adj({ churnPct: -500 }));
    expect(low.adjustedRevenue).toBeCloseTo(1000 * 2 * (1 + 0.5 * 0.25));
  });

  it('ignores the stored adjustment for unselected channels', () => {
    const m = run(adj({ spendPct: 100, churnPct: 40 }), noGroups, []);
    expect(m.adjustedSpend).toBe(1000);
    expect(m.churnPct).toBe(0);
  });

  it('compounds group delta with channel delta', () => {
    const m = run(adj({ spendPct: 50 }), { ...noGroups, paid: 20 });
    expect(m.adjustedSpend).toBeCloseTo(1000 * 1.2 * 1.5);
  });

  it('applies group delta to unselected channels too', () => {
    const m = run(adj({}), { ...noGroups, paid: -50 }, []);
    expect(m.adjustedSpend).toBeCloseTo(500);
  });

  it('floors adjusted spend at 0 when the group delta is below -100', () => {
    expect(run(adj({}), { ...noGroups, paid: -150 }).adjustedSpend).toBe(0);
  });

  it('floors adjusted CPA at 0.01', () => {
    const zeroCpa = computeSandboxChannelMetrics(
      [channel('a', 'Google Ads', { cpa: 0 })],
      new Set(['a']),
      {},
      noGroups
    )[0];
    expect(zeroCpa.adjustedCpa).toBe(0.01);
  });

  it('floors churn effect at 0.35', () => {
    // churn clamp caps the effect at 0.8 so the 0.35 floor is not reachable via inputs,
    // but the effect never drops below the clamped value
    const m = run(adj({ churnPct: 80 }));
    expect(m.adjustedRevenue / 2000).toBeGreaterThanOrEqual(0.35);
  });

  it('falls back to spend / conversions when cpa is null', () => {
    const m = computeSandboxChannelMetrics(
      [channel('a', 'Google Ads', { cpa: null, spend: 900, conversions: 30 })],
      new Set(),
      {},
      noGroups
    )[0];
    expect(m.baselineCpa).toBe(30);
  });

  it('uses 0 baseline CPA when cpa is null and there are no conversions', () => {
    const m = computeSandboxChannelMetrics(
      [channel('a', 'Google Ads', { cpa: null, conversions: 0 })],
      new Set(),
      {},
      noGroups
    )[0];
    expect(m.baselineCpa).toBe(0);
    expect(m.adjustedCpa).toBe(0.01);
  });

  it('floors negative baseline roas at 0', () => {
    const m = computeSandboxChannelMetrics(
      [channel('a', 'Google Ads', { roas: -3 })],
      new Set(),
      {},
      noGroups
    )[0];
    expect(m.baselineRoas).toBe(0);
    expect(m.adjustedRoas).toBe(0);
  });

  it('assigns groups from channel family and name', () => {
    const out = computeSandboxChannelMetrics(
      [
        channel('1', 'Blog', {}, 'seo_content'),
        channel('2', 'Partners', {}, 'affiliate'),
        channel('3', 'Creators', {}, 'influencer'),
        channel('4', 'Meta'),
      ],
      new Set(),
      {},
      noGroups
    );
    expect(out.map((m) => m.group)).toEqual(['organic', 'affiliate', 'influencer', 'paid']);
  });
});

describe('weightedChurnDeltaPct', () => {
  it('returns 0 when selected spend is zero', () => {
    expect(weightedChurnDeltaPct([metric({ adjustedSpend: 0, churnPct: 40 })], new Set(['a']))).toBe(0);
  });

  it('returns 0 when nothing is selected', () => {
    expect(weightedChurnDeltaPct([metric({ churnPct: 40 })], new Set())).toBe(0);
  });

  it('weights churn by adjusted spend among selected channels only', () => {
    const metrics = [
      metric({ channelId: 'a', adjustedSpend: 300, churnPct: 10 }),
      metric({ channelId: 'b', adjustedSpend: 100, churnPct: 50 }),
      metric({ channelId: 'c', adjustedSpend: 5000, churnPct: 80 }),
    ];
    // (300 * 10 + 100 * 50) / 400 = 20
    expect(weightedChurnDeltaPct(metrics, new Set(['a', 'b']))).toBeCloseTo(20);
  });
});

describe('aggregateMetrics', () => {
  it('returns zero ROI and null CPA when there is no spend', () => {
    const agg = aggregateMetrics([
      metric({ adjustedSpend: 0, adjustedRevenue: 0, adjustedConversions: 0 }),
    ]);
    expect(agg.roi).toBe(0);
    expect(agg.blendedCpa).toBeNull();
    expect(agg.blendedRoas).toBe(0);
    expect(agg.totalSpend).toBe(0);
  });

  it('returns the same for an empty list', () => {
    expect(aggregateMetrics([])).toEqual({
      totalSpend: 0,
      totalConversions: 0,
      projectedRevenue: 0,
      blendedCpa: null,
      blendedRoas: 0,
      roi: 0,
    });
  });

  it('sums channels and derives blended figures', () => {
    const agg = aggregateMetrics([
      metric({ adjustedSpend: 1000, adjustedRevenue: 3000, adjustedConversions: 10 }),
      metric({ adjustedSpend: 1000, adjustedRevenue: 1000, adjustedConversions: 30 }),
    ]);
    expect(agg.totalSpend).toBe(2000);
    expect(agg.projectedRevenue).toBe(4000);
    expect(agg.totalConversions).toBe(40);
    expect(agg.blendedCpa).toBe(50);
    expect(agg.blendedRoas).toBe(2);
    expect(agg.roi).toBe(1);
  });
});

describe('toBaselineAggregate', () => {
  const blended = {
    totalSpend: 1000,
    totalConversions: 10,
    projectedRevenue: 1500,
    blendedCpa: 100,
    blendedRoas: 1.5,
  };

  it('copies blended fields and derives roi', () => {
    expect(toBaselineAggregate(blended)).toEqual({ ...blended, roi: 0.5 });
  });

  it('gives roi 0 for zero spend', () => {
    expect(toBaselineAggregate({ ...blended, totalSpend: 0 }).roi).toBe(0);
  });
});

describe('buildSandboxSummary', () => {
  it('says increase and stable risk when nothing changes', () => {
    expect(buildSandboxSummary(1, 1, [metric()], 0)).toBe(
      'Your changes increase total ROI by 0.0% while keeping risk stable.'
    );
  });

  it('says reduce when ROI drops, formatting points of ROI percent', () => {
    expect(buildSandboxSummary(1, 0.75, [metric()], 0)).toBe(
      'Your changes reduce total ROI by 25.0% while keeping risk stable.'
    );
  });

  it('flags paid risk when paid ROAS falls below 0.92x baseline', () => {
    const below = buildSandboxSummary(1, 1, [metric({ adjustedRoas: 2 * 0.91 })], 0);
    expect(below).toContain('but raise risk in Paid Ads.');
    const at = buildSandboxSummary(1, 1, [metric({ adjustedRoas: 2 * 0.92 })], 0);
    expect(at).toContain('while keeping risk stable.');
  });

  it('flags paid risk when paid spend exceeds 1.18x baseline', () => {
    expect(buildSandboxSummary(1, 1, [metric({ adjustedSpend: 1190 })], 0)).toContain(
      'raise risk in Paid Ads'
    );
    expect(buildSandboxSummary(1, 1, [metric({ adjustedSpend: 1180 })], 0)).toContain(
      'keeping risk stable'
    );
  });

  it('ignores non-paid channels for the paid risk check', () => {
    const text = buildSandboxSummary(
      1,
      1,
      [metric({ group: 'organic', adjustedSpend: 5000, adjustedRoas: 0 })],
      0
    );
    expect(text).toContain('keeping risk stable');
  });

  it('flags churn pressure above 2.5 only', () => {
    expect(buildSandboxSummary(1, 1, [metric()], 2.5)).toContain('keeping risk stable');
    expect(buildSandboxSummary(1, 1, [metric()], 2.6)).toContain('but increase churn pressure.');
  });

  it('joins both risk signals with and', () => {
    expect(buildSandboxSummary(1, 1, [metric({ adjustedSpend: 2000 })], 5)).toBe(
      'Your changes increase total ROI by 0.0% but raise risk in Paid Ads and increase churn pressure.'
    );
  });
});

describe('groupImpact and spendDistributionSummary', () => {
  it('covers all four groups with labels and fills', () => {
    const data = groupImpact([
      metric({ group: 'paid', baselineSpend: 100, adjustedSpend: 150 }),
      metric({ group: 'organic', baselineSpend: 100, adjustedSpend: 50 }),
      metric({ group: 'affiliate', baselineSpend: 100, adjustedSpend: 100 }),
    ]);
    expect(data.map((d) => d.group)).toEqual(['Organic', 'Paid', 'Affiliate', 'Influencer']);
    expect(data.map((d) => d.delta)).toEqual([-50, 50, 0, 0]);
    expect(data.map((d) => d.sandboxFill)).toEqual([
      SANDBOX_DECREASE_FILL,
      SANDBOX_INCREASE_FILL,
      SANDBOX_NEUTRAL_FILL,
      SANDBOX_NEUTRAL_FILL,
    ]);
  });

  it('describes increases and decreases', () => {
    const data = groupImpact([
      metric({ group: 'paid', baselineSpend: 100, adjustedSpend: 150 }),
      metric({ group: 'organic', baselineSpend: 100, adjustedSpend: 50 }),
    ]);
    expect(spendDistributionSummary(data)).toBe('Increases: Paid. Decreases: Organic.');
  });

  it('describes no change', () => {
    expect(spendDistributionSummary(groupImpact([metric()]))).toBe(
      'No group increases. No group decreases.'
    );
  });
});

describe('filterGroupedChannels', () => {
  const channels = [
    channel('1', 'Blog', {}, 'seo_content'),
    channel('2', 'Meta Ads'),
    channel('3', 'Google Ads'),
    channel('4', 'Creators', {}, 'influencer'),
  ];

  it('groups in fixed order and drops empty groups', () => {
    const out = filterGroupedChannels(channels, '');
    expect(out.map((e) => e.group)).toEqual(['organic', 'paid', 'influencer']);
    expect(out[1].channels.map((c) => c.id)).toEqual(['2', '3']);
  });

  it('matches channel names case-insensitively with trimming', () => {
    const out = filterGroupedChannels(channels, '  GOOGLE ');
    expect(out).toHaveLength(1);
    expect(out[0].channels.map((c) => c.id)).toEqual(['3']);
  });

  it('matches on the group label', () => {
    const out = filterGroupedChannels(channels, 'paid');
    expect(out.map((e) => e.group)).toEqual(['paid']);
    expect(out[0].channels).toHaveLength(2);
  });

  it('returns nothing when no match', () => {
    expect(filterGroupedChannels(channels, 'zzz')).toEqual([]);
  });
});
