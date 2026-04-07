import { describe, expect, it } from 'vitest';
import { calculateUnifiedMetrics, type ChannelTypeConfig } from '@/types/channel';

function makeFixedConfig(
  buyingModel: 'FLAT_FEE' | 'RETAINER',
  overrides?: Partial<ChannelTypeConfig>
): ChannelTypeConfig {
  return {
    family: 'affiliate',
    buyingModel,
    price: 2000,
    baselineMetrics: {
      conversionRate: 5,
      trafficPerUnit: 1000,
      ...overrides?.baselineMetrics,
    },
    ...overrides,
  };
}

describe('calculateUnifiedMetrics - FLAT_FEE', () => {
  it('derives FTDs from estimated traffic, not spend/price arithmetic', () => {
    const config = makeFixedConfig('FLAT_FEE', {
      price: 2000,
      baselineMetrics: { trafficPerUnit: 1000, conversionRate: 5 },
    });

    const result = calculateUnifiedMetrics(config, 999999, 150);

    expect(result.spend).toBe(2000);
    expect(result.ftds).toBe(50);
  });

  it('calculates CPA as spend / ftds when ftds > 0', () => {
    const config = makeFixedConfig('FLAT_FEE', {
      price: 2000,
      baselineMetrics: { trafficPerUnit: 1000, conversionRate: 5 },
    });

    const result = calculateUnifiedMetrics(config, 5000, 150);

    expect(result.cpa).toBe(40);
  });

  it('returns null CPA when conversionRate is 0', () => {
    const config = makeFixedConfig('FLAT_FEE', {
      baselineMetrics: { trafficPerUnit: 1000, conversionRate: 0 },
    });

    const result = calculateUnifiedMetrics(config, 2000, 150);

    expect(result.ftds).toBe(0);
    expect(result.cpa).toBeNull();
  });

  it('returns null CPA when trafficPerUnit is 0', () => {
    const config = makeFixedConfig('FLAT_FEE', {
      baselineMetrics: { trafficPerUnit: 0, conversionRate: 5 },
    });

    const result = calculateUnifiedMetrics(config, 2000, 150);

    expect(result.ftds).toBe(0);
    expect(result.cpa).toBeNull();
  });

  it('applies saturation decay to revenue when saturationCeiling is set', () => {
    const config = makeFixedConfig('FLAT_FEE', {
      price: 2000,
      baselineMetrics: { trafficPerUnit: 1000, conversionRate: 5, saturationCeiling: 1000 },
    });

    const result = calculateUnifiedMetrics(config, 2000, 150);
    const linearRevenue = 50 * 150;
    const expected = linearRevenue * (1 / (1 + 2000 / 1000));

    expect(result.revenue).toBeCloseTo(expected, 6);
  });
});

describe('calculateUnifiedMetrics - RETAINER', () => {
  it('matches FLAT_FEE FTD behavior for fixed-cost models', () => {
    const flatFee = calculateUnifiedMetrics(
      makeFixedConfig('FLAT_FEE', {
        baselineMetrics: { trafficPerUnit: 1200, conversionRate: 4 },
      }),
      1200,
      150
    );

    const retainer = calculateUnifiedMetrics(
      makeFixedConfig('RETAINER', {
        baselineMetrics: { trafficPerUnit: 1200, conversionRate: 4 },
      }),
      1200,
      150
    );

    expect(retainer.ftds).toBe(flatFee.ftds);
    expect(retainer.cpa).toBe(flatFee.cpa);
  });

  it('returns 0 FTDs and null CPA when trafficPerUnit is undefined', () => {
    const config = makeFixedConfig('RETAINER', {
      baselineMetrics: { conversionRate: 5, trafficPerUnit: undefined },
    });

    const result = calculateUnifiedMetrics(config, 2000, 150);

    expect(result.ftds).toBe(0);
    expect(result.cpa).toBeNull();
  });
});
