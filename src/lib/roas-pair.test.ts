import { describe, expect, it } from 'vitest';
import type { GlobalMultipliers } from '@/hooks/use-media-plan-store';
import { computePlanEconomics } from './plan-economics';
import {
  LIFETIME_ROAS_LABEL,
  MONTH1_ROAS_LABEL,
  computeRoasPair,
  formatRoasPair,
  roasPairFromEconomics,
} from './roas-pair';

const mults = {
  playerValue: 100,
  retentionRate: 0.5,
  regToFtdCvr: 0.2,
  turnoverRate: 1,
  margin: 0.25,
  bonusRate: 0,
} as GlobalMultipliers;

// Month-1 NGR per FTD = 25; lifetime cohort value per FTD = 100. Spend 40k => loses money in month 1.
const losing = {
  totalSpend: 40000,
  totalConversions: 1000,
  projectedRevenue: 100000,
  blendedRoas: 2.5,
};

describe('roas pair', () => {
  it('uses the shared labels', () => {
    expect(LIFETIME_ROAS_LABEL).toBe('Lifetime ROAS (cohort)');
    expect(MONTH1_ROAS_LABEL).toBe('Month-1 ROAS');
  });

  it('losing plan: lifetime ROAS stays above 1x while Month-1 ROAS is below 1x', () => {
    const pair = computeRoasPair(losing, 'igaming', mults);
    expect(pair.lifetime).toBe(2.5);
    expect(pair.month1).toBeCloseTo(25000 / 40000);
    expect(pair.month1).toBeLessThan(1);
  });

  it('month-1 value comes from computePlanEconomics', () => {
    const e = computePlanEconomics(losing, 'igaming', mults);
    expect(roasPairFromEconomics(e, losing.blendedRoas).month1).toBeCloseTo(
      e.monthlyValue / e.monthlySpend
    );
  });

  it('is null when the plan is not computable', () => {
    const pair = computeRoasPair({ ...losing, totalConversions: 0 }, 'igaming', mults);
    expect(pair.month1).toBeNull();
    expect(formatRoasPair(pair)).toBe(`${LIFETIME_ROAS_LABEL} 2.50x, ${MONTH1_ROAS_LABEL} n/a`);
  });

  it('formats both labels', () => {
    expect(formatRoasPair({ lifetime: 1.44, month1: 0.6 })).toBe(
      'Lifetime ROAS (cohort) 1.44x, Month-1 ROAS 0.60x'
    );
  });
});
