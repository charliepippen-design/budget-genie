import '../setup';
import { describe, it, expect, beforeEach } from 'vitest';
import { useMediaPlanStore } from '../../src/hooks/use-media-plan-store';
import { useBudgetEngine, setPlanBudget } from '../../src/hooks/use-budget-engine';
import { calculateUnifiedMetrics } from '../../src/types/channel';
import { calculatePlanMetrics } from '../../src/lib/plan-math';

describe('Phase 1: Mathematical Foundations & Consistency', () => {
  beforeEach(() => {
    // Reset store state to initial
    const store = useMediaPlanStore.getState();
    store.resetAll();
    // Re-initialize channels to clean defaults
    useMediaPlanStore.setState({
      totalBudget: 50000,
      globalMultipliers: {
        spendMultiplier: 1.0,
        defaultCpmOverride: null,
        ctrBump: 0,
        cpaTarget: null,
        roasTarget: null,
        playerValue: 150,
      }
    });
  });

  describe('1. Allocation Percentages & Row Spend', () => {
    it('each row percentage must equal row spend divided by total budget', () => {
      const state = useMediaPlanStore.getState();
      const plan = calculatePlanMetrics(state.channels, state.totalBudget, state.globalMultipliers);
      
      plan.channelsWithMetrics.forEach(ch => {
        const expectedPct = (ch.metrics.spend / state.totalBudget) * 100;
        expect(ch.allocationPct).toBeCloseTo(expectedPct, 4);
      });
    });

    it('sum of row percentages must equal 100% when fully allocated', () => {
      const state = useMediaPlanStore.getState();
      const plan = calculatePlanMetrics(state.channels, state.totalBudget, state.globalMultipliers);
      const totalPct = plan.channelsWithMetrics.reduce((sum, ch) => sum + ch.allocationPct, 0);
      expect(totalPct).toBeCloseTo(100.0, 2);
    });
  });

  describe('2. Single Source of Truth for Spend & KPI Identities', () => {
    it('total spend must equal the sum of channel row spends', () => {
      const state = useMediaPlanStore.getState();
      const plan = calculatePlanMetrics(state.channels, state.totalBudget, state.globalMultipliers);
      
      const sumRowSpend = plan.channelsWithMetrics.reduce((sum, ch) => sum + ch.metrics.spend, 0);
      
      expect(plan.blendedMetrics.totalSpend).toBeCloseTo(sumRowSpend, 4);
      expect(plan.blendedMetrics.totalSpend).toBeCloseTo(state.totalBudget, 4);
    });

    it('KPI identities hold: CPA = spend/conversions, ROAS = revenue/spend', () => {
      const state = useMediaPlanStore.getState();
      const plan = calculatePlanMetrics(state.channels, state.totalBudget, state.globalMultipliers);
      const { totalSpend, totalConversions, projectedRevenue, blendedCpa, blendedRoas } = plan.blendedMetrics;

      if (totalConversions > 0 && blendedCpa !== null) {
        expect(blendedCpa * totalConversions).toBeCloseTo(totalSpend, 2);
      }
      if (totalSpend > 0) {
        expect(blendedRoas * totalSpend).toBeCloseTo(projectedRevenue, 2);
      }
    });
  });

  describe('3. Scaling as a Pure Function (50k -> 100k -> 50k)', () => {
    it('scaling 50k -> 100k -> 50k gives identical starting numbers without mutation drift', () => {
      const store = useMediaPlanStore.getState();
      store.resetAll();
      const initialBudget = 50000;
      setPlanBudget(initialBudget);

      const startPlan = calculatePlanMetrics(
        useMediaPlanStore.getState().channels,
        50000,
        useMediaPlanStore.getState().globalMultipliers
      );

      // Scale to 100k
      setPlanBudget(100000);
      const scaledPlan = calculatePlanMetrics(
        useMediaPlanStore.getState().channels,
        100000,
        useMediaPlanStore.getState().globalMultipliers
      );
      expect(scaledPlan.blendedMetrics.totalSpend).toBeCloseTo(100000, 2);

      // Scale back to 50k
      setPlanBudget(50000);
      const returnedPlan = calculatePlanMetrics(
        useMediaPlanStore.getState().channels,
        50000,
        useMediaPlanStore.getState().globalMultipliers
      );

      // Verify every channel and blended metric is bitwise identical
      expect(returnedPlan.blendedMetrics.totalSpend).toBeCloseTo(startPlan.blendedMetrics.totalSpend, 4);
      expect(returnedPlan.blendedMetrics.totalConversions).toBeCloseTo(startPlan.blendedMetrics.totalConversions, 4);
      expect(returnedPlan.blendedMetrics.projectedRevenue).toBeCloseTo(startPlan.blendedMetrics.projectedRevenue, 4);
      expect(returnedPlan.blendedMetrics.blendedCpa).toBeCloseTo(startPlan.blendedMetrics.blendedCpa!, 4);
      expect(returnedPlan.blendedMetrics.blendedRoas).toBeCloseTo(startPlan.blendedMetrics.blendedRoas, 4);

      returnedPlan.channelsWithMetrics.forEach((ch, idx) => {
        const startCh = startPlan.channelsWithMetrics[idx];
        expect(ch.metrics.spend).toBeCloseTo(startCh.metrics.spend, 4);
        expect(ch.metrics.conversions).toBeCloseTo(startCh.metrics.conversions, 4);
        expect(ch.metrics.revenue).toBeCloseTo(startCh.metrics.revenue, 4);
      });
    });
  });

  describe('4. Diminishing Returns & Monotonic CPA', () => {
    it('CPA must be monotonic non-decreasing as budget scales for a fixed mix', () => {
      const chConfig = {
        family: 'paid_media' as const,
        buyingModel: 'CPM' as const,
        price: 2.0,
        secondaryPrice: 0,
        baselineMetrics: {
          ctr: 1.5,
          conversionRate: 2.5,
          saturationCeiling: 20000,
        }
      };

      const spends = [5000, 10000, 20000, 40000, 80000];
      let previousCpa = 0;

      spends.forEach(spend => {
        const metrics = calculateUnifiedMetrics(chConfig, spend, 150);
        expect(metrics.cpa).not.toBeNull();
        if (previousCpa > 0) {
          // CPA should increase or stay flat, never decrease
          expect(metrics.cpa!).toBeGreaterThanOrEqual(previousCpa - 0.001);
        }
        previousCpa = metrics.cpa!;
      });
    });

    it('Revenue per conversion (LTV) must remain constant across saturation', () => {
      const playerLtv = 150;
      const chConfig = {
        family: 'paid_media' as const,
        buyingModel: 'CPM' as const,
        price: 2.0,
        secondaryPrice: 0,
        baselineMetrics: {
          ctr: 1.5,
          conversionRate: 2.5,
          saturationCeiling: 20000,
        }
      };

      [5000, 20000, 50000].forEach(spend => {
        const metrics = calculateUnifiedMetrics(chConfig, spend, playerLtv);
        if (metrics.ftds > 0) {
          const revPerConv = metrics.revenue / metrics.ftds;
          expect(revPerConv).toBeCloseTo(playerLtv, 1);
        }
      });
    });
  });

  describe('5. Undo/Redo Restores Full State & Recalculates KPIs', () => {
    it('undo restores exact starting KPIs and state', async () => {
      const { useHistoryStore } = await import('../../src/hooks/use-history');
      const store = useMediaPlanStore.getState();
      store.resetAll();
      setPlanBudget(50000);

      // Record baseline
      useHistoryStore.getState().record({
        totalBudget: 50000,
        channels: store.channels,
        globalMultipliers: store.globalMultipliers,
      });

      const initialPlan = calculatePlanMetrics(
        useMediaPlanStore.getState().channels,
        50000,
        useMediaPlanStore.getState().globalMultipliers
      );

      // Mutate to 100k
      setPlanBudget(100000);

      // Undo back to 50k
      useHistoryStore.getState().undo();

      const restoredPlan = calculatePlanMetrics(
        useMediaPlanStore.getState().channels,
        useMediaPlanStore.getState().totalBudget,
        useMediaPlanStore.getState().globalMultipliers
      );

      expect(restoredPlan.blendedMetrics.totalSpend).toBeCloseTo(initialPlan.blendedMetrics.totalSpend, 4);
      expect(restoredPlan.blendedMetrics.blendedCpa).toBeCloseTo(initialPlan.blendedMetrics.blendedCpa!, 4);
      expect(restoredPlan.blendedMetrics.blendedRoas).toBeCloseTo(initialPlan.blendedMetrics.blendedRoas, 4);
      expect(restoredPlan.blendedMetrics.totalConversions).toBeCloseTo(initialPlan.blendedMetrics.totalConversions, 4);
    });
  });

  describe('6. Category Totals and Plan Consistency', () => {
    it('category percentages sum exactly to total allocation percentage', () => {
      const state = useMediaPlanStore.getState();
      const plan = calculatePlanMetrics(state.channels, state.totalBudget, state.globalMultipliers);
      const categorySumPct = Object.values(plan.categoryTotals).reduce((sum, cat) => sum + cat.percentage, 0);
      expect(categorySumPct).toBeCloseTo(plan.totalAllocationPct, 4);
    });

    it('category spend sum exactly equals total allocated spend', () => {
      const state = useMediaPlanStore.getState();
      const plan = calculatePlanMetrics(state.channels, state.totalBudget, state.globalMultipliers);
      const categorySumSpend = Object.values(plan.categoryTotals).reduce((sum, cat) => sum + cat.spend, 0);
      expect(categorySumSpend).toBeCloseTo(plan.totalAllocatedSpend, 4);
    });
  });
});

