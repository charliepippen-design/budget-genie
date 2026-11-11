import type { PlanEngine } from './contract';
import { placeholderEngine } from './placeholder-engine';

// The one place that decides which engine computes the plan. Plugging in the real engine is a
// single setEngine() call at startup; every screen then shows its numbers.

let activeEngine: PlanEngine = placeholderEngine;
const listeners = new Set<() => void>();

export function getEngine(): PlanEngine {
  return activeEngine;
}

/** Swaps the engine for the whole app. Screens recompute on the next render. */
export function setEngine(engine: PlanEngine): void {
  activeEngine = engine;
  listeners.forEach((listener) => listener());
}

/** For useSyncExternalStore: notifies subscribers when the engine is swapped. */
export function subscribeEngine(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
