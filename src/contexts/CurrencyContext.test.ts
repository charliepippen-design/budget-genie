import { describe, expect, it } from 'vitest';
import { formatMoney } from './CurrencyContext';

describe('formatMoney', () => {
  it('puts the sign before the symbol in compact form', () => {
    expect(formatMoney(-12300, 'EUR', true)).toBe('-€12.3K');
    expect(formatMoney(-2500000, 'USD', true)).toBe('-$2.5M');
  });
  it('keeps positives and small values unchanged', () => {
    expect(formatMoney(12300, 'EUR', true)).toBe('€12.3K');
    expect(formatMoney(-500, 'EUR', true)).toBe('-€500');
  });
  it('full format renders the sign first', () => {
    expect(formatMoney(-14062, 'EUR')).toBe('-€14,062');
  });
});
