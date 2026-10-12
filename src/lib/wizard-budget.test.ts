import { describe, expect, it } from 'vitest';
import { BUDGET_TIERS, defaultBudgetForTier, isValidBudget, parseBudgetInput } from './wizard-budget';

describe('wizard budget bands', () => {
  it('defaults to the lower bound of the band, inside the band', () => {
    const growing = BUDGET_TIERS.find((t) => t.key === 'growing')!;
    expect(defaultBudgetForTier(growing)).toBe(20000);
    for (const t of BUDGET_TIERS) {
      const b = defaultBudgetForTier(t);
      expect(b).toBeGreaterThanOrEqual(t.min);
      expect(b).toBeLessThanOrEqual(t.max);
    }
  });

  it('parses an exact typed budget', () => {
    expect(parseBudgetInput('32,500')).toBe(32500);
    expect(parseBudgetInput('')).toBe('');
    expect(parseBudgetInput('abc')).toBe('');
  });

  it('validates the allowed range', () => {
    expect(isValidBudget(4999)).toBe(false);
    expect(isValidBudget(5000)).toBe(true);
    expect(isValidBudget('')).toBe(false);
    expect(isValidBudget(1000001)).toBe(false);
  });
});
