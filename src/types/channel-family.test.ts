import { describe, expect, it } from 'vitest';
import { inferChannelFamily } from './channel';
import { createInitialChannels } from '@/lib/media-plan/defaults';
import { VERTICAL_PRESETS } from '@/lib/vertical-presets';

// N-6: a bare `includes('pr')` classified "Programmatic", "Premium", "Promo"... as PR/brand.
describe('inferChannelFamily word boundaries (N-6)', () => {
  it.each([
    ['Paid - Programmatic / Display', 'paid_media'],
    ['Display / Programmatic', 'paid_media'],
    ['Premium Display', 'paid_media'],
    ['Spring Promo Push', 'paid_media'],
    ['Price Comparison Ads', 'paid_media'],
    ['PR Outreach', 'pr_brand'],
    ['Digital PR', 'pr_brand'],
    ['PR / Brand Awareness', 'pr_brand'],
    ['Brand Search', 'pr_brand'],
  ] as const)('%s -> %s', (name, family) => {
    expect(inferChannelFamily(name)).toBe(family);
  });

  it('no seeded channel name is misread as PR just for containing "pr"', () => {
    const seeded = [
      ...createInitialChannels().map((c) => c.name),
      ...Object.values(VERTICAL_PRESETS).flatMap((p) => p.channels.map((c) => c.name)),
    ];
    expect(seeded.length).toBeGreaterThan(10);
    for (const name of seeded) {
      const lower = name.toLowerCase();
      if (/\bpr\b/.test(lower) || lower.includes('brand')) continue;
      expect(inferChannelFamily(name), name).not.toBe('pr_brand');
    }
  });
});
