import type { ScenarioPoint, ScenarioRoiPoint } from './types';

export function scenarioRoiData(scenarios: ScenarioPoint[], totalSpend: number): ScenarioRoiPoint[] {
  return scenarios.map((scenario) => ({
    scenario: scenario.scenario,
    roi:
      totalSpend > 0 ? ((scenario.projectedCohortValue - totalSpend) / totalSpend) * 100 : 0,
  }));
}

/** Adjusted minus baseline ROI of the Base scenario, in points; null when either side has none. */
export function baseScenarioRoiDelta(
  baselineScenarioRoiData: ScenarioRoiPoint[],
  adjustedScenarioRoiData: ScenarioRoiPoint[]
): number | null {
  const baseScenario = baselineScenarioRoiData.find((scenario) => scenario.scenario === 'Base');
  const adjustedBaseScenario = adjustedScenarioRoiData.find(
    (scenario) => scenario.scenario === 'Base'
  );

  if (!baseScenario || !adjustedBaseScenario) {
    return null;
  }

  return adjustedBaseScenario.roi - baseScenario.roi;
}

/** Wording only: the screen-reader sentence for the Base scenario ROI change. */
export function formatBaseScenarioComparison(delta: number | null): string {
  if (delta === null) {
    return 'Scenario comparison unavailable.';
  }

  const direction = delta >= 0 ? 'up' : 'down';

  return `Base-case ROI projection is ${direction} ${Math.abs(delta).toFixed(1)} points versus baseline.`;
}

export function compareBaseScenario(
  baselineScenarioRoiData: ScenarioRoiPoint[],
  adjustedScenarioRoiData: ScenarioRoiPoint[]
): string {
  return formatBaseScenarioComparison(
    baseScenarioRoiDelta(baselineScenarioRoiData, adjustedScenarioRoiData)
  );
}
