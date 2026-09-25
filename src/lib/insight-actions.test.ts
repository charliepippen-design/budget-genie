import { describe, expect, it } from 'vitest';
import { planAutoFixAllocation, planReallocation } from '@/lib/insight-actions';

const ch = (id: string, allocationPct: number, locked = false) => ({ id, allocationPct, locked });

describe('planReallocation', () => {
  it('moves 20% of the loser to the winner and touches nothing else', () => {
    expect(planReallocation(ch('win', 30), ch('lose', 40))).toEqual({ lose: 32, win: 38 });
  });

  it('keeps the two-channel total unchanged', () => {
    const out = planReallocation(ch('win', 12.5), ch('lose', 7.5))!;
    expect(out.win + out.lose).toBeCloseTo(20);
  });

  it('refuses when either channel is locked', () => {
    expect(planReallocation(ch('win', 30, true), ch('lose', 40))).toBeNull();
    expect(planReallocation(ch('win', 30), ch('lose', 40, true))).toBeNull();
  });
});

describe('planAutoFixAllocation', () => {
  it('cuts the flagged channel by 10%', () => {
    expect(planAutoFixAllocation(ch('a', 40))).toBeCloseTo(36);
  });

  it('refuses locked or empty channels', () => {
    expect(planAutoFixAllocation(ch('a', 40, true))).toBeNull();
    expect(planAutoFixAllocation(ch('a', 0))).toBeNull();
  });
});
