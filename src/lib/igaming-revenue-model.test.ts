import { describe, expect, it } from 'vitest';

import {
  calculateIgamingRevenueMonth,
  calculateIgamingRevenueSeries,
  DEFAULT_IGAMING_REVENUE_INPUTS,
  normalizeIgamingRevenueInputs,
  parseRateInput,
} from '@/lib/igaming-revenue-model';

describe('igaming revenue model', () => {
  const inputs = {
    playerValue: 150,
    ...DEFAULT_IGAMING_REVENUE_INPUTS,
  };

  it('calculates the monthly waterfall from FTDs and spend', () => {
    const result = calculateIgamingRevenueMonth(
      {
        ftds: 100,
        marketingCost: 5000,
      },
      0,
      inputs
    );

    expect(result.registrations).toBeCloseTo(500);
    expect(result.activePlayers).toBe(100);
    expect(result.ggr).toBeCloseTo(900);
    expect(result.bonus).toBeCloseTo(225);
    expect(result.ngr).toBeCloseTo(675);
    expect(result.grossContribution).toBeCloseTo(-4325);
    expect(result.ngrPerPlayer).toBeCloseTo(6.75);
  });

  it('rolls active players forward using retention plus new FTDs', () => {
    const series = calculateIgamingRevenueSeries(
      [
        { ftds: 100, marketingCost: 5000 },
        { ftds: 40, marketingCost: 3000 },
      ],
      inputs
    );

    expect(series[0].activePlayers).toBe(100);
    expect(series[1].activePlayers).toBeCloseTo(95);
    expect(series[1].ngr).toBeCloseTo(641.25);
  });
});

// N-8: rates typed as percentages (55 instead of 0.55) must not blow up the waterfall.
describe('rate inputs are fractions in [0, 1] (N-8)', () => {
  it('normalizeIgamingRevenueInputs clamps fractional rates to 1 and keeps turnover as a multiple', () => {
    const out = normalizeIgamingRevenueInputs(
      { retentionRate: 55, regToFtdCvr: 20, margin: 6, bonusRate: 25, turnoverRate: 3 },
      150
    );
    expect(out.retentionRate).toBe(1);
    expect(out.regToFtdCvr).toBe(1);
    expect(out.margin).toBe(1);
    expect(out.bonusRate).toBe(1);
    expect(out.turnoverRate).toBe(3);
  });

  it('keeps valid fractions and clamps negatives to 0', () => {
    const out = normalizeIgamingRevenueInputs({ retentionRate: 0.55, margin: -0.2 }, 150);
    expect(out.retentionRate).toBe(0.55);
    expect(out.margin).toBe(0);
  });

  it('parseRateInput clamps what the user types', () => {
    expect(parseRateInput('55')).toBe(1);
    expect(parseRateInput('0.55')).toBe(0.55);
    expect(parseRateInput('-3')).toBe(0);
    expect(parseRateInput('')).toBe(0);
  });
});
