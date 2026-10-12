import { describe, expect, it } from 'vitest';
import { generatePlan } from '@/lib/plan-generator';
import { computePlanSnapshot, type GlobalMultipliers } from '@/hooks/use-media-plan-store';
import { DEFAULT_IGAMING_REVENUE_INPUTS } from '@/lib/igaming-revenue-model';
import { computePlanEconomics } from '@/lib/plan-economics';
import { generateWizardPlan } from '@/lib/onboarding-ai';

const multipliers: GlobalMultipliers = {
  spendMultiplier: 1,
  defaultCpmOverride: null,
  ctrBump: 0,
  cpaTarget: null,
  roasTarget: null,
  playerValue: 150,
  ...DEFAULT_IGAMING_REVENUE_INPUTS,
};

const FIXED = ['FLAT_FEE', 'RETAINER'];

describe.each([5000, 10000, 20000])('wizard small budget %i', (budget) => {
  const plans = {
    generator: generatePlan({ monthlyBudget: budget }),
    wizard: generateWizardPlan({
      budget,
      vertical: 'igaming',
      goal: 'test_channels',
      geos: ['DE', 'BR'],
      benchmarks: {},
    })!,
  };

  describe.each(Object.entries(plans))('%s plan', (_name, plan) => {
    it('has no fixed-fee channel above its share of the budget', () => {
      const fixed = plan.channels.filter((c) => FIXED.includes(c.buyingModel));
      for (const c of fixed) {
        expect(c.typeConfig.price).toBeLessThanOrEqual(budget * 0.4);
      }
      const fixedTotal = fixed.reduce((s, c) => s + c.typeConfig.price, 0);
      expect(fixedTotal).toBeLessThanOrEqual(budget * 0.4);
      expect(plan.channels.length).toBeLessThanOrEqual(budget < 10000 ? 4 : 6);
    });

    it('lifetime ROAS - 1 has the same sign as the lifetime P&L', () => {
      const snap = computePlanSnapshot({
        totalBudget: plan.totalBudget,
        channels: plan.channels,
        globalMultipliers: { ...multipliers, ...plan.multipliers },
        activeGeos: plan.geo.activeGeos,
        activeTiers: plan.geo.activeTiers,
        geoOverrides: {},
      });
      const eco = computePlanEconomics(
        {
          totalSpend: snap.blended.totalSpend,
          totalConversions: snap.blended.totalConversions,
          projectedRevenue: snap.blended.projectedRevenue,
        },
        'igaming',
        { ...multipliers, ...plan.multipliers }
      );
      expect(eco.computable).toBe(true);
      expect(Math.sign(snap.blended.blendedRoas - 1)).toBe(Math.sign(eco.netValueCohort));
    });
  });
});
