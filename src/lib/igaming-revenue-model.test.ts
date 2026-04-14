import { describe, expect, it } from 'vitest';

import {
  calculateIgamingRevenueMonth,
  calculateIgamingRevenueSeries,
  DEFAULT_IGAMING_REVENUE_INPUTS,
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
