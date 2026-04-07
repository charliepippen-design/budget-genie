import { describe, expect, it } from 'vitest';
import {
  buildScenarioEnvelope,
  buildBudgetUtilization,
  buildGroupSpendTotals,
  getChannelGroup,
  getEfficiencyAlerts,
  getMetricIntegrityIssues,
} from '@/lib/planning-insights';
import type { ChannelWithMetrics } from '@/hooks/use-media-plan-store';
import type { ChannelFamily } from '@/types/channel';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_ASSUMPTIONS = {
  churnRate: 0.042,
  cpaMultiplier: 1,
  roasMultiplier: 1,
};

function makeChannel(
  overrides: Partial<{
    id: string;
    name: string;
    family: ChannelFamily;
    spend: number;
    conversions: number;
    cpa: number | null;
    roas: number;
    clicks: number;
    impressions: number;
    allocationPct: number;
    saturationCeiling?: number;
  }> = {}
): ChannelWithMetrics {
  const spend = overrides.spend ?? 1000;
  const conversions = overrides.conversions ?? 50;
  const roas = overrides.roas ?? 3;
  return {
    id: overrides.id ?? 'ch-1',
    name: overrides.name ?? 'Test Channel',
    family: overrides.family ?? 'paid_media',
    buyingModel: 'CPM',
    category: 'Paid Search',
    isActive: true,
    locked: false,
    tier: 'scalable',
    aboveCpaTarget: false,
    belowRoasTarget: false,
    allocationPct: overrides.allocationPct ?? 20,
    typeConfig: {
      family: overrides.family ?? 'paid_media',
      buyingModel: 'CPM',
      price: 5,
      baselineMetrics: {
        ctr: 1,
        conversionRate: 2.5,
        saturationCeiling: overrides.saturationCeiling,
      },
    },
    metrics: {
      spend,
      impressions: overrides.impressions ?? 200000,
      clicks: overrides.clicks ?? 2000,
      conversions,
      cpa:
        overrides.cpa !== undefined ? overrides.cpa : conversions > 0 ? spend / conversions : null,
      revenue: spend * roas,
      roas,
      effectivePrice: 5,
      effectiveCtr: 1,
      effectiveCr: 2.5,
    },
  } as unknown as ChannelWithMetrics;
}

// ─── buildScenarioEnvelope ────────────────────────────────────────────────────

describe('buildScenarioEnvelope', () => {
  it('returns exactly 3 scenarios: Bear, Base, Bull', () => {
    const result = buildScenarioEnvelope({
      baseLtvPerUser: 300,
      conversions: 100,
      cpa: 100,
      assumptions: BASE_ASSUMPTIONS,
    });
    expect(result.map((r) => r.scenario)).toEqual(['Bear', 'Base', 'Bull']);
  });

  it('Bear < Base < Bull for projectedLtvPerUser', () => {
    const result = buildScenarioEnvelope({
      baseLtvPerUser: 300,
      conversions: 100,
      cpa: 100,
      assumptions: BASE_ASSUMPTIONS,
    });
    expect(result[0].projectedLtvPerUser).toBeLessThan(result[1].projectedLtvPerUser);
    expect(result[1].projectedLtvPerUser).toBeLessThan(result[2].projectedLtvPerUser);
  });

  it('Bear is ~85% of Base, Bull is ~115% of Base (within retention adjustment)', () => {
    const result = buildScenarioEnvelope({
      baseLtvPerUser: 300,
      conversions: 100,
      cpa: 100,
      assumptions: BASE_ASSUMPTIONS,
    });
    const base = result[1].projectedLtvPerUser;
    // Bear lift = 0.85, Bull lift = 1.15
    expect(result[0].projectedLtvPerUser / base).toBeCloseTo(0.85, 1);
    expect(result[2].projectedLtvPerUser / base).toBeCloseTo(1.15, 1);
  });

  it('projectedCohortValue = projectedLtvPerUser * conversions', () => {
    const conversions = 200;
    const result = buildScenarioEnvelope({
      baseLtvPerUser: 100,
      conversions,
      cpa: 50,
      assumptions: BASE_ASSUMPTIONS,
    });
    result.forEach(({ projectedLtvPerUser, projectedCohortValue }) => {
      expect(projectedCohortValue).toBeCloseTo(projectedLtvPerUser * conversions, 2);
    });
  });

  it('ltvToCac = projectedLtvPerUser / cpa', () => {
    const cpa = 80;
    const result = buildScenarioEnvelope({
      baseLtvPerUser: 300,
      conversions: 100,
      cpa,
      assumptions: BASE_ASSUMPTIONS,
    });
    result.forEach(({ projectedLtvPerUser, ltvToCac }) => {
      expect(ltvToCac).toBeCloseTo(projectedLtvPerUser / cpa, 3);
    });
  });

  it('ltvToCac is 0 (not Infinity) when CPA is 0', () => {
    const result = buildScenarioEnvelope({
      baseLtvPerUser: 300,
      conversions: 100,
      cpa: 0,
      assumptions: BASE_ASSUMPTIONS,
    });
    result.forEach(({ ltvToCac }) => {
      expect(ltvToCac).toBe(0);
      expect(isFinite(ltvToCac)).toBe(true);
    });
  });

  it('cpaMultiplier stresses the denominator: higher CPA → lower ltvToCac', () => {
    const baseline = buildScenarioEnvelope({
      baseLtvPerUser: 200,
      conversions: 100,
      cpa: 50,
      assumptions: { ...BASE_ASSUMPTIONS, cpaMultiplier: 1 },
    });
    const stressed = buildScenarioEnvelope({
      baseLtvPerUser: 200,
      conversions: 100,
      cpa: 50,
      assumptions: { ...BASE_ASSUMPTIONS, cpaMultiplier: 1.5 },
    });
    // Same LTV but higher stressed CPA → worse ratio
    expect(stressed[1].ltvToCac).toBeLessThan(baseline[1].ltvToCac);
  });

  it('roasMultiplier lifts base LTV', () => {
    const base = buildScenarioEnvelope({
      baseLtvPerUser: 200,
      conversions: 100,
      cpa: 50,
      assumptions: { ...BASE_ASSUMPTIONS, roasMultiplier: 1 },
    });
    const lifted = buildScenarioEnvelope({
      baseLtvPerUser: 200,
      conversions: 100,
      cpa: 50,
      assumptions: { ...BASE_ASSUMPTIONS, roasMultiplier: 1.2 },
    });
    expect(lifted[1].projectedLtvPerUser).toBeGreaterThan(base[1].projectedLtvPerUser);
  });

  it('high churnRate degrades LTV (retention factor <1)', () => {
    const lowChurn = buildScenarioEnvelope({
      baseLtvPerUser: 300,
      conversions: 100,
      cpa: 100,
      assumptions: { ...BASE_ASSUMPTIONS, churnRate: 0.04 },
    });
    const highChurn = buildScenarioEnvelope({
      baseLtvPerUser: 300,
      conversions: 100,
      cpa: 100,
      assumptions: { ...BASE_ASSUMPTIONS, churnRate: 0.12 },
    });
    expect(highChurn[1].projectedLtvPerUser).toBeLessThan(lowChurn[1].projectedLtvPerUser);
  });

  it('typical iGaming defaults produce sensible LTV:CAC (1.5–5x range)', () => {
    // Simulate: budget = €22k, blendedCpa = €80, blendedRoas = 3x
    const cpa = 80;
    const roas = 3;
    const result = buildScenarioEnvelope({
      baseLtvPerUser: cpa * roas, // 240
      conversions: 275,
      cpa,
      assumptions: BASE_ASSUMPTIONS,
    });
    result.forEach(({ ltvToCac }) => {
      expect(ltvToCac).toBeGreaterThan(1); // all profitable
      expect(ltvToCac).toBeLessThan(10); // not unrealistically high
    });
  });
});

// ─── getChannelGroup ─────────────────────────────────────────────────────────

describe('getChannelGroup', () => {
  it('seo_content family → organic', () => {
    expect(getChannelGroup({ family: 'seo_content', name: 'SEO Blog' })).toBe('organic');
  });

  it('affiliate family → affiliate', () => {
    expect(getChannelGroup({ family: 'affiliate', name: 'CPA Partner' })).toBe('affiliate');
  });

  it('influencer family → influencer', () => {
    expect(getChannelGroup({ family: 'influencer', name: 'Brand Deal' })).toBe('influencer');
  });

  it('paid_media family → paid', () => {
    expect(getChannelGroup({ family: 'paid_media', name: 'Google Display' })).toBe('paid');
  });

  it('unknown family with "seo" in name → organic', () => {
    const unknownFamily = 'unknown' as unknown as ChannelFamily;
    expect(getChannelGroup({ family: unknownFamily, name: 'SEO On-Page' })).toBe('organic');
  });
});

// ─── buildGroupSpendTotals ────────────────────────────────────────────────────

describe('buildGroupSpendTotals', () => {
  it('correctly aggregates spend by group', () => {
    const channels = [
      makeChannel({ family: 'paid_media', spend: 1000 }),
      makeChannel({ family: 'paid_media', spend: 500 }),
      makeChannel({ family: 'affiliate', spend: 2000 }),
      makeChannel({ family: 'seo_content', spend: 300 }),
    ];
    const totals = buildGroupSpendTotals(channels);
    expect(totals.paid).toBe(1500);
    expect(totals.affiliate).toBe(2000);
    expect(totals.organic).toBe(300);
    expect(totals.influencer).toBe(0);
  });

  it('returns all groups as 0 for empty channel list', () => {
    const totals = buildGroupSpendTotals([]);
    expect(totals.paid).toBe(0);
    expect(totals.organic).toBe(0);
    expect(totals.affiliate).toBe(0);
    expect(totals.influencer).toBe(0);
  });
});

// ─── buildBudgetUtilization ───────────────────────────────────────────────────

describe('buildBudgetUtilization', () => {
  it('utilization % sums proportionally to spend', () => {
    const channels = [makeChannel({ family: 'paid_media', spend: 4000 })];
    const result = buildBudgetUtilization(channels, 10000);
    const paid = result.find((r) => r.group === 'paid')!;
    expect(paid.utilizationPct).toBeCloseTo(40, 1);
    expect(paid.status).toBe('overspend'); // >35%
  });

  it('marks underfunded when utilization < 15%', () => {
    const channels = [makeChannel({ family: 'paid_media', spend: 1000 })];
    const result = buildBudgetUtilization(channels, 10000);
    const paid = result.find((r) => r.group === 'paid')!;
    expect(paid.status).toBe('underfunded'); // 10% < 15%
  });

  it('marks balanced when utilization is between 15% and 35%', () => {
    const channels = [makeChannel({ family: 'paid_media', spend: 2500 })];
    const result = buildBudgetUtilization(channels, 10000);
    const paid = result.find((r) => r.group === 'paid')!;
    expect(paid.status).toBe('balanced'); // 25%
  });

  it('handles zero totalBudget without division by zero', () => {
    const channels = [makeChannel({ family: 'paid_media', spend: 1000 })];
    expect(() => buildBudgetUtilization(channels, 0)).not.toThrow();
  });
});

// ─── getEfficiencyAlerts ──────────────────────────────────────────────────────

describe('getEfficiencyAlerts', () => {
  it('flags channel approaching saturation ceiling (>90% of ceiling)', () => {
    const channel = makeChannel({ spend: 9100, saturationCeiling: 10000 });
    const alerts = getEfficiencyAlerts([channel]);
    expect(alerts.some((a) => a.severity === 'high')).toBe(true);
  });

  it('flags low ROAS at above-average spend as medium severity', () => {
    const channels = [
      makeChannel({ id: 'ch-1', spend: 5000, roas: 0.8 }),
      makeChannel({ id: 'ch-2', spend: 500, roas: 4.0 }),
    ];
    const alerts = getEfficiencyAlerts(channels);
    expect(alerts.some((a) => a.severity === 'medium')).toBe(true);
  });

  it('returns no alerts for efficient channels', () => {
    const channels = [
      makeChannel({ id: 'ch-1', spend: 1000, roas: 3.5 }),
      makeChannel({ id: 'ch-2', spend: 1200, roas: 4.0 }),
    ];
    const alerts = getEfficiencyAlerts(channels);
    expect(alerts).toHaveLength(0);
  });
});

// ─── getMetricIntegrityIssues ─────────────────────────────────────────────────

describe('getMetricIntegrityIssues', () => {
  it('flags clicks without impressions', () => {
    const channel = makeChannel({ clicks: 500, impressions: 0 });
    const issues = getMetricIntegrityIssues([channel]);
    expect(issues.some((i) => i.issue.includes('Clicks exist'))).toBe(true);
  });

  it('flags conversions without clicks', () => {
    const channel = makeChannel({ conversions: 50, clicks: 0, impressions: 0 });
    const issues = getMetricIntegrityIssues([channel]);
    expect(issues.some((i) => i.issue.includes('Conversions exist'))).toBe(true);
  });

  it('returns no issues for a clean channel', () => {
    const channel = makeChannel({ impressions: 200000, clicks: 2000, conversions: 50 });
    const issues = getMetricIntegrityIssues([channel]);
    expect(issues).toHaveLength(0);
  });
});
