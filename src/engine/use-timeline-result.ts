import { getEngine } from './registry';
import { selectEngineInput, type EngineSource } from './input';
import type { TimelineInput, TimelineResult } from './timeline';
import { selectTimelineInput, type TimelineSource } from './timeline-input';

// The live hook lives next to the store (it reads it); re-exported here so screens import from '@/engine'.
export { useTimelineResult } from '@/hooks/use-multi-month-store';
export { selectTimelineInput };

/** Computes the timeline with the active engine outside React (store actions, exports, tests). */
export function computeTimelineResult(
  plan: EngineSource,
  timeline: TimelineSource,
  redistribute?: TimelineInput['redistribute']
): TimelineResult {
  return getEngine().computeTimeline(selectEngineInput(plan), {
    ...selectTimelineInput(timeline),
    redistribute,
  });
}
