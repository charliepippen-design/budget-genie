import { describe, expect, it } from 'vitest';
import { computeArbitrage } from '@/lib/insights/arbitrage';
import { computePlanSnapshot, type ChannelData, type PlanInputs } from '@/hooks/use-media-plan-store';
import type { BuyingModel } from '@/types/channel';

function ch(
  id: string,
  buyingModel: BuyingModel,
  allocationPct: number,
  baseline: ChannelData['typeConfig']['baselineMetrics'],
  price: number,
  extra: Partial<ChannelData> = {}
): ChannelData {
  return {
    id,
    name: id,
    category: 'Paid Search',
    allocationPct,
    family: 'paid_media',
    buyingModel,
    typeConfig: { family: 'paid_media', buyingModel, price, baselineMetrics: baseline },
    tier: buyingModel === 'FLAT_FEE' || buyingModel === 'RETAINER' ? 'fixed' : 'scalable',
    maxSpendLimit: 0,
    locked: false,
    isActive: true,
    ...extra,
  };
}

const good = (extra: Partial<ChannelData> = {}, ceiling = 0) =>
  ch('good', 'CPC', 40, { ctr: 4, conversionRate: 10, ...(ceiling ? { saturationCeiling: ceiling } : {}) }, 1, extra);
const bad = (extra: Partial<ChannelData> = {}) =>
  ch('bad', 'CPM', 60, { ctr: 0.1, conversionRate: 1 }, 20, extra);

function plan(channels: ChannelData[]): PlanInputs {
  return {
    totalBudget: 100000,
    channels,
    globalMultipliers: {
      spendMultiplier: 1,
      defaultCpmOverride: null,
      ctrBump: 0,
      cpaTarget: null,
      roasTarget: null,
      playerValue: 150,
      retentionRate: 0.3,
      regToFtdCvr: 0.3,
      turnoverRate: 5,
      margin: 0.05,
      bonusRate: 0.3,
    },
    activeTiers: { tier1: 100, tier2: 0, tier3: 0 } as PlanInputs['activeTiers'],
    activeGeos: [],
    geoOverrides: {},
  };
}

describe('computeArbitrage', () => {
  it('reports the modelled plan revenue delta, not the ROAS ratio', () => {
    const input = plan([good(), bad()]);
    const snap = computePlanSnapshot(input);
    const g = snap.channels.find((c) => c.id === 'good')!;
    const b = snap.channels.find((c) => c.id === 'bad')!;
    const ratio = g.metrics.roas / b.metrics.roas;
    expect(ratio).toBeGreaterThan(5);

    // What the old card rendered: the ratio of the two ROAS values as a "gain".
    const oldUpliftPct = Math.round((ratio - 1) * 100);
    expect(oldUpliftPct).toBeGreaterThan(400);

    const result = computeArbitrage(input)!;
    expect(result).not.toBeNull();
    // Independent recomputation: move 20% of bad's 60% allocation to good.
    const after = computePlanSnapshot({
      ...input,
      channels: [good({ allocationPct: 52 }), bad({ allocationPct: 48 })],
    });
    expect(result.revenueDelta).toBeCloseTo(
      after.blended.projectedRevenue - snap.blended.projectedRevenue,
      4
    );
    expect(result.blendedRoasBefore).toBeCloseTo(snap.blended.blendedRoas, 6);
    expect(result.blendedRoasAfter).toBeCloseTo(after.blended.blendedRoas, 6);
    expect(result.blendedRoasAfter).toBeGreaterThan(result.blendedRoasBefore);
    // The plan-level blended return moves by a small amount, nowhere near +ratio.
    expect(result.blendedRoasAfter / result.blendedRoasBefore - 1).toBeLessThan(oldUpliftPct / 100);
    expect(result.shiftAmount).toBeCloseTo(b.metrics.spend * 0.2, 4);
  });

  it('excludes fixed-fee and retainer channels from winner/loser selection', () => {
    const fee = ch('fee', 'FLAT_FEE', 0, { ctr: 4, conversionRate: 50 }, 100, { tier: 'fixed' });
    const retainer = ch('ret', 'RETAINER', 0, { ctr: 0.1, conversionRate: 0.1 }, 100, { tier: 'fixed' });
    const result = computeArbitrage(plan([good(), bad(), fee, retainer]))!;
    expect(result.winner.id).toBe('good');
    expect(result.loser.id).toBe('bad');
    expect(computeArbitrage(plan([good(), fee, retainer]))).toBeNull();
  });

  it('ignores inactive channels', () => {
    expect(computeArbitrage(plan([good(), bad({ isActive: false })]))).toBeNull();
  });

  it('never returns a card whose modelled gain is not positive (saturated winner)', () => {
    // A tiny ceiling makes the winner saturated; the card must only appear if the engine
    // still models a revenue gain after the move.
    const result = computeArbitrage(plan([good({}, 1), bad()]));
    if (result) expect(result.revenueDelta).toBeGreaterThan(0);
    else expect(result).toBeNull();
  });

  it('returns null when the ROAS gap is small', () => {
    const a = ch('a', 'CPC', 50, { ctr: 4, conversionRate: 10 }, 1);
    const b = ch('b', 'CPC', 50, { ctr: 4, conversionRate: 10 }, 1);
    expect(computeArbitrage(plan([a, b]))).toBeNull();
  });

  it('is independent of any currency (amounts are plain numbers for the caller to format)', () => {
    const r = computeArbitrage(plan([good(), bad()]))!;
    expect(typeof r.revenueDelta).toBe('number');
    expect(JSON.stringify(r)).not.toMatch(/USD|\$/);
  });
});
