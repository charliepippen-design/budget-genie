import '../setup';
import { describe, it, expect } from 'vitest';
import { generatePlan } from '../../src/lib/plan-generator';
import { calculatePlanMetrics } from '../../src/lib/plan-math';
import { INDUSTRY_PACKS, getIndustryPack } from '../../src/lib/industries';

const baseMultipliers = { spendMultiplier: 1, defaultCpmOverride: null, ctrBump: 0, cpaTarget: null, roasTarget: null, playerValue: 150 };

const spendOf = (plan: ReturnType<typeof generatePlan>) =>
  calculatePlanMetrics(plan.channels, plan.totalBudget, { ...baseMultipliers, ...plan.multipliers }).blendedMetrics;

describe('Plan generator', () => {
  it.each(INDUSTRY_PACKS.map(p => p.id))('%s: spends the budget and produces sane CPAs', industry => {
    const plan = generatePlan({ industry, monthlyBudget: 50000 });
    expect(plan.channels.length).toBeGreaterThan(2);
    const m = spendOf(plan);
    expect(m.totalSpend).toBeCloseTo(plan.totalBudget, 0);
    expect(m.totalSpend).toBeLessThanOrEqual(50000 + 1);
    const bench = getIndustryPack(industry).benchmarks.cpa;
    expect(m.blendedCpa).not.toBeNull();
    // Blended CPA should land in a plausible band around the industry benchmark
    expect(m.blendedCpa!).toBeGreaterThan(bench * 0.15);
    expect(m.blendedCpa!).toBeLessThan(bench * 4);
  });

  it('respects explicit exclusions and restricted tags', () => {
    const plan = generatePlan({ industry: 'igaming', monthlyBudget: 50000, excludeChannels: ['affiliate-cpa'], excludeTags: ['restricted'] });
    const ids = plan.channels.map(c => c.id);
    expect(ids).not.toContain('igaming-affiliate-cpa');
    expect(ids).not.toContain('igaming-google-search');
    expect(ids).not.toContain('igaming-meta-social');
    expect(plan.skipped.find(s => s.key === 'google-search')?.reason).toMatch(/licence/);
  });

  it('forces requested channels in even when below min budget', () => {
    const plan = generatePlan({ industry: 'igaming', monthlyBudget: 8000, includeChannels: ['google-search'] });
    expect(plan.channels.map(c => c.id)).toContain('igaming-google-search');
  });

  it('small budgets use fewer channels', () => {
    const small = generatePlan({ industry: 'ecommerce', monthlyBudget: 6000 });
    const big = generatePlan({ industry: 'ecommerce', monthlyBudget: 200000 });
    expect(small.channels.length).toBeLessThanOrEqual(4);
    expect(big.channels.length).toBeGreaterThan(small.channels.length);
  });

  it('objectives shift the mix: retention favours CRM, branding favours reach', () => {
    const retention = generatePlan({ industry: 'ecommerce', monthlyBudget: 40000, objectives: { retention: 1 } });
    expect(retention.channels.map(c => c.id)).toContain('ecommerce-crm');
    const branding = generatePlan({ industry: 'saas', monthlyBudget: 120000, objectives: { branding: 1 } });
    const brandCats = branding.channels.filter(c => ['Offline/TV', 'Display/Programmatic'].includes(c.category));
    expect(brandCats.length).toBeGreaterThan(0);
  });

  it('cheaper markets lower media prices', () => {
    const t1 = generatePlan({ industry: 'fintech', monthlyBudget: 30000, markets: ['GB'] });
    const t3 = generatePlan({ industry: 'fintech', monthlyBudget: 30000, markets: ['BR'] });
    const price = (p: typeof t1, id: string) => p.channels.find(c => c.id === id)?.typeConfig.price ?? 0;
    expect(price(t3, 'fintech-meta-social')).toBeLessThan(price(t1, 'fintech-meta-social'));
  });

  it('never exceeds saturation ceilings and holds back the excess', () => {
    const plan = generatePlan({ industry: 'saas', monthlyBudget: 900000 });
    for (const ch of plan.channels.filter(c => c.tier !== 'fixed')) {
      const spend = (ch.allocationPct / 100) * 900000;
      expect(spend).toBeLessThanOrEqual((ch.typeConfig.baselineMetrics.saturationCeiling ?? Infinity) + 1);
    }
    expect(plan.unallocated).toBeGreaterThan(0);
    expect(plan.totalBudget).toBe(900000 - plan.unallocated);
  });

  it('conservative risk drops experimental channels at small budgets', () => {
    const plan = generatePlan({ industry: 'fintech', monthlyBudget: 12000, riskProfile: 'conservative' });
    expect(plan.channels.map(c => c.id)).not.toContain('fintech-tiktok');
  });
});
