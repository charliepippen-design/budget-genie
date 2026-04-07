import { describe, expect, it } from 'vitest';
import {
  calculateDistribution,
  DISTRIBUTION_CONFIG,
  type DistributionStrategy,
} from '@/lib/distribution-logic';

type InputChannel = { id: string; category: string; family?: string; name: string };

function makeChannel({ id, category, family, name }: InputChannel): InputChannel {
  return { id, category, family, name };
}

describe('calculateDistribution', () => {
  it('balanced strategy produces equal allocations across all channels', () => {
    const channels = [
      makeChannel({ id: 'ch1', category: 'Paid Social', family: 'paid_media', name: 'Channel A' }),
      makeChannel({ id: 'ch2', category: 'Affiliate', family: 'affiliate', name: 'Channel B' }),
      makeChannel({ id: 'ch3', category: 'SEO/Content', family: 'seo_content', name: 'Channel C' }),
    ];

    const allocations = calculateDistribution(channels, 'balanced');
    const values = Object.values(allocations);

    expect(values).toHaveLength(3);
    expect(Math.abs(values[0] - values[1])).toBeLessThanOrEqual(0.01);
    expect(Math.abs(values[1] - values[2])).toBeLessThanOrEqual(0.01);
  });

  it('affiliate_dominant gives affiliate channels higher allocation than non-affiliate', () => {
    const channels = [
      makeChannel({
        id: 'affiliate-partner',
        category: 'Paid Social',
        family: 'affiliate',
        name: 'Affiliate Ops',
      }),
      makeChannel({
        id: 'social-ads',
        category: 'Paid Social',
        family: 'paid_media',
        name: 'Social Ads',
      }),
    ];

    const allocations = calculateDistribution(channels, 'affiliate_dominant');

    expect(allocations['affiliate-partner']).toBeGreaterThan(allocations['social-ads']);
  });

  it('conversion_max gives retargeting and push more weight than brand and SEO', () => {
    const channels = [
      makeChannel({
        id: 'retargeting-1',
        category: 'Display/Programmatic',
        family: 'paid_media',
        name: 'Retargeting Cluster',
      }),
      makeChannel({
        id: 'push-1',
        category: 'Display/Programmatic',
        family: 'paid_media',
        name: 'Push Notifications',
      }),
      makeChannel({
        id: 'brand-1',
        category: 'Paid Social',
        family: 'pr_brand',
        name: 'Brand Awareness',
      }),
      makeChannel({
        id: 'seo-1',
        category: 'SEO/Content',
        family: 'seo_content',
        name: 'SEO Foundation',
      }),
    ];

    const allocations = calculateDistribution(channels, 'conversion_max');

    expect(allocations['retargeting-1']).toBeGreaterThan(allocations['brand-1']);
    expect(allocations['push-1']).toBeGreaterThan(allocations['seo-1']);
  });

  it('single active channel gets 100% regardless of strategy', () => {
    const channels = [
      makeChannel({ id: 'only', category: 'Affiliate', family: 'affiliate', name: 'Only Channel' }),
    ];

    const strategies = Object.keys(DISTRIBUTION_CONFIG.strategies) as DistributionStrategy[];

    strategies.forEach((strategy) => {
      const allocations = calculateDistribution(channels, strategy);
      expect(allocations.only).toBe(100);
    });
  });

  it('two channels with equal weights get 50% each', () => {
    const channels = [
      makeChannel({ id: 'a', category: 'Paid Social', family: 'paid_media', name: 'Alpha' }),
      makeChannel({ id: 'b', category: 'Paid Search', family: 'paid_media', name: 'Beta' }),
    ];

    const allocations = calculateDistribution(channels, 'balanced');

    expect(allocations.a).toBe(50);
    expect(allocations.b).toBe(50);
  });

  it('all strategies produce allocations summing to 100 (toFixed(2))', () => {
    const channels = [
      makeChannel({ id: 's1', category: 'Paid Social', family: 'paid_media', name: 'Social' }),
      makeChannel({ id: 'a1', category: 'Affiliate', family: 'affiliate', name: 'Affiliate' }),
      makeChannel({
        id: 'd1',
        category: 'Display/Programmatic',
        family: 'paid_media',
        name: 'Display',
      }),
      makeChannel({ id: 'seo1', category: 'SEO/Content', family: 'seo_content', name: 'SEO' }),
    ];

    const strategies = Object.keys(DISTRIBUTION_CONFIG.strategies) as DistributionStrategy[];

    strategies.forEach((strategy) => {
      const allocations = calculateDistribution(channels, strategy);
      const total = Object.values(allocations).reduce((sum, v) => sum + v, 0);
      expect(Number(total.toFixed(2))).toBe(100);
    });
  });

  it('matches category/family keys case-insensitively', () => {
    const channels = [
      makeChannel({
        id: 'lower-aff',
        category: 'affiliate',
        family: 'affiliate',
        name: 'lower affiliate',
      }),
      makeChannel({
        id: 'plain',
        category: 'Paid Search',
        family: 'paid_media',
        name: 'plain search',
      }),
    ];

    const allocations = calculateDistribution(channels, 'affiliate_dominant');

    expect(allocations['lower-aff']).toBeGreaterThan(allocations.plain);
  });

  it('uses default weight 1 when no weight key matches category or family', () => {
    const channels = [
      makeChannel({
        id: 'unknown',
        category: 'Mystery Category',
        family: 'mystery',
        name: 'Unknown Channel',
      }),
      makeChannel({
        id: 'seo',
        category: 'SEO/Content',
        family: 'seo_content',
        name: 'SEO Standard',
      }),
    ];

    const allocations = calculateDistribution(channels, 'affiliate_dominant');

    expect(Math.abs(allocations.unknown - allocations.seo)).toBeLessThanOrEqual(0.01);
  });
});
