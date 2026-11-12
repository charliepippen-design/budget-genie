import type { PlanEngine } from './contract';
import { placeholderEngine } from './placeholder-engine';
import { responseCurveEngine } from './v1';

// The one place that decides which engine computes the plan. Plugging in the real engine is a
// single setEngine() call at startup; every screen then shows its numbers.

/** Every engine the app can run, by id. The placeholder is the default; the others are opt-in. */
export const engines: Record<string, PlanEngine> = {
  [placeholderEngine.id]: placeholderEngine,
  [responseCurveEngine.id]: responseCurveEngine,
};

/** Where the dev/QA switch is stored: `localStorage['mediaplan-engine'] = 'response-curve'`. */
export const ENGINE_STORAGE_KEY = 'mediaplan-engine';

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

/** Swaps to the engine with this id. Returns false (and changes nothing) for an unknown id. */
export function setEngineById(id: string): boolean {
  const engine = Object.prototype.hasOwnProperty.call(engines, id) ? engines[id] : undefined;
  if (!engine) return false;
  setEngine(engine);
  return true;
}

/**
 * Dev/QA switch, read once at startup: selects the engine named in localStorage, if any.
 * Without the key (every customer today) the default engine stays. Returns the active engine id.
 */
export function selectEngineFromStorage(): string {
  try {
    const id = typeof localStorage === 'undefined' ? null : localStorage.getItem(ENGINE_STORAGE_KEY);
    if (id) setEngineById(id);
  } catch {
    // Storage can be blocked (private mode, embedded frames): keep the default engine.
  }
  return activeEngine.id;
}

/** For useSyncExternalStore: notifies subscribers when the engine is swapped. */
export function subscribeEngine(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
