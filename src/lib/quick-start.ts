import { z } from 'zod';
import type { CurrencyCode } from '@/contexts/CurrencyContext';
import { computePlanResult } from '@/engine';
import { aiErrorMessage, generateJSON, isFreeTierLimit } from '@/lib/ai-client';
import { getOnboardingMarkets, normalizeMarketCode } from '@/lib/geo-market-data';
import { getIndustryPack, INDUSTRY_IDS, INDUSTRY_PACKS, industryToVertical, type IndustryId } from '@/lib/industries';
import { DEFAULT_MULTIPLIERS } from '@/lib/media-plan/defaults';
import { GOAL_BRIEFS } from '@/lib/onboarding-ai';
import { GOAL_OPTIONS, type OnboardingGoal } from '@/lib/onboarding-goals';
import type { GeneratedPlan, PlanBrief } from '@/lib/plan-generator';
import { isValidBudget } from '@/lib/wizard-budget';

/** What the quick start screen collects. Everything else in the brief keeps its default. */
export interface QuickStartForm {
  industry: IndustryId | null;
  budget: number | '';
  goal: OnboardingGoal;
  /** ISO country codes. */
  markets: string[];
  /** Raw text of the optional target cost per conversion. */
  targetCpa: string;
}

export const INITIAL_QUICK_START: QuickStartForm = {
  industry: null,
  budget: '',
  goal: 'acquire_volume',
  markets: [],
  targetCpa: '',
};

export type QuickStartField = 'industry' | 'budget' | 'goal' | 'markets' | 'targetCpa';

export const QUICK_START_FIELD_LABELS: Record<QuickStartField, string> = {
  industry: 'industry',
  budget: 'budget',
  goal: 'goal',
  markets: 'markets',
  targetCpa: 'target cost',
};

/** Example chips: a short label on the chip, the full sentence in the text box. */
export const QUICK_START_EXAMPLES = [
  {
    label: 'Online casino, €60k, Germany + Canada',
    text: 'Online casino, €60k/month, Germany and Canada, more first-time depositors',
  },
  {
    label: 'B2B SaaS, 25k, US + UK',
    text: 'B2B SaaS, 25k a month in the US and UK, testing new channels',
  },
  {
    label: 'Fashion e-commerce, 15k, Italy + Spain',
    text: 'Fashion e-commerce in Italy and Spain, 15k monthly, cost per sale under 30',
  },
] as const;

export function parseTargetCpa(raw: string): number | undefined {
  const parsed = Number.parseFloat(raw.replace(/,/g, '').trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/** The generator brief for the current selections; null until industry and budget are valid. */
export function quickStartBrief(form: QuickStartForm): Partial<PlanBrief> | null {
  if (!form.industry || !isValidBudget(form.budget)) return null;
  return {
    industry: form.industry,
    monthlyBudget: form.budget,
    markets: form.markets.map(normalizeMarketCode),
    targetCpa: parseTargetCpa(form.targetCpa) ?? null,
    ...GOAL_BRIEFS[form.goal],
  };
}

export interface PlanPreview {
  channelCount: number;
  /** Every channel with spend, largest first; shares are % of plan spend. */
  channels: Array<{ id: string; name: string; sharePct: number }>;
  conversions: number;
  costPerConversion: number | null;
}

/** Headline figures of a generated plan, read from the planning engine. */
export function previewPlan(plan: GeneratedPlan): PlanPreview {
  const result = computePlanResult({
    totalBudget: plan.totalBudget,
    channels: plan.channels,
    globalMultipliers: { ...DEFAULT_MULTIPLIERS, ...plan.multipliers },
    activeTiers: plan.geo.activeTiers,
    activeGeos: plan.geo.activeGeos,
    geoOverrides: {},
    onboardingVertical: industryToVertical(plan.brief.industry),
    observedLtv: { m1: null, m3: null, m6: null },
  });
  const channels = plan.channels
    .map((c) => ({ id: c.id, name: c.name, sharePct: result.channelInsights[c.id]?.spendSharePct ?? 0 }))
    .filter((c) => c.sharePct > 0)
    .sort((a, b) => b.sharePct - a.sharePct);
  return {
    channelCount: channels.length,
    channels,
    conversions: result.totals.totalConversions,
    costPerConversion: result.totals.blendedCpa,
  };
}

// ---------- "Fill with AI": free text -> brief fields ----------

const GOAL_KEYS = GOAL_OPTIONS.map((g) => g.key) as [OnboardingGoal, ...OnboardingGoal[]];

// Each field is validated on its own: one bad value drops that field, not the whole answer.
const QuickBriefSchema = z.object({
  industry: z.enum(INDUSTRY_IDS as [IndustryId, ...IndustryId[]]).nullable().catch(null),
  monthlyBudget: z.number().finite().positive().nullable().catch(null),
  markets: z.array(z.string()).catch([]),
  goal: z.enum(GOAL_KEYS).nullable().catch(null),
  targetCpa: z.number().finite().positive().nullable().catch(null),
});

export type QuickBrief = z.infer<typeof QuickBriefSchema>;

export function buildQuickBriefPrompt(text: string, currency: CurrencyCode): string {
  return `You read one sentence from a marketer and extract the brief for a media plan.
Extract only what the text states. Do not plan, do not suggest channels, do not invent numbers.

Text: """${text.trim().slice(0, 600)}"""

Return ONLY a JSON object with exactly these fields:
{
  "industry": one of ${INDUSTRY_PACKS.map((p) => `"${p.id}" (${p.label})`).join(', ')}, or null if none fits,
  "monthlyBudget": the monthly media budget as a plain number in ${currency} ("60k" is 60000; do not convert currencies), or null,
  "markets": the countries as ISO 3166-1 alpha-2 codes, e.g. ["DE", "CA"]; [] when none is named,
  "goal": one of ${GOAL_OPTIONS.map((g) => `"${g.key}" (${g.title})`).join(', ')}, or null,
  "targetCpa": the target cost per conversion as a plain number in ${currency}, or null
}
Use null for anything the text does not say.`;
}

export type QuickFillResult =
  | { ok: true; patch: Partial<QuickStartForm>; filled: QuickStartField[]; skippedMarkets: string[] }
  | { ok: false; message: string };

export const QUICK_FILL_FALLBACK = 'Pick the basics below instead: the plan does not need the AI.';

/** Turns a validated AI answer into form values, keeping only markets the screen offers. */
export function quickBriefToPatch(
  brief: QuickBrief,
  currentIndustry: IndustryId | null
): Extract<QuickFillResult, { ok: true }> {
  const patch: Partial<QuickStartForm> = {};
  const filled: QuickStartField[] = [];
  if (brief.industry) {
    patch.industry = brief.industry;
    filled.push('industry');
  }
  if (brief.monthlyBudget) {
    patch.budget = Math.round(brief.monthlyBudget);
    filled.push('budget');
  }
  if (brief.goal) {
    patch.goal = brief.goal;
    filled.push('goal');
  }
  const offered = new Set(getOnboardingMarkets(brief.industry ?? currentIndustry).map((m) => m.code));
  const codes = [...new Set(brief.markets.map(normalizeMarketCode))];
  const markets = codes.filter((code) => offered.has(code));
  if (markets.length > 0) {
    patch.markets = markets;
    filled.push('markets');
  }
  if (brief.targetCpa) {
    patch.targetCpa = String(brief.targetCpa);
    filled.push('targetCpa');
  }
  return { ok: true, patch, filled, skippedMarkets: codes.filter((code) => !offered.has(code)) };
}

/** Asks the AI for brief fields only. Never throws: a failure comes back as a message to show inline. */
export async function fillBriefWithAI(
  text: string,
  currency: CurrencyCode,
  currentIndustry: IndustryId | null = null
): Promise<QuickFillResult> {
  try {
    const parsed = QuickBriefSchema.safeParse(await generateJSON(buildQuickBriefPrompt(text, currency)));
    const result = parsed.success ? quickBriefToPatch(parsed.data, currentIndustry) : null;
    if (!result || result.filled.length === 0) {
      return { ok: false, message: `The AI could not find plan details in that. ${QUICK_FILL_FALLBACK}` };
    }
    return result;
  } catch (err) {
    console.error('Quick start AI fill failed.', err);
    const reason = isFreeTierLimit(err)
      ? aiErrorMessage(err, 'You have used the free AI requests for now.')
      : 'The AI is not available right now.';
    return { ok: false, message: `${reason} ${QUICK_FILL_FALLBACK}` };
  }
}

/** Short card copy per industry; the pack label and description are longer than a card allows. */
export const INDUSTRY_CARDS: Record<IndustryId, { title: string; tagline: string }> = {
  igaming: { title: 'iGaming', tagline: 'Casino and sportsbook' },
  forex: { title: 'Forex & CFD', tagline: 'Brokers and trading platforms' },
  fintech: { title: 'Fintech', tagline: 'Neobank, payments, investing apps' },
  ecommerce: { title: 'E-commerce', tagline: 'Online retail and DTC brands' },
  saas: { title: 'B2B SaaS', tagline: 'Software sold to businesses' },
};

export const industryFunnel = (industry: IndustryId | null) => (industry ? getIndustryPack(industry).funnel : null);
