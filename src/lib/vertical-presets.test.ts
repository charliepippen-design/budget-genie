import { describe, expect, it } from 'vitest';
import { VERTICAL_PRESETS, type Vertical } from '@/lib/vertical-presets';

describe('VERTICAL_PRESETS', () => {
  it('has allocations summing to 100 for every vertical', () => {
    (Object.keys(VERTICAL_PRESETS) as Vertical[]).forEach((vertical) => {
      const total = VERTICAL_PRESETS[vertical].channels.reduce(
        (sum, channel) => sum + channel.allocationPct,
        0
      );
      expect(total).toBeCloseTo(100, 6);
    });
  });

  it('uses non-negative default benchmark values', () => {
    (Object.keys(VERTICAL_PRESETS) as Vertical[]).forEach((vertical) => {
      const preset = VERTICAL_PRESETS[vertical];
      expect(preset.defaultPlayerValue).toBeGreaterThan(0);
      expect(preset.defaultCpaTarget).toBeGreaterThan(0);
      expect(preset.defaultRoasTarget).toBeGreaterThan(0);
    });
  });

  it('defines valid non-negative channel pricing and allocation', () => {
    (Object.keys(VERTICAL_PRESETS) as Vertical[]).forEach((vertical) => {
      VERTICAL_PRESETS[vertical].channels.forEach((channel) => {
        expect(channel.allocationPct).toBeGreaterThanOrEqual(0);
        expect(channel.typeConfig.price).toBeGreaterThanOrEqual(0);
      });
    });
  });
});
