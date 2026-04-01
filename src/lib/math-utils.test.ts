import { describe, expect, it } from 'vitest';
import { normalizeAllocations } from '@/lib/math-utils';

describe('normalizeAllocations', () => {
  it('keeps active channels at exactly 100%', () => {
    const normalized = normalizeAllocations([
      { id: 'a', allocationPct: 20, locked: false, isActive: true },
      { id: 'b', allocationPct: 30, locked: false, isActive: true },
      { id: 'c', allocationPct: 10, locked: false, isActive: true },
    ] as never);

    const total = normalized.reduce((sum, channel) => sum + channel.allocationPct, 0);
    expect(Number(total.toFixed(2))).toBe(100);
  });

  it('preserves inactive channel ghost values', () => {
    const normalized = normalizeAllocations([
      { id: 'a', allocationPct: 60, locked: false, isActive: true },
      { id: 'b', allocationPct: 40, locked: false, isActive: true },
      { id: 'ghost', allocationPct: 55, locked: false, isActive: false },
    ] as never);

    const ghost = normalized.find((channel) => channel.id === 'ghost');
    expect(ghost?.allocationPct).toBe(55);
  });
});
