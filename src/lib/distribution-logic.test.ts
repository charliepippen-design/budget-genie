import { describe, expect, it } from 'vitest';
import { calculateDistribution } from '@/lib/distribution-logic';

describe('distribution strategy engine', () => {
  it('returns allocations that sum to 100 for balanced strategy', () => {
    const allocations = calculateDistribution(
      [
        { id: 'paid-search', category: 'Paid Search', name: 'Paid Search' },
        { id: 'affiliate-cpa', category: 'Affiliate', name: 'Affiliate CPA' },
        { id: 'seo-content', category: 'SEO/Content', name: 'SEO Content' },
      ],
      'balanced'
    );

    const total = Object.values(allocations).reduce((sum, value) => sum + value, 0);
    expect(Number(total.toFixed(2))).toBe(100);
  });

  it('biases affiliate channel for affiliate_dominant strategy', () => {
    const allocations = calculateDistribution(
      [
        { id: 'paid-search', category: 'Paid Search', name: 'Paid Search' },
        { id: 'affiliate-cpa', category: 'Affiliate', name: 'Affiliate CPA' },
      ],
      'affiliate_dominant'
    );

    expect(allocations['affiliate-cpa']).toBeGreaterThan(allocations['paid-search']);
  });
});
