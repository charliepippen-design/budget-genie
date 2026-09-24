import '../setup';
import { describe, it, expect } from 'vitest';
import { formatNumber, formatPercentage } from '../../src/lib/mediaplan-data';
import { calculateChannelSpends, calculatePlanMetrics } from '../../src/lib/plan-math';
import { useMediaPlanStore } from '../../src/hooks/use-media-plan-store';

describe('Phase 4: UI, Layout, and Number Formatting Polish', () => {

  describe('1. Number and Percentage Formatting Guards', () => {
    it('formatNumber handles valid, compact, and invalid NaN/Infinity values cleanly', () => {
      expect(formatNumber(12500)).toBe('12,500');
      expect(formatNumber(12500, true)).toBe('12.5K');
      expect(formatNumber(2500000, true)).toBe('2.5M');

      // NaN and Infinity safety guards
      expect(formatNumber(NaN)).toBe('0');
      expect(formatNumber(Infinity)).toBe('0');
      expect(formatNumber(-Infinity)).toBe('0');
      expect(formatNumber(null as any)).toBe('0');
      expect(formatNumber(undefined as any)).toBe('0');
    });

    it('formatPercentage handles valid, rounded, and invalid values gracefully', () => {
      expect(formatPercentage(25.46)).toBe('25.5%');
      expect(formatPercentage(0)).toBe('0.0%');

      // NaN and Infinity safety guards
      expect(formatPercentage(NaN)).toBe('0.0%');
      expect(formatPercentage(Infinity)).toBe('0.0%');
      expect(formatPercentage(null as any)).toBe('0.0%');
      expect(formatPercentage(undefined as any)).toBe('0.0%');
    });
  });

  describe('2. Negative Budget and Zero-Budget Resilience', () => {
    it('handles totalBudget = 0 without throwing, returning 0 spend and clean metrics', () => {
      const state = useMediaPlanStore.getState();
      const plan = calculatePlanMetrics(state.channels, 0, state.globalMultipliers);

      expect(plan.totalAllocatedSpend).toBe(0);
      expect(plan.blendedMetrics.totalSpend).toBe(0);
      expect(plan.blendedMetrics.totalConversions).toBe(0);
      expect(plan.blendedMetrics.blendedCpa).toBeNull();
      expect(plan.blendedMetrics.blendedRoas).toBe(0);

      // Spend map for 0 budget must give 0 to all channels
      const spendMap = calculateChannelSpends(state.channels, 0);
      state.channels.forEach(ch => {
        expect(spendMap.get(ch.id)).toBe(0);
      });
    });

    it('handles negative budget safely without producing negative spends', () => {
      const state = useMediaPlanStore.getState();
      const plan = calculatePlanMetrics(state.channels, -50000, state.globalMultipliers);

      expect(plan.totalAllocatedSpend).toBe(0);
      plan.channelsWithMetrics.forEach(ch => {
        expect(ch.metrics.spend).toBeGreaterThanOrEqual(0);
        expect(ch.allocationPct).toBe(0);
      });
    });
  });

  describe('3. Channel Allocation Bounds', () => {
    it('channel allocation setting clamps safely between 0% and 100%', () => {
      const store = useMediaPlanStore.getState();
      store.resetAll();

      const testChannelId = store.channels[0].id;

      // Negative allocation attempt
      store.setChannelAllocation(testChannelId, -25);
      const chAfterNegative = useMediaPlanStore.getState().channels.find(c => c.id === testChannelId);
      expect(chAfterNegative?.allocationPct).toBeGreaterThanOrEqual(0);

      // Over 100% allocation attempt
      store.setChannelAllocation(testChannelId, 150);
      const chAfterOver = useMediaPlanStore.getState().channels.find(c => c.id === testChannelId);
      expect(chAfterOver?.allocationPct).toBeLessThanOrEqual(100);
    });
  });

});
