import '../setup';
import { describe, it, expect, beforeEach } from 'vitest';
import { useMediaPlanStore } from '../../src/hooks/use-media-plan-store';
import { calculateUnifiedMetrics, ChannelTypeConfig } from '../../src/types/channel';
import { calculatePlanMetrics, calculateSingleChannelMetrics } from '../../src/lib/plan-math';

describe('Phase 2: Value Model per Channel (Funnel, Deductions, LTV, Pricing)', () => {
  beforeEach(() => {
    const store = useMediaPlanStore.getState();
    store.resetAll();
  });

  describe('1. Full Conversion Funnel: Click -> Registration -> FTD', () => {
    it('calculates registrations, FTDs, CPL, and CPA accurately through the funnel', () => {
      const config: ChannelTypeConfig = {
        family: 'paid_media',
        buyingModel: 'CPC',
        price: 1.0, // €1.00 per click
        baselineMetrics: {
          clickToReg: 10, // 10% click-to-reg
          regToFtd: 20,   // 20% reg-to-ftd -> overall 2% click-to-ftd
          expectedLtv: 150,
        }
      };

      const spend = 1000; // €1000
      const metrics = calculateUnifiedMetrics(config, spend, 150);

      expect(metrics.clicks).toBeCloseTo(1000, 2);
      expect(metrics.registrations).toBeCloseTo(100, 2); // 1000 * 10%
      expect(metrics.ftds).toBeCloseTo(20, 2);           // 100 * 20%
      expect(metrics.cpl).toBeCloseTo(10, 2);            // €1000 / 100 regs = €10 CPL
      expect(metrics.cpa).toBeCloseTo(50, 2);            // €1000 / 20 FTDs = €50 CPA
      expect(metrics.cpa).toBeGreaterThan(metrics.cpl!); // CPA must be strictly greater than CPL
    });
  });

  describe('2. Fixed-Fee Channels: No Hardcoded 25 Conversions', () => {
    it('fixed channels must NOT all return 25 conversions', () => {
      const state = useMediaPlanStore.getState();
      const plan = calculatePlanMetrics(state.channels, state.totalBudget, state.globalMultipliers);
      
      const fixedChannels = plan.channelsWithMetrics.filter(
        ch => ch.tier === 'fixed' || ch.buyingModel === 'FLAT_FEE' || ch.buyingModel === 'RETAINER'
      );

      expect(fixedChannels.length).toBeGreaterThan(0);

      // Collect conversions from all fixed channels
      const conversions = fixedChannels.map(ch => ch.metrics.conversions);
      
      // All fixed channels returning 25 is the exact bug from the audit
      const allAre25 = conversions.every(c => Math.abs(c - 25) < 0.01);
      expect(allAre25).toBe(false);

      // Channel with €1500 fee must produce more traffic/conversions than channel with €500 fee
      const seoTech = fixedChannels.find(ch => ch.id === 'seo-tech');
      const seoContent = fixedChannels.find(ch => ch.id === 'seo-content');
      if (seoTech && seoContent) {
        expect(seoContent.metrics.conversions).toBeGreaterThan(seoTech.metrics.conversions);
      }
    });
  });

  describe('3. Influencer Retainers Pricing Model', () => {
    it('"Influencer - Monthly Retainers" must have RETAINER/FLAT_FEE model and positive conversions', () => {
      const state = useMediaPlanStore.getState();
      const influencerRetainer = state.channels.find(ch => ch.id === 'influencer-retainers');

      expect(influencerRetainer).toBeDefined();
      expect(influencerRetainer!.buyingModel).not.toBe('REV_SHARE');
      expect(['RETAINER', 'FLAT_FEE']).toContain(influencerRetainer!.buyingModel);

      const plan = calculatePlanMetrics(state.channels, state.totalBudget, state.globalMultipliers);
      const influencerMetrics = plan.channelsWithMetrics.find(ch => ch.id === 'influencer-retainers')!;

      expect(influencerMetrics.metrics.spend).toBeGreaterThan(0);
      expect(influencerMetrics.metrics.conversions).toBeGreaterThan(0);
      expect(influencerMetrics.metrics.roas).toBeGreaterThan(0);
    });
  });

  describe('4. Push and Native Realistic Default Metrics', () => {
    it('Push Notifications defaults must produce realistic CPA (>€50) and ROAS (<5x)', () => {
      const state = useMediaPlanStore.getState();
      const plan = calculatePlanMetrics(state.channels, state.totalBudget, state.globalMultipliers);
      
      const push = plan.channelsWithMetrics.find(ch => ch.id === 'paid-push')!;
      expect(push).toBeDefined();

      // Bug had CPA = ~€2 and ROAS = 44x
      expect(push.metrics.cpa).toBeGreaterThanOrEqual(50);
      expect(push.metrics.roas).toBeLessThanOrEqual(5.0);
    });

    it('Native Ads defaults must produce realistic CPA (>€30) and ROAS (<5x)', () => {
      const state = useMediaPlanStore.getState();
      const plan = calculatePlanMetrics(state.channels, state.totalBudget, state.globalMultipliers);
      
      const native = plan.channelsWithMetrics.find(ch => ch.id === 'paid-native')!;
      expect(native).toBeDefined();

      expect(native.metrics.cpa).toBeGreaterThanOrEqual(30);
      expect(native.metrics.roas).toBeLessThanOrEqual(5.0);
    });
  });

  describe('5. Per-Channel Editable LTV', () => {
    it('editing expectedLtv on a channel affects only that channel revenue and ROAS', () => {
      const state = useMediaPlanStore.getState();
      const targetChannel = state.channels.find(ch => ch.id === 'paid-native')!;
      
      const initialMetrics = calculateSingleChannelMetrics(
        targetChannel,
        2500,
        state.globalMultipliers
      );

      // Increase LTV from default to €300
      const updatedChannel = {
        ...targetChannel,
        typeConfig: {
          ...targetChannel.typeConfig,
          baselineMetrics: {
            ...targetChannel.typeConfig.baselineMetrics,
            expectedLtv: 300,
          }
        }
      };

      const newMetrics = calculateSingleChannelMetrics(
        updatedChannel,
        2500,
        state.globalMultipliers
      );

      // Conversions and spend must stay identical
      expect(newMetrics.conversions).toBeCloseTo(initialMetrics.conversions, 4);
      expect(newMetrics.spend).toBeCloseTo(initialMetrics.spend, 4);

      // Revenue and ROAS must scale proportionally with LTV
      expect(newMetrics.revenue).toBeGreaterThan(initialMetrics.revenue);
      expect(newMetrics.roas).toBeGreaterThan(initialMetrics.roas);
    });
  });

  describe('6. GGR to NGR Deduction Model', () => {
    it('correctly calculates NGR leakage factor matching Deal Evaluator deductions', async () => {
      const { calculateNgrFromGgr, DEFAULT_DEDUCTIONS } = await import('../../src/lib/deductions');
      
      // Standard deductions: Bonus 30%, Admin 15%, Payment 4%, Tax 10% = 59% leakage
      expect(DEFAULT_DEDUCTIONS.bonusPct).toBe(30);
      expect(DEFAULT_DEDUCTIONS.adminFeePct).toBe(15);
      expect(DEFAULT_DEDUCTIONS.payFeePct).toBe(4);
      expect(DEFAULT_DEDUCTIONS.taxPct).toBe(10);

      const ggr = 1000;
      const { ngr, totalDeductionPct } = calculateNgrFromGgr(ggr, DEFAULT_DEDUCTIONS);

      expect(totalDeductionPct).toBe(59);
      expect(ngr).toBeCloseTo(410, 2); // 41% of 1000
    });
  });

  describe('7. SEO Ramp-up Curve in Multi-Month', () => {
    it('SEO conversions and revenue ramp up progressively across months', async () => {
      const { calculateMonthMetrics } = await import('../../src/hooks/use-multi-month-store');
      
      const makeMonth = (idx: number) => ({
        id: `m-${idx}`,
        label: `Month ${idx}`,
        monthIndex: idx,
        isSoftLaunch: idx === 0,
        budget: 50000,
        budgetMultiplier: 1.0,
        budgetLocked: false,
        spendMultiplier: null,
        cpmOverride: null,
        ctrBump: null,
        channels: [
          {
            channelId: 'seo-content',
            name: 'SEO - Content Production',
            category: 'SEO/Content' as any,
            allocationPct: 10,
            cpm: 2.0,
            ctr: 1.0,
            cr: 2.0,
            roas: 3.0,
            impressionMode: 'CPM' as any,
            fixedImpressions: 0,
            locked: false,
          }
        ],
        useGlobalChannels: true,
      });

      const m0 = calculateMonthMetrics(makeMonth(0), { spendMultiplier: 1, defaultCpmOverride: null, ctrBump: 0, cpaTarget: null, roasTarget: null });
      const m3 = calculateMonthMetrics(makeMonth(3), { spendMultiplier: 1, defaultCpmOverride: null, ctrBump: 0, cpaTarget: null, roasTarget: null });
      const m6 = calculateMonthMetrics(makeMonth(6), { spendMultiplier: 1, defaultCpmOverride: null, ctrBump: 0, cpaTarget: null, roasTarget: null });

      expect(m0.totalConversions).toBeLessThan(m3.totalConversions);
      expect(m3.totalConversions).toBeLessThan(m6.totalConversions);
      expect(m6.totalConversions / m0.totalConversions).toBeGreaterThan(5); // dramatic ramp-up from M0 to M6
    });
  });
});
