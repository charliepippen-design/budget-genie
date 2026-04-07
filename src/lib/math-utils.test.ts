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

  // -------------------------------------------------------------------------
  // Regression: Bug #8 — unlocked channels zeroed out when pool > 0
  // -------------------------------------------------------------------------

  it('seeds unlocked channels equally when they are all at 0% but pool is available', () => {
    // Scenario: one channel is locked at 60%, two unlocked channels are at 0%.
    // Before the fix, unlocked channels stayed at 0% and active total would be 60%, not 100%.
    const normalized = normalizeAllocations([
      { id: 'locked', allocationPct: 60, locked: true,  isActive: true },
      { id: 'a',      allocationPct: 0,  locked: false, isActive: true },
      { id: 'b',      allocationPct: 0,  locked: false, isActive: true },
    ] as never);

    const activeTotal = normalized
      .filter((ch: { isActive: boolean }) => ch.isActive)
      .reduce((sum: number, ch: { allocationPct: number }) => sum + ch.allocationPct, 0);

    expect(Number(activeTotal.toFixed(2))).toBe(100);

    // Each unlocked channel should receive half of the remaining 40%
    const a = normalized.find((ch: { id: string }) => ch.id === 'a');
    const b = normalized.find((ch: { id: string }) => ch.id === 'b');
    expect(Number((a!.allocationPct + b!.allocationPct).toFixed(2))).toBe(40);
  });

  // -------------------------------------------------------------------------
  // Regression: locked channels preserve their exact values
  // -------------------------------------------------------------------------

  it('keeps locked channel allocation unchanged and adjusts unlocked to sum to 100%', () => {
    const normalized = normalizeAllocations([
      { id: 'locked', allocationPct: 30, locked: true,  isActive: true },
      { id: 'a',      allocationPct: 40, locked: false, isActive: true },
      { id: 'b',      allocationPct: 40, locked: false, isActive: true },
    ] as never);

    const locked = normalized.find((ch: { id: string }) => ch.id === 'locked');
    expect(locked?.allocationPct).toBe(30);

    const activeTotal = normalized
      .filter((ch: { isActive: boolean }) => ch.isActive)
      .reduce((sum: number, ch: { allocationPct: number }) => sum + ch.allocationPct, 0);
    expect(Number(activeTotal.toFixed(2))).toBe(100);
  });

  // -------------------------------------------------------------------------
  // Precision: many channels must still sum to exactly 100.00%
  // -------------------------------------------------------------------------

  it('sums to exactly 100.00% with 7 uneven channels (Largest Remainder precision)', () => {
    const channels = [
      { id: '1', allocationPct: 14.3, locked: false, isActive: true },
      { id: '2', allocationPct: 14.3, locked: false, isActive: true },
      { id: '3', allocationPct: 14.3, locked: false, isActive: true },
      { id: '4', allocationPct: 14.3, locked: false, isActive: true },
      { id: '5', allocationPct: 14.3, locked: false, isActive: true },
      { id: '6', allocationPct: 14.3, locked: false, isActive: true },
      { id: '7', allocationPct: 14.2, locked: false, isActive: true },
    ] as never;

    const normalized = normalizeAllocations(channels);
    const total = normalized.reduce((sum: number, ch: { allocationPct: number }) => sum + ch.allocationPct, 0);
    expect(Number(total.toFixed(2))).toBe(100);
  });

  // -------------------------------------------------------------------------
  // Edge: all channels inactive — should return unchanged
  // -------------------------------------------------------------------------

  it('returns channels unchanged when all are inactive', () => {
    const input = [
      { id: 'a', allocationPct: 50, locked: false, isActive: false },
      { id: 'b', allocationPct: 50, locked: false, isActive: false },
    ] as never;
    const result = normalizeAllocations(input);
    expect(result[0].allocationPct).toBe(50);
    expect(result[1].allocationPct).toBe(50);
  });
});
