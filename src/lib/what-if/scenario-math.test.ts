import { describe, expect, it } from 'vitest';
import { compareBaseScenario, scenarioRoiData } from './scenario-math';
import type { ScenarioPoint } from './types';

const point = (scenario: ScenarioPoint['scenario'], cohort: number): ScenarioPoint => ({
  scenario,
  projectedLtvPerUser: 0,
  projectedCohortValue: cohort,
  ltvToCac: 0,
});

describe('scenarioRoiData', () => {
  it('computes ROI percent per scenario', () => {
    expect(
      scenarioRoiData([point('Bear', 500), point('Base', 1500), point('Bull', 3000)], 1000)
    ).toEqual([
      { scenario: 'Bear', roi: -50 },
      { scenario: 'Base', roi: 50 },
      { scenario: 'Bull', roi: 200 },
    ]);
  });

  it('returns 0 ROI when spend is zero', () => {
    expect(scenarioRoiData([point('Base', 1500)], 0)).toEqual([{ scenario: 'Base', roi: 0 }]);
  });

  it('returns an empty list for no scenarios', () => {
    expect(scenarioRoiData([], 1000)).toEqual([]);
  });
});

describe('compareBaseScenario', () => {
  it('reports unavailable when a Base scenario is missing on either side', () => {
    const base = [{ scenario: 'Base' as const, roi: 10 }];
    const bear = [{ scenario: 'Bear' as const, roi: 10 }];
    expect(compareBaseScenario(bear, base)).toBe('Scenario comparison unavailable.');
    expect(compareBaseScenario(base, bear)).toBe('Scenario comparison unavailable.');
    expect(compareBaseScenario([], [])).toBe('Scenario comparison unavailable.');
  });

  it('reports up with one decimal', () => {
    expect(
      compareBaseScenario([{ scenario: 'Base', roi: 10 }], [{ scenario: 'Base', roi: 12.34 }])
    ).toBe('Base-case ROI projection is up 2.3 points versus baseline.');
  });

  it('reports down with the absolute delta', () => {
    expect(
      compareBaseScenario([{ scenario: 'Base', roi: 10 }], [{ scenario: 'Base', roi: 4 }])
    ).toBe('Base-case ROI projection is down 6.0 points versus baseline.');
  });

  it('treats no change as up', () => {
    expect(
      compareBaseScenario([{ scenario: 'Base', roi: 10 }], [{ scenario: 'Base', roi: 10 }])
    ).toBe('Base-case ROI projection is up 0.0 points versus baseline.');
  });
});
