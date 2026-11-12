// Response-curve engine (v1): the first statistical engine behind the engine port.
//
// PRIOR-BASED, NOT FITTED: no customer data exists yet, so every parameter that does not come
// from the plan itself is a stated assumption (see ./priors). The engine turns those assumptions
// into ranges; it is built so observed data can replace them. See README.md.

import type { PlanEngine } from '../contract';
import { ENGINE_ID, ENGINE_VERSION, compute } from './compute';
import { optimiseAllocation } from './optimiser';
import { computeTimeline } from './timeline';
import { computeWhatIf } from './what-if';

export const responseCurveEngine: PlanEngine = {
  id: ENGINE_ID,
  version: ENGINE_VERSION,
  compute,
  computeTimeline,
  computeWhatIf,
  optimise: optimiseAllocation,
};

export { applyAllocation, optimiseAllocation } from './optimiser';
