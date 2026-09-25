import { generateJSON } from '@/lib/ai-client';
import { z } from 'zod';
import { TOP_IGAMING_GEOS } from './geo-market-data';
import { Vertical, VERTICAL_PRESETS } from './vertical-presets';

export interface WizardAnswers {
  budget: number;
  vertical: Vertical;
  goal: 'acquire_volume' | 'maximize_revenue' | 'test_channels' | 'maintain';
  geos: string[];
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
  const knownGeoNames = new Set(TOP_IGAMING_GEOS.map((g) => g.name));
  const validGeos = answers.geos.filter((geo) => knownGeoNames.has(geo));

  const geoContext =
    validGeos.length > 0
      ? `Target markets: ${validGeos.join(', ')}.`
      : 'No specific geos selected - using default tier blend.';

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
${TOP_IGAMING_GEOS.map((geo) => `- ${geo.name} (${geo.tier}): CPA $${geo.baselineCpa}, LTV $${geo.baselineLtv}`).join('\n')}

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
