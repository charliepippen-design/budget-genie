import { describe, expect, it } from 'vitest';
import { generatePlan, type GeneratedPlan } from '@/lib/plan-generator';
import { computePlanSnapshot, type GlobalMultipliers } from '@/hooks/use-media-plan-store';
import { INDUSTRY_PACKS, getIndustryPack } from '@/lib/industries';
import { DEFAULT_IGAMING_REVENUE_INPUTS } from '@/lib/igaming-revenue-model';

const baseMultipliers: GlobalMultipliers = {
  spendMultiplier: 1,
  defaultCpmOverride: null,
  ctrBump: 0,
  cpaTarget: null,
  roasTarget: null,
  playerValue: 150,
  ...DEFAULT_IGAMING_REVENUE_INPUTS,
};

const snapshot = (plan: GeneratedPlan) =>
  computePlanSnapshot({
    totalBudget: plan.totalBudget,
    channels: plan.channels,
    globalMultipliers: { ...baseMultipliers, ...plan.multipliers },
    activeGeos: plan.geo.activeGeos,
    activeTiers: plan.geo.activeTiers,
    geoOverrides: {},
  });

describe('Plan generator', () => {
  it.each(INDUSTRY_PACKS.map((p) => p.id))('%s: spends the budget and lands near industry CPA', (industry) => {
    const plan = generatePlan({ industry, monthlyBudget: 50000 });
    expect(plan.channels.length).toBeGreaterThan(2);
    const { blended } = snapshot(plan);
    expect(blended.totalSpend).toBeCloseTo(plan.totalBudget, 0);
    const bench = getIndustryPack(industry).benchmarks.cpa;
    expect(blended.blendedCpa).not.toBeNull();
    expect(blended.blendedCpa!).toBeGreaterThan(bench * 0.15);
    expect(blended.blendedCpa!).toBeLessThan(bench * 4);
  });

  it('keeps channel efficiency differences (markets must not flatten CPAs)', () => {
    const plan = generatePlan({ industry: 'igaming', monthlyBudget: 50000, markets: ['DE'] });
    const cpas = snapshot(plan).channels.map((c) => Math.round(c.metrics.cpa ?? 0)).filter((c) => c > 0);
    expect(new Set(cpas).size).toBeGreaterThan(3);
  });

  it('cheaper markets lower the cost per conversion', () => {
    const cpaIn = (markets: string[]) =>
      snapshot(generatePlan({ industry: 'fintech', monthlyBudget: 30000, markets })).channels.find(
        (c) => c.id === 'fintech-meta-social'
      )?.metrics.cpa ?? 0;
    expect(cpaIn(['BR'])).toBeLessThan(cpaIn(['DE']));
  });

  it('maps markets to the dashboard geo selection', () => {
    expect(generatePlan({ markets: ['DE', 'IT'] }).geo.activeGeos).toEqual(['Germany', 'Italy']);
    expect(generatePlan({ markets: ['US', 'FR'] }).geo.activeTiers).toEqual({ tier1: 50, tier2: 50, tier3: 0 });
  });

  it('respects explicit exclusions and restricted tags', () => {
    const plan = generatePlan({ industry: 'igaming', monthlyBudget: 50000, excludeChannels: ['affiliate-cpa'], excludeTags: ['restricted'] });
    const ids = plan.channels.map((c) => c.id);
    expect(ids).not.toContain('igaming-affiliate-cpa');
    expect(ids).not.toContain('igaming-google-search');
    expect(ids).not.toContain('igaming-meta-social');
    expect(plan.skipped.find((s) => s.key === 'google-search')?.reason).toMatch(/licence/);
  });

  it('forces requested channels in even when below min budget', () => {
    const plan = generatePlan({ industry: 'igaming', monthlyBudget: 8000, includeChannels: ['google-search'] });
    expect(plan.channels.map((c) => c.id)).toContain('igaming-google-search');
  });

  it('small budgets use fewer channels', () => {
    const small = generatePlan({ industry: 'ecommerce', monthlyBudget: 6000 });
    const big = generatePlan({ industry: 'ecommerce', monthlyBudget: 200000 });
    expect(small.channels.length).toBeLessThanOrEqual(4);
    expect(big.channels.length).toBeGreaterThan(small.channels.length);
  });

  it('objectives shift the mix: retention favours CRM, branding favours reach', () => {
    const retention = generatePlan({ industry: 'ecommerce', monthlyBudget: 40000, objectives: { retention: 1 } });
    expect(retention.channels.map((c) => c.id)).toContain('ecommerce-crm');
    const branding = generatePlan({ industry: 'saas', monthlyBudget: 120000, objectives: { branding: 1 } });
    expect(branding.channels.some((c) => ['Offline/TV', 'Display/Programmatic'].includes(c.category))).toBe(true);
  });

  it('never exceeds saturation ceilings and holds back the excess', () => {
    const plan = generatePlan({ industry: 'saas', monthlyBudget: 900000 });
    for (const ch of plan.channels.filter((c) => c.tier !== 'fixed')) {
      const spend = (ch.allocationPct / 100) * plan.totalBudget;
      expect(spend).toBeLessThanOrEqual((ch.typeConfig.baselineMetrics.saturationCeiling ?? Infinity) + 1);
    }
    expect(plan.unallocated).toBeGreaterThan(0);
    expect(plan.totalBudget).toBe(900000 - plan.unallocated);
  });

  it('conservative risk drops experimental channels at small budgets', () => {
    const plan = generatePlan({ industry: 'fintech', monthlyBudget: 12000, riskProfile: 'conservative' });
    expect(plan.channels.map((c) => c.id)).not.toContain('fintech-tiktok');
  });

  it('target CPA shifts budget toward cheaper channels, or warns when unreachable', () => {
    const base = snapshot(generatePlan({ industry: 'ecommerce', monthlyBudget: 60000 })).blended.blendedCpa!;
    const targeted = generatePlan({ industry: 'ecommerce', monthlyBudget: 60000, targetCpa: base * 0.9 });
    expect(snapshot(targeted).blended.blendedCpa!).toBeLessThanOrEqual(base * 0.9);
    const impossible = generatePlan({ industry: 'igaming', monthlyBudget: 60000, targetCpa: 5 });
    expect(impossible.warnings.join(' ')).toMatch(/not reachable/);
  });

  it('does not set a CPA target unless the user gave one', () => {
    expect(generatePlan({ industry: 'saas' }).multipliers).not.toHaveProperty('cpaTarget');
  });

  it('iGaming in Italy only plans channels that are legal there', () => {
    const plan = generatePlan({ industry: 'igaming', monthlyBudget: 60000, markets: ['IT'] });
    expect(plan.channels.map((c) => c.id).sort()).toEqual(['igaming-crm', 'igaming-seo-content']);
    const mixed = generatePlan({ industry: 'igaming', monthlyBudget: 60000, markets: ['IT', 'DE'] });
    expect(mixed.channels.length).toBeGreaterThan(2);
    expect(mixed.warnings.join(' ')).toMatch(/IT/);
  });
});
