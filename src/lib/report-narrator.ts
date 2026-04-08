import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';

export interface ReportNarratorInput {
  totalBudget: number;
  totalSpend: number;
  projectedRevenue: number;
  projectedFtds: number;
  blendedCpa: number | null;
  blendedRoas: number;
  paybackMonths: number | null;
  topChannel: string;
  weakestChannel: string | null;
  scenarioBase: { ltvToCac: number; projectedCohortValue: number };
  alertCount: number;
  vertical: string | null;
  geos: string[];
}

const NarrativeSchema = z.object({
  executiveSummary: z.string(),
  operatorInsight: z.string(),
  biggestRisk: z.string(),
  firstCheckIn: z.string(),
});

export type ReportNarrative = z.infer<typeof NarrativeSchema>;

function buildPrompt(input: ReportNarratorInput): string {
  const $ = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(n);

  return `You are a senior marketing strategist writing a report for a client.
The client may be a CMO with no marketing knowledge OR a campaign manager.
Write clearly for both.

Plan data:
- Total monthly budget: ${$(input.totalBudget)}
- Projected spend deployed: ${$(input.totalSpend)}
- Projected revenue (Month 1): ${$(input.projectedRevenue)}
- Projected new customers: ${Math.round(input.projectedFtds).toLocaleString()}
- Blended cost per customer: ${input.blendedCpa ? $(input.blendedCpa) : 'Not calculable'}
- Blended ROAS: ${input.blendedRoas.toFixed(2)}x
- Estimated payback period: ${input.paybackMonths ? input.paybackMonths + ' months' : 'Not calculable'}
- Top performing channel: ${input.topChannel}
- Weakest channel: ${input.weakestChannel ?? 'None identified'}
- LTV to CAC ratio (Base scenario): ${input.scenarioBase.ltvToCac.toFixed(2)}x
- Projected cohort value (lifetime): ${$(input.scenarioBase.projectedCohortValue)}
- Active efficiency alerts: ${input.alertCount}
- Vertical: ${input.vertical ?? 'Not specified'}
- Target markets: ${input.geos.length > 0 ? input.geos.join(', ') : 'Global'}

Write the narrative. No jargon - a CMO should understand every word.
Never use the words: ROAS, CPM, CPC, CPA, FTD, LTV, CAC, programmatic.
Instead say: return on spend, cost per click, cost per customer, lifetime value, customer acquisition cost.

Respond with valid JSON matching this exact shape — no markdown, no explanation around it:
{
  "executiveSummary": "2-3 sentences leading with return on investment",
  "operatorInsight": "2-3 sentences for the campaign manager, specific and actionable",
  "biggestRisk": "Single sentence — the one thing most likely to break this plan",
  "firstCheckIn": "Single sentence — what to look at after week 1"
}`;
}

async function tryEdgeFunction(prompt: string): Promise<ReportNarrative | null> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return null;

  const res = await fetch(`${supabaseUrl}/functions/v1/generate-narrative`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({ prompt }),
  });

  if (!res.ok) throw new Error(`generate-narrative: ${res.status}`);

  const data = await res.json();
  const parsed = NarrativeSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

async function tryGemini(prompt: string): Promise<ReportNarrative | null> {
  const apiKey = import.meta.env.VITE_GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) return null;

  const google = createGoogleGenerativeAI({ apiKey });

  for (const model of ['gemini-2.0-flash', 'gemini-1.5-flash-latest']) {
    try {
      const result = await generateObject({
        model: google(model),
        schema: NarrativeSchema,
        prompt,
      });
      return result.object;
    } catch {
      // try next model
    }
  }
  return null;
}

export async function generateReportNarrative(
  input: ReportNarratorInput
): Promise<ReportNarrative | null> {
  const prompt = buildPrompt(input);

  // 1. Try secure Edge Function first
  try {
    const result = await tryEdgeFunction(prompt);
    if (result) return result;
  } catch (err) {
    console.warn('Report narrator: Edge function unavailable, falling back to client SDK.', err);
  }

  // 2. Fall back to direct Gemini call (works locally with VITE_GOOGLE_GENERATIVE_AI_API_KEY)
  try {
    return await tryGemini(prompt);
  } catch (err) {
    console.error('Report narrative generation failed.', err);
    return null;
  }
}
