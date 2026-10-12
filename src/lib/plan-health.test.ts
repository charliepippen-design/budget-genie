import { describe, expect, it } from 'vitest';
import { computePlanHealth } from './plan-health';
import type { GlobalMultipliers } from '@/hooks/use-media-plan-store';

const mults = {
  playerValue: 100,
  retentionRate: 0.5,
  regToFtdCvr: 0.2,
  turnoverRate: 1,
  margin: 1,
  bonusRate: 0,
} as GlobalMultipliers;

describe('computePlanHealth', () => {
  it('flags a losing iGaming plan and computes break-even CPA', () => {
    // 1000 FTDs at CPA 110, NGR per FTD 100 -> 100k NGR vs 110k spend
    const h = computePlanHealth(
      { totalSpend: 110000, totalConversions: 1000, projectedRevenue: 500000 },
      'igaming',
      mults
    );
    expect(h.losesMoney).toBe(true);
    expect(h.monthlyContribution).toBeCloseTo(-10000);
    expect(h.breakEvenCpa).toBeCloseTo(100);
    expect(h.blendedCpa).toBeCloseTo(110);
  });

  it('is not losing when value per customer exceeds CPA', () => {
    const h = computePlanHealth(
      { totalSpend: 90000, totalConversions: 1000, projectedRevenue: 0 },
      'igaming',
      mults
    );
    expect(h.losesMoney).toBe(false);
    expect(h.monthlyContribution).toBeCloseTo(10000);
  });

  it('uses projected revenue outside iGaming', () => {
    const h = computePlanHealth(
      { totalSpend: 5000, totalConversions: 50, projectedRevenue: 4000 },
      'ecommerce',
      mults
    );
    expect(h.losesMoney).toBe(true);
    expect(h.breakEvenCpa).toBeCloseTo(80);
  });

  it('is not computable with zero spend or zero customers', () => {
    for (const b of [
      { totalSpend: 0, totalConversions: 0, projectedRevenue: 0 },
      { totalSpend: 1000, totalConversions: 0, projectedRevenue: 0 },
    ]) {
      const h = computePlanHealth(b, 'igaming', mults);
      expect(h.losesMoney).toBe(false);
      expect(h.breakEvenCpa).toBeNull();
    }
  });
});
