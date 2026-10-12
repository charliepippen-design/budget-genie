import { describe, it, expect } from 'vitest';
import {
  defaultModelForCategory,
  modelChoicesForCategory,
  parsePriceInput,
  sanitizePriceInput,
} from './add-channel-form';
import type { ChannelCategory } from './mediaplan-data';

describe('modelChoicesForCategory', () => {
  it.each(['Paid Search', 'Paid Social', 'Display/Programmatic'] as ChannelCategory[])(
    'offers CPC for %s',
    (cat) => {
      expect(modelChoicesForCategory(cat)).toContain('CPC');
    }
  );

  it('does not offer CPC for affiliates', () => {
    expect(modelChoicesForCategory('Affiliate')).not.toContain('CPC');
  });
});

describe('defaultModelForCategory', () => {
  const cats: ChannelCategory[] = [
    'Paid Search',
    'Paid Social',
    'Display/Programmatic',
    'Affiliate',
    'SEO/Content',
    'Offline/TV',
    'Email/SMS',
    'Other',
  ];
  it.each(cats)('is a valid choice for %s', (cat) => {
    expect(modelChoicesForCategory(cat)).toContain(defaultModelForCategory(cat));
  });

  it('defaults search to CPC and affiliate to CPA', () => {
    expect(defaultModelForCategory('Paid Search')).toBe('CPC');
    expect(defaultModelForCategory('Affiliate')).toBe('CPA');
  });
});

describe('price input', () => {
  it('keeps intermediate typing states intact', () => {
    expect(sanitizePriceInput('0')).toBe('0');
    expect(sanitizePriceInput('0.')).toBe('0.');
    expect(sanitizePriceInput('0.5')).toBe('0.5');
    expect(sanitizePriceInput('1.5')).toBe('1.5');
  });

  it('strips invalid characters and extra separators', () => {
    expect(sanitizePriceInput('-1')).toBe('1');
    expect(sanitizePriceInput('1.2.3')).toBe('1.23');
    expect(sanitizePriceInput('1,5')).toBe('1.5');
    expect(sanitizePriceInput('abc')).toBe('');
  });

  it('parses valid values and rejects invalid ones', () => {
    expect(parsePriceInput('0.5')).toEqual({ value: 0.5, error: null });
    expect(parsePriceInput('1.')).toEqual({ value: 1, error: null });
    expect(parsePriceInput('').error).toBeTruthy();
    expect(parsePriceInput('.').error).toBeTruthy();
    expect(parsePriceInput('0').error).toBeTruthy();
  });
});
