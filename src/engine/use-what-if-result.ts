import { getEngine } from './registry';
import { selectEngineInput, type EngineSource } from './input';
import type { WhatIfResult } from './what-if';
import { selectWhatIfInput, type WhatIfControls, type WhatIfSandboxSource } from './what-if-input';

// The live hook reads the stores; re-exported here so screens import from '@/engine'.
export { useWhatIfResult } from '@/hooks/use-what-if-result';
export { selectWhatIfInput };

/** Computes the what-if with the active engine outside React (exports, AI context, tests). */
export function computeWhatIfResult(
  plan: EngineSource,
  controls: WhatIfControls,
  sandbox: WhatIfSandboxSource
): WhatIfResult {
  return getEngine().computeWhatIf(selectEngineInput(plan), selectWhatIfInput(controls, sandbox));
}
