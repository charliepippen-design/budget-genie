import { generateJSON } from '@/lib/ai-client';
import { z } from 'zod';
import { getOnboardingMarkets, normalizeMarketCode, TOP_IGAMING_GEOS } from './geo-market-data';
import type { IndustryId } from './industries';
import { generatePlan, type GeneratedPlan, type PlanBrief } from './plan-generator';
import { Vertical, VERTICAL_PRESETS } from './vertical-presets';

export interface WizardAnswers {
  budget: number;
  vertical: Vertical;
  goal: 'acquire_volume' | 'maximize_revenue' | 'test_channels' | 'maintain';
  geos: string[]; // ISO country codes
  benchmarks: {
    cpa?: number;
    ltv?: number;
  };
}

const RefinedPlanSchema = z.object({
  rationale: z.string(),
  channelAdjustments: z.array(
    z.object({
      channelName: z.string(),
      allocationPct: z.number().min(0).max(100),
      reasoning: z.string(),
    })
  ),
  recommendedCpaTarget: z.number().nullable(),
  recommendedRoasTarget: z.number().nullable(),
  recommendedPlayerValue: z.number().nullable(),
  keyRisk: z.string(),
  firstActionAfterLaunch: z.string(),
});

export type RefinedPlan = z.infer<typeof RefinedPlanSchema>;

function buildPrompt(answers: WizardAnswers): string {
  const preset = VERTICAL_PRESETS[answers.vertical];
  const marketNames = new Map(getOnboardingMarkets(answers.vertical).map((m) => [m.code, m.name]));
  const validGeos = answers.geos
    .map((code) => marketNames.get(normalizeMarketCode(code)))
    .filter((name): name is string => !!name);

  const geoContext =
    validGeos.length > 0
      ? `Target markets: ${validGeos.join(', ')}.`
      : 'No specific geos selected - using default tier blend.';

  const geoUniverse =
    answers.vertical === 'igaming'
      ? TOP_IGAMING_GEOS.map((geo) => `- ${geo.name} (${geo.tier}): CPA $${geo.baselineCpa}, LTV $${geo.baselineLtv}`).join('\n')
      : getOnboardingMarkets(answers.vertical).map((m) => `- ${m.name} (${m.tier})`).join('\n');

  const benchmarkContext =
    [
      answers.benchmarks.cpa ? `Known CPA: $${answers.benchmarks.cpa}` : null,
      answers.benchmarks.ltv ? `Known LTV per conversion: $${answers.benchmarks.ltv}` : null,
    ]
      .filter(Boolean)
      .join('. ') || 'No benchmarks provided - use vertical defaults.';

  const goalDescriptions: Record<WizardAnswers['goal'], string> = {
    acquire_volume: 'Maximise number of new users/conversions within budget.',
    maximize_revenue: 'Maximise revenue and LTV per user, efficiency over volume.',
    test_channels: 'Diversify across channels to identify best performers.',
    maintain: 'Maintain current performance, minimise risk.',
  };

  return `You are a senior performance marketing strategist. A client has provided these details:

Budget: $${answers.budget.toLocaleString()}/month
Vertical: ${preset.label} (${preset.description})
Goal: ${goalDescriptions[answers.goal]}
${geoContext}
${benchmarkContext}

Known geo universe and tiers:
${geoUniverse}

The starting channel mix from the vertical preset is:
${preset.channels.map((channel) => `- ${channel.name}: ${channel.allocationPct}%`).join('\n')}

Vertical defaults: CPA target $${preset.defaultCpaTarget}, ROAS target ${preset.defaultRoasTarget}x, LTV $${preset.defaultPlayerValue}.

Your job:
1. Adjust the channel allocations to best serve the client's stated goal and geo context.
   Allocations must sum to exactly 100. Use the exact channel names from the preset.
2. Recommend CPA target, ROAS target, and player LTV - use the client's benchmarks if
   provided, otherwise adjust vertical defaults based on the selected geos
   (Tier 1 geos have higher CPA/LTV; Tier 3 geos are lower).
3. Write a clear 2-3 sentence rationale a non-expert can understand. No jargon.
4. Identify the single biggest risk in this plan.
5. Tell the client what to check first after the plan goes live.

Be decisive. Do not hedge. A client with no marketing knowledge needs a clear answer.

Respond with valid JSON matching this exact shape — no markdown, no explanation around it:
{
  "rationale": "...",
  "channelAdjustments": [{ "channelName": "...", "allocationPct": 0, "reasoning": "..." }],
  "recommendedCpaTarget": 0,
  "recommendedRoasTarget": 0,
  "recommendedPlayerValue": 0,
  "keyRisk": "...",
  "firstActionAfterLaunch": "..."
}`;
}

// How each wizard goal steers the deterministic plan generator.
export const GOAL_BRIEFS: Record<WizardAnswers['goal'], Pick<PlanBrief, 'objectives' | 'riskProfile'>> = {
  acquire_volume: { objectives: { acquisition: 0.85, retention: 0.1, branding: 0.05 }, riskProfile: 'balanced' },
  maximize_revenue: { objectives: { acquisition: 0.5, retention: 0.45, branding: 0.05 }, riskProfile: 'balanced' },
  test_channels: { objectives: { acquisition: 0.6, retention: 0.2, branding: 0.2 }, riskProfile: 'aggressive' },
  maintain: { objectives: { acquisition: 0.7, retention: 0.2, branding: 0.1 }, riskProfile: 'conservative' },
};

/** Wizard verticals backed by an industry pack; lead gen and "other" have no pack. */
export function wizardVerticalToIndustry(vertical: Vertical): IndustryId | null {
  return vertical === 'igaming' || vertical === 'ecommerce' || vertical === 'saas' ? vertical : null;
}

/**
 * Plan without AI: the wizard answers (goal, markets, budget, known CPA) drive the
 * deterministic generator. Returns null when the vertical has no industry pack.
 */
export function generateWizardPlan(answers: WizardAnswers): GeneratedPlan | null {
  const industry = wizardVerticalToIndustry(answers.vertical);
  if (!industry) return null;
  return generatePlan({
    industry,
    monthlyBudget: answers.budget,
    markets: answers.geos.map(normalizeMarketCode),
    targetCpa: answers.benchmarks.cpa ?? null,
    ...GOAL_BRIEFS[answers.goal],
  });
}

export async function generateOnboardingPlan(answers: WizardAnswers): Promise<RefinedPlan | null> {
  const prompt = buildPrompt(answers);
  try {
    // JSON must match the schema exactly; anything else is treated as no answer.
    const parsed = RefinedPlanSchema.safeParse(await generateJSON(`${prompt}

Return ONLY a JSON object with the fields described above.`));
    return parsed.success ? parsed.data : null;
  } catch (err) {
    console.error('Onboarding plan generation failed.', err);
    return null;
  }
}
