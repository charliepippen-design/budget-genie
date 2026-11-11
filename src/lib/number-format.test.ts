import { describe, expect, it } from 'vitest';
import { formatMoney } from '@/contexts/CurrencyContext';
import { formatDecimal, formatNumber } from './mediaplan-data';

describe('number formats share one style', () => {
  it('groups plain counts like money: comma thousands', () => {
    expect(formatNumber(1843)).toBe('1,843');
    expect(formatNumber(5137.4)).toBe('5,137');
    expect(formatMoney(2058, 'EUR')).toBe('€2,058');
  });

  it('groups editable prices and keeps two decimals', () => {
    expect(formatDecimal(10000)).toBe('10,000.00');
    expect(formatDecimal(4.2)).toBe('4.20');
  });
});
