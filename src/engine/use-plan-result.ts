import type { EngineResult } from './contract';
import { getEngine } from './registry';
import { selectEngineInput, type EngineSource } from './input';

// The live hook lives next to the store (it reads it); re-exported here so screens import from '@/engine'.
export { usePlanResult } from '@/hooks/use-media-plan-store';
export { selectEngineInput };

/** Computes the plan with the active engine outside React (exports, AI context, tests). */
export function computePlanResult(state: EngineSource): EngineResult {
  return getEngine().compute(selectEngineInput(state));
}
