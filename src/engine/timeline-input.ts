import type { MultiMonthState } from '@/lib/multi-month/state';
import type { TimelineInput } from './timeline';

/** The multi-month store fields the engine reads. */
export type TimelineSource = Pick<
  MultiMonthState,
  | 'includeSoftLaunch'
  | 'planningMonths'
  | 'startMonth'
  | 'progressionPattern'
  | 'patternParams'
  | 'globalSettings'
  | 'months'
  | 'scenarios'
  | 'comparisonScenarioId'
  | 'optimizationGoal'
>;

/** Maps the multi-month store to the timeline input. The only store -> engine translation. */
export function selectTimelineInput(state: TimelineSource): TimelineInput {
  return {
    includeSoftLaunch: state.includeSoftLaunch,
    planningMonths: state.planningMonths,
    startMonth: state.startMonth,
    pattern: state.progressionPattern,
    patternParams: state.patternParams,
    settings: state.globalSettings,
    months: state.months,
    scenarios: state.scenarios.map((scenario) => ({
      id: scenario.id,
      name: scenario.name,
      months: scenario.months,
      // Scenarios saved before settings were stored with them use the current ones.
      settings: scenario.globalSettings || state.globalSettings,
    })),
    comparisonScenarioId: state.comparisonScenarioId,
    optimisationGoal: state.optimizationGoal,
  };
}
