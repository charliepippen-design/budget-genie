import { generateJSON, isFreeTierLimit } from '@/lib/ai-client';
import { z } from 'zod';

export interface ReportNarratorInput {
  totalBudget: number;
  totalSpend: number;
  projectedRevenue: number;
  projectedFtds: number;
  blendedCpa: number | null;
  /** Lifetime (cohort) return on spend. */
  blendedRoas: number;
  /** Month-1 return on spend; null when not computable. */
  month1Roas?: number | null;
  paybackMonths: number | null;
  topChannel: string;
  weakestChannel: string | null;
  scenarioBase: { ltvToCac: number; projectedCohortValue: number };
  alertCount: number;
  vertical: string | null;
  geos: string[];
  currency?: string; // ISO code the user plans in
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
      currency: input.currency ?? 'EUR',
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
- Lifetime ROAS (cohort): ${input.blendedRoas.toFixed(2)}x
- Month-1 ROAS: ${input.month1Roas == null ? 'Not calculable' : input.month1Roas.toFixed(2) + 'x'}
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

export async function generateReportNarrative(
  input: ReportNarratorInput
): Promise<ReportNarrative | null> {
  try {
    const prompt = buildPrompt(input);
    // JSON must match the schema exactly; anything else is treated as no answer.
    const parsed = NarrativeSchema.safeParse(await generateJSON(`${prompt}

Return ONLY a JSON object with the fields described above.`));
    return parsed.success ? parsed.data : null;
  } catch (err) {
    // The free-tier cap is not a failure to hide: the caller shows the upgrade message.
    if (isFreeTierLimit(err)) throw err;
    console.error('Report narrative generation failed.', err);
    return null;
  }
}
