import { describe, expect, it } from 'vitest';
import { filterBannedClaims } from './claims-filter';

describe('filterBannedClaims', () => {
  it('drops the exact sentence from the review screenshot', () => {
    const text = 'Start with search. This plan will secure guaranteed acquisitions at controlled costs. Test weekly.';
    expect(filterBannedClaims(text)).toBe('Start with search. Test weekly.');
    expect(filterBannedClaims('This plan will secure guaranteed acquisitions at controlled costs.')).toBe('');
  });

  it('drops other promise styles', () => {
    expect(filterBannedClaims('This is risk-free! Returns are assured. Get 100% ROI. Certain returns await.')).toBe('');
  });

  it('keeps neutral sentences', () => {
    const text = 'Search captures existing demand. Review CPA after two weeks.';
    expect(filterBannedClaims(text)).toBe(text);
  });

  it('handles Italian', () => {
    expect(filterBannedClaims('Inizia con la ricerca. Otterrai acquisizioni sicure. Risultato garantito. Operi senza rischi.')).toBe(
      'Inizia con la ricerca.',
    );
  });

  it('handles empty input', () => {
    expect(filterBannedClaims(undefined)).toBe('');
    expect(filterBannedClaims('')).toBe('');
  });
});
