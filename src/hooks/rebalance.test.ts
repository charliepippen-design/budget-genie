import { beforeEach, describe, expect, it } from 'vitest';
import { useMediaPlanStore, type ChannelData } from '@/hooks/use-media-plan-store';
import type { ChannelCategory } from '@/lib/mediaplan-data';
import type { BuyingModel, ChannelFamily } from '@/types/channel';

function makeChannel({
  id,
  name,
  category,
  family,
  buyingModel,
  price,
  allocationPct,
  locked = false,
  isActive = true,
}: {
  id: string;
  name: string;
  category: ChannelCategory;
  family: ChannelFamily;
  buyingModel: BuyingModel;
  price: number;
  allocationPct: number;
  locked?: boolean;
  isActive?: boolean;
}): ChannelData {
  return {
    id,
    name,
    category,
    allocationPct,
    family,
    buyingModel,
    typeConfig: {
      family,
      buyingModel,
      price,
      baselineMetrics: {
        ctr: 1,
        conversionRate: 2,
      },
    },
    tier: buyingModel === 'FLAT_FEE' || buyingModel === 'RETAINER' ? 'fixed' : 'scalable',
    maxSpendLimit: 0,
    locked,
    isActive,
  };
}

describe('rebalanceToTargets action', () => {
  beforeEach(() => {
    localStorage.removeItem('mediaplan-store-v2');
    useMediaPlanStore.setState({
      totalBudget: 10000,
      globalMultipliers: {
        spendMultiplier: 1,
        defaultCpmOverride: null,
        ctrBump: 0,
        cpaTarget: null,
        roasTarget: 2,
        playerValue: 150,
        retentionRate: 0.55,
        regToFtdCvr: 0.2,
        turnoverRate: 1,
        margin: 0.06,
        bonusRate: 0.25,
      },
    });
  });

  it('keeps allocations unchanged when all channels are above ROAS target', () => {
    useMediaPlanStore.setState({
      channels: [
        makeChannel({
          id: 'a',
          name: 'Affiliate A',
          category: 'Affiliate',
          family: 'affiliate',
          buyingModel: 'CPA',
          price: 50,
          allocationPct: 50,
        }),
        makeChannel({
          id: 'b',
          name: 'Affiliate B',
          category: 'Affiliate',
          family: 'affiliate',
          buyingModel: 'CPA',
          price: 50,
          allocationPct: 50,
        }),
      ],
    });

    useMediaPlanStore.getState().rebalanceToTargets();
    const channels = useMediaPlanStore.getState().channels;

    expect(channels.find((c) => c.id === 'a')?.allocationPct).toBeCloseTo(50, 6);
    expect(channels.find((c) => c.id === 'b')?.allocationPct).toBeCloseTo(50, 6);
  });

  it('decreases allocation for one below-target channel and increases others', () => {
    useMediaPlanStore.setState({
      channels: [
        makeChannel({
          id: 'weak',
          name: 'Weak Channel',
          category: 'Paid Search',
          family: 'paid_media',
          buyingModel: 'CPA',
          price: 250,
          allocationPct: 50,
        }),
        makeChannel({
          id: 'strong',
          name: 'Strong Channel',
          category: 'Affiliate',
          family: 'affiliate',
          buyingModel: 'CPA',
          price: 50,
          allocationPct: 50,
        }),
      ],
    });

    useMediaPlanStore.getState().rebalanceToTargets();
    const channels = useMediaPlanStore.getState().channels;
    const weak = channels.find((c) => c.id === 'weak');
    const strong = channels.find((c) => c.id === 'strong');

    expect(weak?.allocationPct ?? 0).toBeLessThan(50);
    expect(strong?.allocationPct ?? 0).toBeGreaterThan(50);
  });

  it('does not zero all channels when all are below target', () => {
    useMediaPlanStore.setState({
      channels: [
        makeChannel({
          id: 'c1',
          name: 'Channel 1',
          category: 'Paid Search',
          family: 'paid_media',
          buyingModel: 'CPA',
          price: 250,
          allocationPct: 60,
        }),
        makeChannel({
          id: 'c2',
          name: 'Channel 2',
          category: 'Display/Programmatic',
          family: 'paid_media',
          buyingModel: 'CPA',
          price: 300,
          allocationPct: 40,
        }),
      ],
    });

    useMediaPlanStore.getState().rebalanceToTargets();
    const channels = useMediaPlanStore.getState().channels;
    const total = channels.reduce((sum, c) => sum + c.allocationPct, 0);

    channels.forEach((ch) => {
      expect(ch.allocationPct).toBeGreaterThan(0);
    });
    expect(total).toBeCloseTo(100, 6);
  });

  it('does not change locked channels during rebalance', () => {
    useMediaPlanStore.setState({
      channels: [
        makeChannel({
          id: 'locked',
          name: 'Locked',
          category: 'Paid Search',
          family: 'paid_media',
          buyingModel: 'CPA',
          price: 300,
          allocationPct: 40,
          locked: true,
        }),
        makeChannel({
          id: 'open',
          name: 'Open',
          category: 'Affiliate',
          family: 'affiliate',
          buyingModel: 'CPA',
          price: 50,
          allocationPct: 60,
        }),
      ],
    });

    useMediaPlanStore.getState().rebalanceToTargets();
    const channels = useMediaPlanStore.getState().channels;

    expect(channels.find((c) => c.id === 'locked')?.allocationPct).toBe(40);
  });

  it('does not affect ghost (inactive) channels', () => {
    useMediaPlanStore.setState({
      channels: [
        makeChannel({
          id: 'ghost',
          name: 'Ghost',
          category: 'Paid Search',
          family: 'paid_media',
          buyingModel: 'CPA',
          price: 300,
          allocationPct: 40,
          isActive: false,
        }),
        makeChannel({
          id: 'active',
          name: 'Active',
          category: 'Affiliate',
          family: 'affiliate',
          buyingModel: 'CPA',
          price: 50,
          allocationPct: 60,
          isActive: true,
        }),
      ],
    });

    useMediaPlanStore.getState().rebalanceToTargets();
    const channels = useMediaPlanStore.getState().channels;

    expect(channels.find((c) => c.id === 'ghost')?.allocationPct).toBe(40);
  });
});
