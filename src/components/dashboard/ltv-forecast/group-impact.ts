import { GROUP_LABELS } from '@/lib/planning-insights';
import type { SandboxGroupImpact } from '@/lib/what-if/types';
import { SANDBOX_DECREASE_FILL, SANDBOX_INCREASE_FILL, SANDBOX_NEUTRAL_FILL } from './constants';

/** Presentation only: group label and bar colour for the "Combined Impact by Group" chart. */
export function groupImpactBars(impacts: SandboxGroupImpact[]) {
  return impacts.map(({ group, baselineSpend, sandboxSpend, delta }) => ({
    group: GROUP_LABELS[group],
    baselineSpend,
    sandboxSpend,
    delta,
    sandboxFill:
      delta > 0
        ? SANDBOX_INCREASE_FILL
        : delta < 0
          ? SANDBOX_DECREASE_FILL
          : SANDBOX_NEUTRAL_FILL,
  }));
}

export function spendDistributionSummary(groupImpactData: ReturnType<typeof groupImpactBars>): string {
  const increases = groupImpactData.filter((item) => item.delta > 0).map((item) => item.group);
  const decreases = groupImpactData.filter((item) => item.delta < 0).map((item) => item.group);

  const increaseText =
    increases.length > 0 ? `Increases: ${increases.join(', ')}.` : 'No group increases.';
  const decreaseText =
    decreases.length > 0 ? `Decreases: ${decreases.join(', ')}.` : 'No group decreases.';

  return `${increaseText} ${decreaseText}`;
}
