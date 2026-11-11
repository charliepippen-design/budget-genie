import { beforeEach, describe, expect, it } from 'vitest';
import { computePlanResult, type EngineResult } from '@/engine';
import { useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { formatMoney } from '@/contexts/CurrencyContext';
import { generatePlan } from '@/lib/plan-generator';
import type { IndustryId } from '@/lib/industries';
import { buildAiSuggestions, MAX_AI_SUGGESTIONS, type AiSuggestion } from './ai-suggestions';

const TERMS: Record<string, { conversionPlural: string; costPerConversion: string }> = {
  igaming: { conversionPlural: 'FTDs', costPerConversion: 'Cost per FTD' },
  ecommerce: { conversionPlural: 'Orders', costPerConversion: 'Cost per Order' },
};
const eur = (value: number) => formatMoney(value, 'EUR');

function planFor(industry: IndustryId, monthlyBudget = 40000): EngineResult {
  useMediaPlanStore.getState().applyGeneratedPlan(generatePlan({ industry, monthlyBudget }));
  return computePlanResult(useMediaPlanStore.getState());
}

/** The same plan with a different set of alerts, so each chip's condition is tested on its own. */
function withAlerts(
  plan: EngineResult,
  over: { below?: string[]; saturated?: string[]; strongest?: string | null }
): EngineResult {
  const below = over.below ?? [];
  const spendOf = (id: string) => plan.channels.find((c) => c.id === id)!.metrics.spend;
  return {
    ...plan,
    strongestChannelId: over.strongest === undefined ? plan.strongestChannelId : over.strongest,
    alerts: {
      ...plan.alerts,
      belowBreakEven: below,
      weakestChannelId: below[0] ?? null,
      wastedSpend: below.reduce((sum, id) => sum + spendOf(id), 0),
      nearSaturation: over.saturated ?? [],
    },
  };
}

const ids = (list: AiSuggestion[]) => list.map((s) => s.id);
const find = (list: AiSuggestion[], id: AiSuggestion['id']) => list.find((s) => s.id === id);

beforeEach(() => {
  localStorage.clear();
});

describe.each(['igaming', 'ecommerce'] as const)('buildAiSuggestions (%s)', (industry) => {
  const terms = TERMS[industry];
  const spending = (plan: EngineResult) => plan.channels.filter((c) => c.isActive !== false && c.metrics.spend > 0);

  it('offers the chips the generated plan calls for, and only those', () => {
    const plan = planFor(industry);
    const list = buildAiSuggestions(plan, terms, eur);
    const { alerts } = plan;

    expect(list.length).toBeGreaterThanOrEqual(3);
    expect(list.length).toBeLessThanOrEqual(MAX_AI_SUGGESTIONS);
    expect(new Set(ids(list)).size).toBe(list.length);
    expect(ids(list).includes('fix-below-break-even')).toBe(alerts.belowBreakEven.length > 0);
    expect(ids(list).includes('move-weakest-to-strongest')).toBe(
      !!alerts.weakestChannelId && !!plan.strongestChannelId && alerts.weakestChannelId !== plan.strongestChannelId
    );
    expect(ids(list).includes('ease-saturation')).toBe(alerts.nearSaturation.length > 0);
    for (const s of list) {
      expect(s.label.length).toBeLessThanOrEqual(80);
      expect(s.prompt.length).toBeGreaterThan(s.label.length);
    }
  });

  it('a healthy plan gets the three evergreen chips, in the plan currency and vertical wording', () => {
    const plan = withAlerts(planFor(industry), {});
    const list = buildAiSuggestions(plan, terms, eur);

    expect(ids(list)).toEqual(['lower-cost', 'what-if-budget', 'explain']);
    expect(find(list, 'lower-cost')!.label).toBe(industry === 'igaming' ? 'Lower my cost per FTD' : 'Lower my cost per order');
    expect(find(list, 'lower-cost')!.prompt).toContain(eur(plan.totals.blendedCpa!));
    expect(find(list, 'what-if-budget')!.label).toBe('What if I add 20% budget?');
    expect(find(list, 'what-if-budget')!.prompt).toContain(eur(plan.totals.totalSpend));
    expect(find(list, 'explain')!.label).toBe('Explain this plan in 3 bullets');
    expect(find(list, 'explain')!.prompt).toContain(industry === 'igaming' ? 'FTDs' : 'orders');

    const usd = buildAiSuggestions(plan, terms, (v) => formatMoney(v, 'USD'));
    expect(find(usd, 'explain')!.prompt).toContain('$');
    expect(find(usd, 'explain')!.prompt).not.toContain('€');
  });

  it('"Fix the N channels below 1x" appears only with channels below break-even and names them', () => {
    const base = planFor(industry);
    const [a, b, c] = spending(base);

    expect(find(buildAiSuggestions(withAlerts(base, {}), terms, eur), 'fix-below-break-even')).toBeUndefined();

    const three = find(buildAiSuggestions(withAlerts(base, { below: [a.id, b.id, c.id] }), terms, eur), 'fix-below-break-even')!;
    expect(three.label).toBe('Fix the 3 channels below 1x');
    for (const ch of [a, b, c]) {
      expect(three.prompt).toContain(ch.name);
      expect(three.prompt).toContain(eur(ch.metrics.spend));
    }
    expect(three.prompt).toContain(eur(a.metrics.spend + b.metrics.spend + c.metrics.spend));

    const one = find(buildAiSuggestions(withAlerts(base, { below: [b.id] }), terms, eur), 'fix-below-break-even')!;
    expect(one.label).toBe(`Fix ${b.name}: it is below 1x`);
  });

  it('"Move 10% from weakest to strongest" needs both channels, and they must differ', () => {
    const base = planFor(industry);
    const [a, b] = spending(base);
    const move = (plan: EngineResult) => find(buildAiSuggestions(plan, terms, eur), 'move-weakest-to-strongest');

    expect(move(withAlerts(base, { strongest: b.id }))).toBeUndefined(); // no weakest
    expect(move(withAlerts(base, { below: [a.id], strongest: null }))).toBeUndefined(); // no strongest
    expect(move(withAlerts(base, { below: [a.id], strongest: a.id }))).toBeUndefined(); // same channel

    const chip = move(withAlerts(base, { below: [a.id], strongest: b.id }))!;
    expect(chip.label).toBe(`Move 10% from ${a.name} to ${b.name}`);
    expect(chip.prompt).toContain(a.name);
    expect(chip.prompt).toContain(b.name);
    expect(chip.prompt).toContain(eur(a.metrics.spend));
  });

  it('"Ease off {channel}" appears only for a channel near saturation', () => {
    const base = planFor(industry);
    const [, b] = spending(base);

    expect(find(buildAiSuggestions(withAlerts(base, {}), terms, eur), 'ease-saturation')).toBeUndefined();

    const chip = find(buildAiSuggestions(withAlerts(base, { saturated: [b.id] }), terms, eur), 'ease-saturation')!;
    expect(chip.label).toBe(`Ease off ${b.name}: it is near saturation`);
    expect(chip.prompt).toContain(b.name);
  });

  it('never returns more than five, most urgent first', () => {
    const base = planFor(industry);
    const [a, b, c] = spending(base);
    const list = buildAiSuggestions(withAlerts(base, { below: [a.id, b.id], saturated: [c.id], strongest: c.id }), terms, eur);
    expect(ids(list)).toEqual(['fix-below-break-even', 'move-weakest-to-strongest', 'ease-saturation', 'lower-cost', 'what-if-budget']);
  });

  it('"Lower my cost" needs a cost per conversion; a plan that spends nothing gets no chips', () => {
    const base = withAlerts(planFor(industry), {});
    const noCpa = { ...base, totals: { ...base.totals, blendedCpa: null } };
    expect(ids(buildAiSuggestions(noCpa, terms, eur))).toEqual(['what-if-budget', 'explain']);

    const empty = { ...base, totals: { ...base.totals, totalSpend: 0 } };
    expect(buildAiSuggestions(empty, terms, eur)).toEqual([]);
  });
});
