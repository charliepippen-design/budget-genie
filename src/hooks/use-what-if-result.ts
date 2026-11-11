import { useMemo, useSyncExternalStore } from 'react';
import { getEngine, subscribeEngine } from '@/engine/registry';
import type { WhatIfResult } from '@/engine/what-if';
import { selectWhatIfInput, type WhatIfControls } from '@/engine/what-if-input';
import { useSandboxStore } from '@/store/useSandboxStore';
import { useEngineInput } from './use-engine-input';

/**
 * The customer-value lab computed by the active engine (see src/engine/what-if.ts): the live
 * plan under the lab's controls and the sandbox store's adjustments.
 */
export function useWhatIfResult(controls: WhatIfControls): WhatIfResult {
  const engine = useSyncExternalStore(subscribeEngine, getEngine, getEngine);
  const input = useEngineInput();
  const sandboxEnabled = useSandboxStore((state) => state.sandboxEnabled);
  const selectedChannelIds = useSandboxStore((state) => state.selectedChannelIds);
  const channelAdjustments = useSandboxStore((state) => state.channelAdjustments);
  const groupAdjustments = useSandboxStore((state) => state.groupAdjustments);
  const { churnRatePct, cpaShockPct, roasLiftPct, decayCurve } = controls;

  return useMemo(
    () =>
      engine.computeWhatIf(
        input,
        selectWhatIfInput(
          { churnRatePct, cpaShockPct, roasLiftPct, decayCurve },
          { sandboxEnabled, selectedChannelIds, channelAdjustments, groupAdjustments }
        )
      ),
    [
      engine,
      input,
      churnRatePct,
      cpaShockPct,
      roasLiftPct,
      decayCurve,
      sandboxEnabled,
      selectedChannelIds,
      channelAdjustments,
      groupAdjustments,
    ]
  );
}
