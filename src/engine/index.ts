export type {
  EngineAlerts,
  EngineChannelGroups,
  EngineChannelInsight,
  EngineCustomerValue,
  EngineInput,
  EngineMarkets,
  EngineMonthRange,
  EngineRange,
  EngineRanges,
  EngineRangeSet,
  EngineResult,
  EngineTotals,
  PlanEngine,
} from './contract';
export { placeholderEngine } from './placeholder-engine';
export { responseCurveEngine } from './v1';
export {
  ENGINE_STORAGE_KEY,
  engines,
  getEngine,
  selectEngineFromStorage,
  setEngine,
  setEngineById,
  subscribeEngine,
} from './registry';
export type {
  OptimiseConstraints,
  OptimiseGoal,
  OptimiseOptions,
  OptimiseOutcome,
  OptimiseResult,
} from './optimise';
export { computePlanResult, selectEngineInput, usePlanResult } from './use-plan-result';
export { computeOptimisedMix, type OptimisedMix, type OptimisedMixChange } from './optimised-mix';
export { selectProjectionBand } from './projection-band';
export type {
  TimelineChannel,
  TimelineComparison,
  TimelineComparisonMetric,
  TimelineComparisonRow,
  TimelineGoal,
  TimelineInput,
  TimelineMonthInput,
  TimelineMonthResult,
  TimelineOptimisationCandidate,
  TimelinePattern,
  TimelinePlan,
  TimelineResult,
  TimelineRevenueModelMonth,
  TimelineScenarioInput,
  TimelineSettings,
  TimelineTotals,
} from './timeline';
export type {
  WhatIfChannel,
  WhatIfChannelAdjustment,
  WhatIfCustomerValue,
  WhatIfGroupImpact,
  WhatIfInput,
  WhatIfResult,
  WhatIfSandboxInput,
  WhatIfScenarios,
  WhatIfTotals,
} from './what-if';
export type { WhatIfControls } from './what-if-input';
export { computeTimelineResult, selectTimelineInput, useTimelineResult } from './use-timeline-result';
export { computeWhatIfResult, selectWhatIfInput, useWhatIfResult } from './use-what-if-result';
