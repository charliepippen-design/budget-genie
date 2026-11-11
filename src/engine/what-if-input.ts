import type { ChannelGroup } from '@/lib/planning-insights';
import type { ChannelSandboxAdjustment } from '@/lib/what-if/types';
import type { WhatIfInput } from './what-if';

/** The lab's own controls: the stress sliders and the decay curve (local state of the panel). */
export type WhatIfControls = Omit<WhatIfInput, 'sandbox'>;

/** The sandbox store fields the engine reads. */
export interface WhatIfSandboxSource {
  sandboxEnabled: boolean;
  selectedChannelIds: string[];
  channelAdjustments: Record<string, ChannelSandboxAdjustment>;
  groupAdjustments: Record<ChannelGroup, number>;
}

/** Maps the lab's controls and the sandbox store to the what-if input. */
export function selectWhatIfInput(controls: WhatIfControls, sandbox: WhatIfSandboxSource): WhatIfInput {
  return {
    churnRatePct: controls.churnRatePct,
    cpaShockPct: controls.cpaShockPct,
    roasLiftPct: controls.roasLiftPct,
    decayCurve: controls.decayCurve,
    sandbox: {
      enabled: sandbox.sandboxEnabled,
      selectedChannelIds: sandbox.selectedChannelIds,
      channelAdjustments: sandbox.channelAdjustments,
      groupAdjustments: sandbox.groupAdjustments,
    },
  };
}
