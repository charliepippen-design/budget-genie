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

export async function generateReportNarrative(
  input: ReportNarratorInput
): Promise<ReportNarrative | null> {
  const apiKey = import.meta.env.VITE_GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    console.warn('Report narrator: No Google API key found. Narrative will not be generated.');
    return null;
  }

  const $ = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(n);

  const prompt = `
You are a senior marketing strategist writing a report for a client.
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
Instead say: return on spend, cost per click, cost per customer, lifetime value,
customer acquisition cost.
  `.trim();

  const google = createGoogleGenerativeAI({ apiKey });

  try {
    const result = await generateObject({
      model: google('gemini-2.0-flash'),
      schema: NarrativeSchema,
      prompt,
    });
    return result.object;
  } catch (error) {
    console.warn(
      'Report narrator: Primary model (gemini-2.0-flash) failed. Trying fallback...',
      error
    );
    try {
      const result = await generateObject({
        model: google('gemini-1.5-flash-latest'),
        schema: NarrativeSchema,
        prompt,
      });
      return result.object;
    } catch (fallbackError) {
      console.error('Report narrator: Both models failed. Narrative generation failed.', {
        primaryError: error,
        fallbackError,
      });
      return null;
    }
  }
}
