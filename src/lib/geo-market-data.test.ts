import { describe, expect, it } from 'vitest';
import { TOP_IGAMING_GEOS } from '@/lib/geo-market-data';
import { getGeoMarketProfile } from '@/hooks/use-media-plan-store';

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

describe('geo market blending', () => {
  it('100% Tier 1: blended CPA equals average CPA of Tier 1 markets', () => {
    const tier1Average = average(
      TOP_IGAMING_GEOS.filter((g) => g.tier === 'tier1').map((g) => g.baselineCpa)
    );

    const result = getGeoMarketProfile({ tier1: 100, tier2: 0, tier3: 0 }, []);

    expect(result.blendedCpa).toBeCloseTo(tier1Average, 6);
  });

  it('100% Tier 3: blended CPA is lower than Tier 1', () => {
    const tier1 = getGeoMarketProfile({ tier1: 100, tier2: 0, tier3: 0 }, []);
    const tier3 = getGeoMarketProfile({ tier1: 0, tier2: 0, tier3: 100 }, []);

    expect(tier3.blendedCpa).toBeLessThan(tier1.blendedCpa);
  });

  it('50/50 Tier1/Tier2 split yields CPA between tier averages', () => {
    const tier1 = getGeoMarketProfile({ tier1: 100, tier2: 0, tier3: 0 }, []);
    const tier2 = getGeoMarketProfile({ tier1: 0, tier2: 100, tier3: 0 }, []);
    const split = getGeoMarketProfile({ tier1: 50, tier2: 50, tier3: 0 }, []);

    const max = Math.max(tier1.blendedCpa, tier2.blendedCpa);
    const min = Math.min(tier1.blendedCpa, tier2.blendedCpa);

    expect(split.blendedCpa).toBeGreaterThanOrEqual(min);
    expect(split.blendedCpa).toBeLessThanOrEqual(max);
  });

  it('activeGeos overrides tier weights and blends only selected countries', () => {
    const selected = ['Germany', 'Brazil'];
    const expectedCpa = average(
      TOP_IGAMING_GEOS.filter((g) => selected.includes(g.name)).map((g) => g.baselineCpa)
    );
    const expectedLtv = average(
      TOP_IGAMING_GEOS.filter((g) => selected.includes(g.name)).map((g) => g.baselineLtv)
    );

    const result = getGeoMarketProfile({ tier1: 0, tier2: 0, tier3: 100 }, selected);

    expect(result.mode).toBe('geos');
    expect(result.blendedCpa).toBeCloseTo(expectedCpa, 6);
    expect(result.blendedLtv).toBeCloseTo(expectedLtv, 6);
  });

  it('all tier weights at 0 with no activeGeos does not throw and returns 0-like values', () => {
    expect(() => getGeoMarketProfile({ tier1: 0, tier2: 0, tier3: 0 }, [])).not.toThrow();

    const result = getGeoMarketProfile({ tier1: 0, tier2: 0, tier3: 0 }, []);

    expect([0, null]).toContain(result.blendedCpa as number | null);
    expect([0, null]).toContain(result.blendedLtv as number | null);
  });

  it('uses geo overrides for selected markets when provided', () => {
    const result = getGeoMarketProfile({ tier1: 100, tier2: 0, tier3: 0 }, ['Germany'], {
      Germany: { cpa: 111, ltv: 333 },
    });

    expect(result.mode).toBe('geos');
    expect(result.blendedCpa).toBeCloseTo(111, 6);
    expect(result.blendedLtv).toBeCloseTo(333, 6);
  });
});
