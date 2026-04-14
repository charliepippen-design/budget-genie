import { describe, expect, it } from 'vitest';
import { optimizeBudget } from '@/lib/optimization-logic';

describe('optimizeBudget', () => {
  it('slashes high-CPA channels and boosts high-ROAS channels', () => {
    const channels = [
      {
        id: 'high-cpa',
        name: 'High CPA',
        allocationPct: 50,
        locked: false,
        isActive: true,
        tier: 'scalable',
        buyingModel: 'CPM',
        family: 'paid_media',
        category: 'Paid Search',
        typeConfig: {
          family: 'paid_media',
          buyingModel: 'CPM',
          price: 6,
          baselineMetrics: {
            ctr: 0.3,
            conversionRate: 0.4,
            aov: 90,
            trafficPerUnit: 1000,
            saturationCeiling: 50000,
          },
        },
      },
      {
        id: 'high-roas',
        name: 'High ROAS',
        allocationPct: 50,
        locked: false,
        isActive: true,
        tier: 'scalable',
        buyingModel: 'CPM',
        family: 'paid_media',
        category: 'Paid Social',
        typeConfig: {
          family: 'paid_media',
          buyingModel: 'CPM',
          price: 1,
          baselineMetrics: {
            ctr: 4,
            conversionRate: 9,
            aov: 300,
            trafficPerUnit: 1000,
            saturationCeiling: 50000,
          },
        },
      },
    ] as never;

    const result = optimizeBudget(channels, 100000, {
      spendMultiplier: 1,
      defaultCpmOverride: null,
      ctrBump: 0,
      cpaTarget: 100,
      roasTarget: 2,
      playerValue: 200,
      retentionRate: 0.55,
      regToFtdCvr: 0.2,
      turnoverRate: 1,
      margin: 0.06,
      bonusRate: 0.25,
    });

    expect(result.changes.slashed).toContain('high-cpa');
    expect(result.changes.boosted).toContain('high-roas');

    const total = result.channels.reduce((sum, channel) => sum + channel.allocationPct, 0);
    expect(Number(total.toFixed(2))).toBe(100);
  });
});
