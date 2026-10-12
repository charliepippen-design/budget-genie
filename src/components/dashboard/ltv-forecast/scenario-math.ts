import type { ScenarioPoint } from './types';

export function scenarioRoiData(scenarios: ScenarioPoint[], totalSpend: number) {
  return scenarios.map((scenario) => ({
    scenario: scenario.scenario,
    roi:
      totalSpend > 0 ? ((scenario.projectedCohortValue - totalSpend) / totalSpend) * 100 : 0,
  }));
}

export function compareBaseScenario(
  baselineScenarioRoiData: ReturnType<typeof scenarioRoiData>,
  adjustedScenarioRoiData: ReturnType<typeof scenarioRoiData>
): string {
  const baseScenario = baselineScenarioRoiData.find((scenario) => scenario.scenario === 'Base');
  const adjustedBaseScenario = adjustedScenarioRoiData.find(
    (scenario) => scenario.scenario === 'Base'
  );

  if (!baseScenario || !adjustedBaseScenario) {
    return 'Scenario comparison unavailable.';
  }

  const delta = adjustedBaseScenario.roi - baseScenario.roi;
  const direction = delta >= 0 ? 'up' : 'down';

  return `Base-case ROI projection is ${direction} ${Math.abs(delta).toFixed(1)} points versus baseline.`;
}
