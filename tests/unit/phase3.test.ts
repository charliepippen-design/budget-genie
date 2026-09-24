import '../setup';
import { describe, it, expect } from 'vitest';
import {
  calculateArbitrageConfidence,
  selectArbitrageCandidates,
  calculateLifetimeGgrWithChurn,
  evaluateBenchmarkComparison,
} from '../../src/lib/plan-math';
import { useMultiMonthStore } from '../../src/hooks/use-multi-month-store';

describe('Phase 3: Insights, Tabs, and Cross-Widget Consistency', () => {

  describe('1. Arbitrage Confidence Calculation', () => {
    it('confidence must stay strictly between 50% and 99% and never explode (e.g. 581%)', () => {
      // Moderate spread
      const conf1 = calculateArbitrageConfidence(4.0, 1.5);
      expect(conf1).toBeGreaterThanOrEqual(50);
      expect(conf1).toBeLessThanOrEqual(99);

      // Extreme spread (15x vs 0.5x, previously produced 581%)
      const confExtreme = calculateArbitrageConfidence(15.0, 0.5);
      expect(confExtreme).toBeGreaterThanOrEqual(50);
      expect(confExtreme).toBeLessThanOrEqual(99);
      expect(confExtreme).not.toBe(581);

      // Zero spread
      const confZero = calculateArbitrageConfidence(2.0, 2.0);
      expect(confZero).toBe(50);
    });
  });

  describe('2. Arbitrage vs. Saturation Consistency', () => {
    it('arbitrage winner must NOT be a channel that is already saturated or near ceiling (>=80%)', () => {
      const mockChannels: any[] = [
        {
          id: 'ch-low',
          name: 'Bleeding Channel',
          isActive: true,
          locked: false,
          buyingModel: 'CPM',
          allocationPct: 30,
          typeConfig: { baselineMetrics: { saturationCeiling: 50000 } },
          metrics: { spend: 10000, roas: 1.0 },
        },
        {
          id: 'ch-saturated-high-roas',
          name: 'Saturated Superstar',
          isActive: true,
          locked: false,
          buyingModel: 'CPC',
          allocationPct: 50,
          typeConfig: { baselineMetrics: { saturationCeiling: 20000 } },
          // Spend is 22000 / 20000 = 110% of ceiling!
          metrics: { spend: 22000, roas: 6.0 },
        },
        {
          id: 'ch-growth-healthy',
          name: 'Healthy Scalable Channel',
          isActive: true,
          locked: false,
          buyingModel: 'CPC',
          allocationPct: 20,
          typeConfig: { baselineMetrics: { saturationCeiling: 40000 } },
          // Spend is 8000 / 40000 = 20% of ceiling
          metrics: { spend: 8000, roas: 4.5 },
        },
      ];

      const { winner, loser, arbitragePossible } = selectArbitrageCandidates(mockChannels, 2.5);

      expect(arbitragePossible).toBe(true);
      expect(loser?.id).toBe('ch-low');
      // Must NOT pick 'ch-saturated-high-roas' as winner because it is saturated!
      expect(winner?.id).toBe('ch-growth-healthy');
    });
  });

  describe('3. Deal Evaluator: Churn-Decayed Lifetime GGR vs Linear Undiscounted', () => {
    it('churn decay must produce realistic player LTV rather than flat linear multiple', () => {
      const monthlyGgr = 55;
      const churnRatePct = 16.67; // approx 6 months lifespan
      const lifespanMonths = 6;

      const linearGgr = monthlyGgr * lifespanMonths; // 330
      const decayedGgr = calculateLifetimeGgrWithChurn(monthlyGgr, churnRatePct, lifespanMonths);

      // Decayed GGR should be ~219.4 EUR
      expect(decayedGgr).toBeLessThan(linearGgr);
      expect(decayedGgr).toBeCloseTo(219.4, 0);
    });
  });

  describe('4. Industry Benchmarks: Tolerance Band and Realistic CPA Bounds', () => {
    it('returns "in_line" when plan metric is within +-2.5% of benchmark', () => {
      const res = evaluateBenchmarkComparison(101.5, 100.0, false);
      expect(res.status).toBe('in_line');
    });

    it('returns "unrealistic" when CPA is >70% below industry benchmark', () => {
      // Casino benchmark CPA is 220. Plan CPA is 25 (88% below).
      const res = evaluateBenchmarkComparison(25, 220, true);
      expect(res.status).toBe('unrealistic');
      expect(res.badgeText).toContain('Verify Data');
    });
  });

  describe('5. Multi-Month Planning: Initialized Months', () => {
    it('store should initialize with populated months array, not empty []', () => {
      const store = useMultiMonthStore.getState();
      expect(store.months.length).toBeGreaterThan(0);
      expect(store.months[0].channels.length).toBeGreaterThan(0);
    });
  });

});
