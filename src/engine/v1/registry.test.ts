import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ENGINE_STORAGE_KEY,
  engines,
  getEngine,
  placeholderEngine,
  responseCurveEngine,
  selectEngineFromStorage,
  setEngine,
  setEngineById,
  subscribeEngine,
} from '@/engine';
import { inputFor } from './testing';

describe('engine selection', () => {
  beforeEach(() => {
    localStorage.clear();
    setEngine(placeholderEngine);
  });
  afterEach(() => {
    localStorage.clear();
    setEngine(placeholderEngine);
  });

  it('the placeholder is the default and both engines are registered by id', () => {
    expect(getEngine()).toBe(placeholderEngine);
    expect(engines.placeholder).toBe(placeholderEngine);
    expect(engines['response-curve']).toBe(responseCurveEngine);
    expect(responseCurveEngine.id).toBe('response-curve');
    expect(responseCurveEngine.version).toBe('1.0.0');
    expect(typeof responseCurveEngine.optimise).toBe('function');
    expect(placeholderEngine.optimise).toBeUndefined();
  });

  it('setEngineById switches engines and notifies subscribers; unknown ids change nothing', () => {
    let notified = 0;
    const unsubscribe = subscribeEngine(() => {
      notified += 1;
    });
    expect(setEngineById('response-curve')).toBe(true);
    expect(getEngine()).toBe(responseCurveEngine);
    expect(notified).toBe(1);
    expect(setEngineById('nope')).toBe(false);
    expect(setEngineById('toString')).toBe(false);
    expect(getEngine()).toBe(responseCurveEngine);
    expect(notified).toBe(1);
    unsubscribe();
  });

  it('the startup switch reads localStorage: no key keeps the default, a known id selects it', () => {
    expect(selectEngineFromStorage()).toBe('placeholder');
    expect(getEngine()).toBe(placeholderEngine);

    localStorage.setItem(ENGINE_STORAGE_KEY, 'not-an-engine');
    expect(selectEngineFromStorage()).toBe('placeholder');

    localStorage.setItem(ENGINE_STORAGE_KEY, 'response-curve');
    expect(ENGINE_STORAGE_KEY).toBe('mediaplan-engine');
    expect(selectEngineFromStorage()).toBe('response-curve');
    expect(getEngine()).toBe(responseCurveEngine);
  });

  it('the placeholder leaves the new optional fields undefined', () => {
    const result = placeholderEngine.compute(inputFor({ industry: 'igaming', monthlyBudget: 60_000, markets: ['DE'] }));
    expect(result.ranges).toBeUndefined();
    expect('ranges' in result).toBe(false);
  });
});
