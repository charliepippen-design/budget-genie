import { describe, expect, it } from 'vitest';
import { createMonth } from '@/lib/multi-month/calc';
import type { ChannelData } from '@/lib/media-plan/types';
import type { EngineInput, EngineMonthRange, EngineRange, EngineRangeSet } from '../contract';
import type { TimelineInput } from '../timeline';
import type { WhatIfInput } from '../what-if';
import { responseCurveEngine as engine } from './index';
import { channelCurve, channelEconomics, conversionsAt, marginalConversionsAt } from './response-curve';
import { marketContext } from './model';
import { generatedInputs, inputFor, numbersIn } from './testing';

// Properties that must hold for every plan the product can generate: every industry pack,
// several budgets and several market mixes (150 plans).

const CASES = generatedInputs();
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

const ordered = (range: EngineRange) => range.p10 <= range.p50 + 1e-9 && range.p50 <= range.p90 + 1e-9;
const orderedSet = (set: EngineRangeSet) =>
  ordered(set.conversions) && ordered(set.revenue) && ordered(set.roas) && (set.costPerConversion === null || ordered(set.costPerConversion));
/** A missing month means "later than the horizon", so it sorts last. */
const orderedMonths = (range: EngineMonthRange) => {
  const at = (value: number | null) => value ?? Infinity;
  return at(range.p10) <= at(range.p50) && at(range.p50) <= at(range.p90);
};

function timelineFor(input: EngineInput, months = 8, startMonth = '2027-01'): TimelineInput {
  const settings = {
    baseMonthlyBudget: input.budget,
    growthRate: 10,
    growthType: 'linear' as const,
    spendMultiplier: 1,
    defaultCpmOverride: null,
    ctrBump: 0,
    cpaTarget: null,
    roasTarget: null,
  };
  const empty: TimelineInput = {
    includeSoftLaunch: false,
    planningMonths: months,
    startMonth,
    pattern: 'flat',
    patternParams: {},
    settings,
    months: [],
    scenarios: [],
    comparisonScenarioId: null,
    optimisationGoal: 'balanced',
  };
  const baseChannels = engine.computeTimeline(input, empty).baseChannels;
  const [year, month] = startMonth.split('-').map(Number);
  return {
    ...empty,
    months: Array.from({ length: months }, (_, i) =>
      createMonth(i, new Date(year, month - 1, 1), false, input.budget, baseChannels)
    ),
  };
}

const whatIfFor = (input: EngineInput, enabled: boolean): WhatIfInput => ({
  churnRatePct: 6,
  cpaShockPct: 15,
  roasLiftPct: -10,
  decayCurve: 'front-loaded-dropoff',
  sandbox: {
    enabled,
    selectedChannelIds: input.channels.slice(0, 2).map((c) => c.id),
    channelAdjustments: Object.fromEntries(
      input.channels.slice(0, 2).map((c) => [c.id, { spendPct: 50, cpaPct: 20, roasPct: -10, churnPct: 5 }])
    ),
    groupAdjustments: { organic: 10, paid: 25, affiliate: -20, influencer: 0 },
  },
});

describe('response-curve engine: properties over generated plans', () => {
  it('covers every industry pack with plans that have channels', () => {
    expect(CASES.length).toBe(150);
    expect(CASES.filter((c) => c.input.channels.length > 0).length).toBeGreaterThan(140);
  });

  it.each(CASES)('$name: totals equal the sum of channels', ({ input }) => {
    const { channels, totals } = engine.compute(input);
    expect(totals.totalSpend).toBeCloseTo(sum(channels.map((c) => c.metrics.spend)), 6);
    expect(totals.totalConversions).toBeCloseTo(sum(channels.map((c) => c.metrics.conversions)), 6);
    expect(totals.projectedRevenue).toBeCloseTo(sum(channels.map((c) => c.metrics.revenue)), 4);
    expect(totals.totalImpressions).toBeCloseTo(sum(channels.map((c) => c.metrics.impressions)), 2);
    expect(totals.totalClicks).toBeCloseTo(sum(channels.map((c) => c.metrics.clicks)), 4);
    if (totals.totalConversions > 0) {
      expect(totals.blendedCpa).toBeCloseTo(totals.totalSpend / totals.totalConversions, 6);
    }
  });

  it.each(CASES)('$name: spend stays within the budget unless fixed fees exceed it, which is flagged', ({ input }) => {
    [1, 0.5, 0.1, 0.01].forEach((scale) => {
      const budget = input.budget * scale;
      const { totals } = engine.compute({ ...input, budget });
      if (totals.totalSpend > budget + 1e-6) {
        expect(totals.overBudget).toBe(true);
        expect(totals.overBudgetBy).toBeCloseTo(totals.fixedSpend - budget, 6);
        expect(totals.totalSpend).toBeCloseTo(totals.fixedSpend, 6);
      } else {
        expect(totals.overBudget).toBe(false);
      }
      expect(totals.unallocated).toBeGreaterThanOrEqual(0);
    });
  });

  it.each(CASES)('$name: more budget never lowers P50 conversions or value', ({ input }) => {
    let previous = { conversions: -1, revenue: -1 };
    [0.25, 0.5, 1, 1.5, 3, 10].forEach((scale) => {
      const { totals, ranges } = engine.compute({ ...input, budget: input.budget * scale });
      expect(ranges!.totals.conversions.p50).toBe(totals.totalConversions);
      expect(totals.totalConversions).toBeGreaterThanOrEqual(previous.conversions);
      expect(totals.projectedRevenue).toBeGreaterThanOrEqual(previous.revenue);
      previous = { conversions: totals.totalConversions, revenue: totals.projectedRevenue };
    });
  });

  it.each(CASES)('$name: each channel buys fewer conversions per extra unit as its spend grows', ({ input }) => {
    // Through the engine: three budgets, the same shares, so every variable channel's spend grows.
    const results = [1, 1.5, 2].map((scale) => engine.compute({ ...input, budget: input.budget * scale }).channels);
    results[0].forEach((channel, idx) => {
      const [a, b, c] = results.map((r) => r[idx].metrics);
      if (!(b.spend > a.spend) || !(c.spend > b.spend) || a.conversions <= 0) return;
      const first = (b.conversions - a.conversions) / (b.spend - a.spend);
      const second = (c.conversions - b.conversions) / (c.spend - b.spend);
      expect(first).toBeGreaterThan(0);
      expect(second).toBeGreaterThan(0);
      expect(second).toBeLessThan(first);
      // Average efficiency falls too.
      expect(c.conversions / c.spend).toBeLessThan(a.conversions / a.spend);
      expect(channel.id).toBe(results[2][idx].id);
    });

    // On the curve itself: zero at zero, marginal return positive and strictly decreasing.
    const ctx = marketContext(input);
    input.channels.forEach((channel) => {
      const curve = channelCurve(channel, channelEconomics(channel, ctx), ctx);
      expect(conversionsAt(curve, 0)).toBe(0);
      if (curve.slope <= 0) return;
      let previousMarginal = Infinity;
      let previousConversions = 0;
      [0, 100, 1_000, 10_000, 100_000, 1_000_000].forEach((spend) => {
        const marginal = marginalConversionsAt(curve, spend);
        expect(marginal).toBeGreaterThan(0);
        expect(marginal).toBeLessThan(previousMarginal);
        expect(conversionsAt(curve, spend)).toBeGreaterThanOrEqual(previousConversions);
        previousMarginal = marginal;
        previousConversions = conversionsAt(curve, spend);
      });
    });
  });

  it.each(CASES)('$name: P10 <= P50 <= P90 everywhere, and P50 is the headline figure', ({ input }) => {
    const result = engine.compute(input);
    const ranges = result.ranges!;
    expect(orderedSet(ranges.totals)).toBe(true);
    expect(orderedMonths(ranges.paybackMonth)).toBe(true);
    expect(ranges.assumptions.length).toBeGreaterThan(0);
    result.channels.forEach((channel) => {
      const set = ranges.channels[channel.id];
      expect(set).toBeDefined();
      expect(orderedSet(set)).toBe(true);
      expect(set.conversions.p50).toBe(channel.metrics.conversions);
      expect(set.revenue.p50).toBe(channel.metrics.revenue);
    });
    expect(ranges.totals.revenue.p50).toBe(result.totals.projectedRevenue);
    if (ranges.totals.costPerConversion) {
      expect(ranges.totals.costPerConversion.p50).toBeCloseTo(result.totals.blendedCpa!, 9);
    }
    // Bear / Base / Bull are the same range.
    expect(result.scenarios.map((s) => s.projectedCohortValue)).toEqual([
      ranges.totals.revenue.p10,
      ranges.totals.revenue.p50,
      ranges.totals.revenue.p90,
    ]);

    const timeline = engine.computeTimeline(input, timelineFor(input));
    expect(ordered(timeline.ranges!.conversions)).toBe(true);
    expect(ordered(timeline.ranges!.revenue)).toBe(true);
    expect(ordered(timeline.ranges!.netProfit)).toBe(true);
    const lab = engine.computeWhatIf(input, whatIfFor(input, true));
    expect(orderedSet(lab.ranges!.totals)).toBe(true);
    expect(orderedMonths(lab.ranges!.paybackMonth)).toBe(true);
  });

  it.each(CASES)('$name: turning a channel off zeroes it and frees its spend for the others', ({ input }) => {
    const before = engine.compute(input);
    input.channels.forEach((target) => {
      const after = engine.compute({
        ...input,
        channels: input.channels.map((c) => (c.id === target.id ? { ...c, isActive: false } : c)),
      });
      const was = before.channels.find((c) => c.id === target.id)!.metrics;
      const now = after.channels.find((c) => c.id === target.id)!.metrics;
      (['spend', 'conversions', 'revenue', 'impressions', 'clicks'] as const).forEach((key) => {
        expect(now[key]).toBe(0);
        expect(now[key]).toBeLessThanOrEqual(was[key]);
      });
      expect(after.ranges!.channels[target.id].conversions.p90).toBe(0);

      const others = (r: typeof before) => sum(r.channels.filter((c) => c.id !== target.id).map((c) => c.metrics.spend));
      const othersCanAbsorb = after.channels.some(
        (c) => c.id !== target.id && c.isActive && c.buyingModel !== 'FLAT_FEE' && c.buyingModel !== 'RETAINER' && c.tier !== 'fixed' && c.allocationPct > 0
      );
      expect(others(after)).toBeGreaterThanOrEqual(others(before) - 1e-6);
      if (othersCanAbsorb && !before.totals.overBudget) {
        // The freed spend is redeployed in full: the plan still spends what it spent.
        expect(others(after)).toBeCloseTo(others(before) + was.spend, 4);
      }
      expect(after.totals.totalSpend).toBeLessThanOrEqual(Math.max(input.budget, after.totals.fixedSpend) + 1e-6);
    });
  });

  it.each(CASES)('$name: every figure is finite, and non-negative where it must be', ({ input }) => {
    const result = engine.compute(input);
    const timeline = engine.computeTimeline(input, timelineFor(input));
    const labs = [false, true].map((enabled) => engine.computeWhatIf(input, whatIfFor(input, enabled)));
    const optimised = engine.optimise!(input, { goal: 'net' });

    [result, timeline, ...labs, optimised].forEach((value) => {
      numbersIn(value).forEach((entry) => expect(Number.isFinite(entry.value), entry.path).toBe(true));
    });

    result.channels.forEach((c) => {
      numbersIn(c.metrics).forEach((entry) => expect(entry.value, entry.path).toBeGreaterThanOrEqual(0));
    });
    numbersIn(result.ranges).forEach((entry) => expect(entry.value, entry.path).toBeGreaterThanOrEqual(0));
    numbersIn(result.customerValue.curve.map((p) => [p.cumulativeLtvPerUser, p.monthlyLtvPerUser, p.cohortValue])).forEach(
      (entry) => expect(entry.value).toBeGreaterThanOrEqual(0)
    );
    (['totalSpend', 'totalConversions', 'projectedRevenue', 'blendedRoas', 'unallocated', 'fixedSpend'] as const).forEach(
      (key) => expect(result.totals[key]).toBeGreaterThanOrEqual(0)
    );
    timeline.plan.months.forEach((m) => {
      [m.spend, m.conversions, m.revenue, m.operatingCosts].forEach((v) => expect(v).toBeGreaterThanOrEqual(0));
    });
    labs.forEach((lab) =>
      lab.channels.forEach((c) =>
        [c.adjustedSpend, c.adjustedConversions, c.adjustedRevenue, c.adjustedCpa, c.adjustedRoas].forEach((v) =>
          expect(v).toBeGreaterThanOrEqual(0)
        )
      )
    );
    // The value curve never decreases: value earned cannot be un-earned.
    result.customerValue.curve.slice(1).forEach((point, idx) => {
      expect(point.cumulativeLtvPerUser).toBeGreaterThanOrEqual(result.customerValue.curve[idx].cumulativeLtvPerUser);
    });
  });

  it.each(CASES)('$name: repeated calls give the same result', ({ input }) => {
    const first = JSON.stringify(engine.compute(input));
    expect(JSON.stringify(engine.compute(input))).toBe(first);
    expect(JSON.stringify(engine.compute(JSON.parse(JSON.stringify(input))))).toBe(first);
    const timeline = timelineFor(input);
    expect(JSON.stringify(engine.computeTimeline(input, timeline))).toBe(JSON.stringify(engine.computeTimeline(input, timeline)));
    const whatIf = whatIfFor(input, true);
    expect(JSON.stringify(engine.computeWhatIf(input, whatIf))).toBe(JSON.stringify(engine.computeWhatIf(input, whatIf)));
    expect(JSON.stringify(engine.optimise!(input, { goal: 'value' }))).toBe(JSON.stringify(engine.optimise!(input, { goal: 'value' })));
  });
});

describe('response-curve engine: edge inputs', () => {
  const base = inputFor({ industry: 'igaming', monthlyBudget: 60_000, markets: ['DE'] });
  const broken: Array<[string, EngineInput]> = [
    ['no channels', { ...base, channels: [] }],
    ['zero budget', { ...base, budget: 0 }],
    ['every channel off', { ...base, channels: base.channels.map((c) => ({ ...c, isActive: false })) }],
    ['all shares zero', { ...base, channels: base.channels.map((c) => ({ ...c, allocationPct: 0 })) }],
    ['no industry', { ...base, industry: null }],
    [
      'zero prices, rates and ceilings',
      {
        ...base,
        channels: base.channels.map((c): ChannelData => ({
          ...c,
          typeConfig: { ...c.typeConfig, price: 0, secondaryPrice: 0, baselineMetrics: { ctr: 0, conversionRate: 0, aov: 0, saturationCeiling: 0 } },
        })),
      },
    ],
    ['NaN budget and value', { ...base, budget: NaN, assumptions: { ...base.assumptions, playerValue: NaN, spendMultiplier: NaN } }],
    ['observed value of zero and garbage', { ...base, observedValue: { m1: 0, m3: -5, m6: Infinity } }],
  ];

  it.each(broken)('%s: results stay complete and finite', (_name, input) => {
    const result = engine.compute(input);
    numbersIn(result).forEach((entry) => expect(Number.isFinite(entry.value), entry.path).toBe(true));
    expect(result.channels).toHaveLength(input.channels.length);
    expect(result.customerValue.curve).toHaveLength(12);
    // Month budgets are echoed back as given, so the months themselves are built from a finite budget.
    const months = timelineFor({ ...input, budget: Number.isFinite(input.budget) ? input.budget : 0 }, 3);
    const timeline = engine.computeTimeline(input, months);
    numbersIn(timeline).forEach((entry) => expect(Number.isFinite(entry.value), entry.path).toBe(true));
    const lab = engine.computeWhatIf(input, whatIfFor(input, true));
    numbersIn(lab).forEach((entry) => expect(Number.isFinite(entry.value), entry.path).toBe(true));
    const optimised = engine.optimise!(input, { goal: 'conversions', constraints: { maxCostPerConversion: 50 } });
    numbersIn(optimised).forEach((entry) => expect(Number.isFinite(entry.value), entry.path).toBe(true));
  });

  it('editing a channel moves its curve: cheaper clicks, a better rate or a higher ceiling all buy more', () => {
    const target = base.channels.find((c) => c.buyingModel === 'CPC')!;
    const conversionsWith = (patch: (c: ChannelData) => ChannelData) =>
      engine.compute({ ...base, channels: base.channels.map((c) => (c.id === target.id ? patch(c) : c)) }).channels.find(
        (c) => c.id === target.id
      )!.metrics.conversions;
    const original = conversionsWith((c) => c);
    const config = target.typeConfig;
    expect(conversionsWith((c) => ({ ...c, typeConfig: { ...config, price: config.price / 2 } }))).toBeGreaterThan(original);
    expect(
      conversionsWith((c) => ({
        ...c,
        typeConfig: { ...config, baselineMetrics: { ...config.baselineMetrics, conversionRate: config.baselineMetrics.conversionRate! * 2 } },
      }))
    ).toBeGreaterThan(original);
    expect(
      conversionsWith((c) => ({
        ...c,
        typeConfig: { ...config, baselineMetrics: { ...config.baselineMetrics, saturationCeiling: config.baselineMetrics.saturationCeiling! * 3 } },
      }))
    ).toBeGreaterThan(original);
  });

  it('cheaper markets buy more conversions for the same budget, and each is worth less', () => {
    const tier1 = engine.compute(inputFor({ industry: 'igaming', monthlyBudget: 60_000, markets: ['DE'] }));
    const tier3 = engine.compute({ ...base, markets: { tiers: { tier1: 0, tier2: 0, tier3: 100 }, geos: [], overrides: {} } });
    expect(tier3.totals.totalConversions).toBeGreaterThan(tier1.totals.totalConversions);
    expect(tier3.totals.projectedRevenue / tier3.totals.totalConversions).toBeLessThan(
      tier1.totals.projectedRevenue / tier1.totals.totalConversions
    );
  });

  it('fixed-fee channels cost their fee whatever the budget', () => {
    const fixed = base.channels.filter((c) => c.buyingModel === 'FLAT_FEE' || c.buyingModel === 'RETAINER');
    expect(fixed.length).toBeGreaterThan(0);
    [0.5, 1, 4].forEach((scale) => {
      const result = engine.compute({ ...base, budget: base.budget * scale });
      fixed.forEach((c) => expect(result.channels.find((r) => r.id === c.id)!.metrics.spend).toBe(c.typeConfig.price));
    });
  });
});

describe('response-curve engine: uncertainty follows the evidence', () => {
  const relativeWidth = (range: EngineRange) => range.p90 / range.p10;

  it('pay-per-conversion channels are near-certain on cost per conversion, CPM and fixed fees are the widest', () => {
    const { ranges, channels } = engine.compute(inputFor({ industry: 'igaming', monthlyBudget: 150_000, markets: ['DE'] }));
    const width = (model: string) => {
      const widths = channels.filter((c) => c.buyingModel === model).map((c) => relativeWidth(ranges!.channels[c.id].costPerConversion!));
      expect(widths.length, model).toBeGreaterThan(0);
      return { min: Math.min(...widths), max: Math.max(...widths) };
    };
    expect(width('CPA').max).toBeLessThan(1.15);
    expect(width('CPA').max).toBeLessThan(width('HYBRID').min);
    expect(width('HYBRID').max).toBeLessThan(width('CPC').min);
    expect(width('CPC').max).toBeLessThan(width('CPM').min);
  });

  it('for the same buying model an experimental channel is wider than a proven one', () => {
    const { ranges, channels } = engine.compute(inputFor({ industry: 'ecommerce', monthlyBudget: 150_000, markets: ['DE'] }));
    const of = (id: string) => relativeWidth(ranges!.channels[channels.find((c) => c.id === id)!.id].conversions);
    // Both are CPM-bought: Meta is tagged proven, TikTok experimental.
    expect(of('ecommerce-tiktok')).toBeGreaterThan(of('ecommerce-meta-social'));
  });

  it('the plan is relatively less uncertain than its most uncertain channel, and more than if channels were identical twins', () => {
    const { ranges } = engine.compute(inputFor({ industry: 'saas', monthlyBudget: 60_000, markets: ['US'] }));
    const widths = Object.values(ranges!.channels).filter((set) => set.conversions.p50 > 0).map((set) => relativeWidth(set.conversions));
    expect(relativeWidth(ranges!.totals.conversions)).toBeLessThan(Math.max(...widths));
    expect(relativeWidth(ranges!.totals.conversions)).toBeGreaterThan(1);
  });
});

describe('response-curve engine: seasonality and ramp-up on the timeline', () => {
  const monthly = (input: EngineInput, start: string, months = 12) =>
    engine.computeTimeline(input, timelineFor(input, months, start)).plan.months.map((m) => m.conversions);

  it('e-commerce peaks in November and December; iGaming dips in the summer off-season', () => {
    const ecommerce = inputFor({ industry: 'ecommerce', monthlyBudget: 25_000, markets: ['DE'] });
    const paidOnly = { ...ecommerce, channels: ecommerce.channels.filter((c) => c.family === 'paid_media') };
    const year = monthly(paidOnly, '2027-01');
    expect(year.indexOf(Math.max(...year))).toBe(10);
    expect(year[11]).toBeGreaterThan(year[1]);

    const igaming = inputFor({ industry: 'igaming', monthlyBudget: 60_000, markets: ['DE'] });
    const igPaid = { ...igaming, channels: igaming.channels.filter((c) => c.family === 'paid_media') };
    const igYear = monthly(igPaid, '2027-01');
    expect(igYear.indexOf(Math.min(...igYear))).toBe(6);
  });

  it('the same months starting elsewhere in the year carry their own index', () => {
    const ecommerce = inputFor({ industry: 'ecommerce', monthlyBudget: 25_000, markets: ['DE'] });
    const paidOnly = { ...ecommerce, channels: ecommerce.channels.filter((c) => c.family === 'paid_media') };
    const fromJanuary = monthly(paidOnly, '2027-01');
    const fromNovember = monthly(paidOnly, '2027-11', 3);
    expect(fromNovember[0]).toBeCloseTo(fromJanuary[10], 6);
    expect(fromNovember[2]).toBeCloseTo(fromJanuary[0], 6);
  });

  it('industries without a seasonality prior are flat for immediate channels', () => {
    const forex = inputFor({ industry: 'forex', monthlyBudget: 60_000, markets: ['DE'] });
    const paidOnly = { ...forex, channels: forex.channels.filter((c) => c.family === 'paid_media') };
    const year = monthly(paidOnly, '2027-01');
    year.forEach((value) => expect(value).toBeCloseTo(year[0], 6));
  });

  it('SEO and influencer channels ramp up; paid media delivers from the first month', () => {
    const forex = inputFor({ industry: 'forex', monthlyBudget: 150_000, markets: ['DE'] });
    const only = (family: string) => ({ ...forex, channels: forex.channels.filter((c) => c.family === family) });
    const seo = monthly(only('seo_content'), '2027-01', 8);
    const influencer = monthly(only('influencer'), '2027-01', 8);
    expect(seo[0]).toBeGreaterThan(0);
    seo.slice(1).forEach((value, idx) => expect(value).toBeGreaterThan(seo[idx]));
    influencer.slice(1).forEach((value, idx) => expect(value).toBeGreaterThan(influencer[idx]));
    // SEO starts lower and matures later than influencers.
    expect(seo[0] / seo[7]).toBeLessThan(influencer[0] / influencer[7]);
    expect(seo[0] / seo[7]).toBeLessThan(0.4);
  });

  it('value is earned over the months after the customer is won, so profit builds up', () => {
    const saas = inputFor({ industry: 'saas', monthlyBudget: 40_000, markets: ['US'] });
    const result = engine.computeTimeline(saas, timelineFor(saas, 12));
    const profits = result.plan.months.map((m) => m.netProfit);
    expect(profits[0]).toBeLessThan(0);
    expect(profits[11]).toBeGreaterThan(profits[0]);
    // Lifetime value attributed to the period exceeds what has been earned inside it.
    const earned = result.plan.months.reduce((total, m) => total + m.netProfit + m.spend + m.operatingCosts, 0);
    expect(earned).toBeLessThan(result.plan.totals.revenue);
  });
});
