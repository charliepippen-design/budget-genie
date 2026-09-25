import { beforeEach, describe, expect, it } from 'vitest';
import {
  computeCategoryTotals,
  computePlanSnapshot,
  getSpendSharePct,
  useMediaPlanStore,
  type ChannelData,
} from '@/hooks/use-media-plan-store';
import { hasMediaDeliveryMetrics, inferBuyingModel, type BuyingModel } from '@/types/channel';

function makeChannel(
  id: string,
  buyingModel: BuyingModel,
  allocationPct: number,
  { price = 10, isActive = true, locked = false } = {}
): ChannelData {
  return {
    id,
    name: id,
    category: 'Paid Search',
    allocationPct,
    family: 'paid_media',
    buyingModel,
    typeConfig: {
      family: 'paid_media',
      buyingModel,
      price,
      baselineMetrics: { ctr: 1, conversionRate: 2 },
    },
    tier: buyingModel === 'FLAT_FEE' || buyingModel === 'RETAINER' ? 'fixed' : 'scalable',
    maxSpendLimit: 0,
    locked,
    isActive,
  };
}

const store = () => useMediaPlanStore.getState();
const pct = (id: string) => store().channels.find((c) => c.id === id)?.allocationPct ?? NaN;
const activeVariableTotal = () =>
  store()
    .channels.filter((c) => c.isActive !== false && c.tier !== 'fixed')
    .reduce((sum, c) => sum + c.allocationPct, 0);

describe('channel table allocation logic', () => {
  beforeEach(() => {
    localStorage.removeItem('mediaplan-store-v2');
    useMediaPlanStore.setState({ totalBudget: 10000 });
  });

  it('keyboard step (commit fires before change) ends renormalised like a drag', () => {
    useMediaPlanStore.setState({
      channels: [
        makeChannel('a', 'CPM', 40),
        makeChannel('b', 'CPM', 30),
        makeChannel('c', 'CPC', 30),
        makeChannel('ghost', 'CPM', 25, { isActive: false }),
      ],
    });

    // Radix keyboard order: onValueCommit(new) → onValueChange(new).
    store().setChannelAllocation('a', 40.1);
    store().normalizeAllocations();
    store().setChannelAllocation('a', 40.1);

    expect(pct('a')).toBeCloseTo(40.1, 6);
    expect(activeVariableTotal()).toBeCloseTo(100, 6);
    // Inactive channels keep their ghost value and don't absorb the change.
    expect(pct('ghost')).toBe(25);
  });

  it('slider changes do not move fixed-fee or inactive channels', () => {
    useMediaPlanStore.setState({
      channels: [
        makeChannel('a', 'CPM', 50),
        makeChannel('b', 'CPM', 30),
        makeChannel('seo', 'RETAINER', 20, { price: 2000 }),
        makeChannel('ghost', 'CPM', 10, { isActive: false }),
      ],
    });

    store().setChannelAllocation('a', 60);

    expect(pct('a')).toBeCloseTo(60, 6);
    expect(pct('b')).toBeCloseTo(20, 6);
    expect(pct('seo')).toBe(20);
    expect(pct('ghost')).toBe(10);
  });

  it('normalizeAllocations scales active channels to 100% and ignores inactive ones', () => {
    useMediaPlanStore.setState({
      channels: [
        makeChannel('a', 'CPM', 30),
        makeChannel('b', 'CPM', 30),
        makeChannel('ghost', 'CPM', 40, { isActive: false }),
      ],
    });

    store().normalizeAllocations();

    expect(pct('a')).toBeCloseTo(50, 2);
    expect(pct('b')).toBeCloseTo(50, 2);
    expect(pct('ghost')).toBe(40);
  });

  it('fixed-fee rows get their real share of plan spend', () => {
    const snapshot = computePlanSnapshot({
      ...store(),
      channels: [
        makeChannel('a', 'CPM', 60),
        makeChannel('b', 'CPM', 40),
        makeChannel('fee', 'FLAT_FEE', 0, { price: 2000 }),
      ],
    });
    const share = (id: string) =>
      getSpendSharePct(snapshot.channels.find((c) => c.id === id)!, snapshot.blended);

    expect(share('fee')).toBeCloseTo(20, 6);
    expect(share('a')).toBeCloseTo(48, 6);
    expect(share('b')).toBeCloseTo(32, 6);
    expect(computeCategoryTotals(snapshot)['Paid Search'].percentage).toBeCloseTo(100, 6);
  });

  it('deactivating a channel drops it from the plan and renormalises the rest', () => {
    useMediaPlanStore.setState({
      channels: [
        makeChannel('a', 'CPM', 50),
        makeChannel('b', 'CPM', 25),
        makeChannel('c', 'CPM', 25),
      ],
    });

    store().toggleChannelActive('a');
    let snapshot = computePlanSnapshot(store());
    const a = snapshot.channels.find((c) => c.id === 'a')!;

    expect(a.isActive).toBe(false);
    expect(a.metrics.spend).toBe(0);
    expect(getSpendSharePct(a, snapshot.blended)).toBe(0);
    expect(pct('b')).toBeCloseTo(50, 6);
    expect(pct('c')).toBeCloseTo(50, 6);
    expect(snapshot.blended.totalSpend).toBeCloseTo(10000, 6);

    store().toggleChannelActive('a');
    snapshot = computePlanSnapshot(store());
    expect(store().channels.find((c) => c.id === 'a')?.isActive).toBe(true);
    expect(activeVariableTotal()).toBeCloseTo(100, 6);
    expect(snapshot.channels.find((c) => c.id === 'a')!.metrics.spend).toBeGreaterThan(0);
  });
});

describe('hasMediaDeliveryMetrics', () => {
  it('is true only for impression/click-bought media', () => {
    expect(hasMediaDeliveryMetrics('CPM')).toBe(true);
    expect(hasMediaDeliveryMetrics('CPC')).toBe(true);
    for (const model of ['CPA', 'REV_SHARE', 'HYBRID', 'FLAT_FEE', 'RETAINER'] as const) {
      expect(hasMediaDeliveryMetrics(model)).toBe(false);
    }
  });
});

describe('inferBuyingModel rev-share detection', () => {
  it('matches rev-share names but not words that merely contain "rs"', () => {
    expect(inferBuyingModel('Partners RevShare', 'affiliate')).toBe('REV_SHARE');
    expect(inferBuyingModel('Affiliates - Rev Share', 'affiliate')).toBe('REV_SHARE');
    expect(inferBuyingModel('Affiliate RS deals', 'affiliate')).toBe('REV_SHARE');
    expect(inferBuyingModel('Influencer - Monthly Retainers', 'influencer')).toBe('RETAINER');
    expect(inferBuyingModel('Influencers', 'influencer')).not.toBe('REV_SHARE');
  });
});
