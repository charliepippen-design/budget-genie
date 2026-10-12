import { describe, expect, it } from 'vitest';
import { computePlanEconomics } from './plan-economics';
import { computePlanHealth } from './plan-health';
import type { GlobalMultipliers } from '@/hooks/use-media-plan-store';

const mults = {
  playerValue: 100,
  retentionRate: 0.5,
  regToFtdCvr: 0.2,
  turnoverRate: 1,
  margin: 0.25,
  bonusRate: 0,
} as GlobalMultipliers;

// Month-1 NGR per FTD = 100 * 1 * 0.25 = 25. Lifetime cohort value per FTD = 100 (projectedRevenue).
const losing = { totalSpend: 40000, totalConversions: 1000, projectedRevenue: 100000 };
const profitable = { totalSpend: 20000, totalConversions: 1000, projectedRevenue: 100000 };

describe('computePlanEconomics', () => {
  it('returns spend, value, net per month and per cohort, break-even CPA', () => {
    const e = computePlanEconomics(losing, 'igaming', mults);
    expect(e.monthlySpend).toBe(40000);
    expect(e.monthlyValue).toBeCloseTo(25000);
    expect(e.netValuePerMonth).toBeCloseTo(-15000);
    expect(e.netValueCohort).toBeCloseTo(60000);
    expect(e.breakEvenCpa).toBeCloseTo(25);
    expect(e.breakEvenCpaCohort).toBeCloseTo(100);
    expect(e.losesMoney).toBe(true);
    expect(e.losesMoneyCohort).toBe(false);
  });

  it('is not computable without spend or customers', () => {
    const e = computePlanEconomics({ ...losing, totalConversions: 0 }, 'igaming', mults);
    expect(e.computable).toBe(false);
    expect(e.losesMoney).toBe(false);
    expect(e.breakEvenCpa).toBeNull();
  });
});

describe('report / banner parity (regression: +8,692 on /report vs -18,789/month on the banner)', () => {
  // The report's Net Value is usePlanEconomics().netPnl = economics.netValuePerMonth;
  // the banner is computePlanHealth().monthlyContribution. Both are views of computePlanEconomics.
  it('losing plan: same sign and value for the same period', () => {
    const report = computePlanEconomics(losing, 'igaming', mults).netValuePerMonth;
    const banner = computePlanHealth(losing, 'igaming', mults);
    expect(banner.losesMoney).toBe(true);
    expect(report).toBeLessThan(0);
    expect(banner.monthlyContribution).toBe(report);
    // Old report formula (cohort value - spend) was positive here: the contradiction.
    expect(losing.projectedRevenue - losing.totalSpend).toBeGreaterThan(0);
    expect(banner.cohortNetValue).toBeCloseTo(60000);
  });

  it('profitable plan: both profit, never a loss banner', () => {
    const report = computePlanEconomics(profitable, 'igaming', mults).netValuePerMonth;
    const banner = computePlanHealth(profitable, 'igaming', mults);
    expect(report).toBeCloseTo(5000);
    expect(banner.losesMoney).toBe(false);
    expect(banner.monthlyContribution).toBe(report);
  });

  it('non-iGaming: month 1 equals cohort value, so both views agree on every period', () => {
    const plan = { totalSpend: 5000, totalConversions: 50, projectedRevenue: 4000 };
    const e = computePlanEconomics(plan, 'ecommerce', mults);
    const h = computePlanHealth(plan, 'ecommerce', mults);
    expect(e.netValuePerMonth).toBe(e.netValueCohort);
    expect(h.monthlyContribution).toBe(e.netValuePerMonth);
    expect(h.losesMoney).toBe(true);
  });
});
