import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateObject } from 'ai';
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

async function tryEdgeFunction(prompt: string): Promise<RefinedPlan | null> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return null;

  const res = await fetch(`${supabaseUrl}/functions/v1/generate-plan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({ prompt }),
  });

  if (!res.ok) throw new Error(`generate-plan: ${res.status}`);

  const data = await res.json();
  const parsed = RefinedPlanSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

async function tryGemini(prompt: string): Promise<RefinedPlan | null> {
  const apiKey = import.meta.env.VITE_GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) return null;

  const google = createGoogleGenerativeAI({ apiKey });

  for (const model of ['gemini-2.0-flash', 'gemini-1.5-flash-latest']) {
    try {
      const result = await generateObject({
        model: google(model),
        schema: RefinedPlanSchema,
        prompt,
      });
      return result.object;
    } catch {
      // try next model
    }
  }
  return null;
}

export async function generateOnboardingPlan(answers: WizardAnswers): Promise<RefinedPlan | null> {
  const prompt = buildPrompt(answers);

  // 1. Try secure Edge Function first
  try {
    const result = await tryEdgeFunction(prompt);
    if (result) return result;
  } catch (err) {
    console.warn('Onboarding plan: Edge function unavailable, falling back to client SDK.', err);
  }

  // 2. Fall back to direct Gemini call (works locally with VITE_GOOGLE_GENERATIVE_AI_API_KEY)
  try {
    return await tryGemini(prompt);
  } catch (err) {
    console.error('Onboarding plan generation failed.', err);
    return null;
  }
}
