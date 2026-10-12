import { LIFETIME_ROAS_LABEL, MONTH1_ROAS_LABEL } from '@/lib/roas-pair';

export interface StrategySummaryInput {
  channels: { name: string; spend: number }[];
  totalBudget: number;
  blendedCpa: number | null;
  blendedRoas: number;
  month1Roas?: number | null;
  projectedRevenue: number;
  geos: string[];
  revenueMetric: string;
  format: (n: number) => string;
}

/**
 * Deterministic, engine-based strategy summary built only from plan numbers.
 * Used whenever there is no AI narrative, so the section never stays empty.
 */
export function buildStrategySummary(input: StrategySummaryInput): string {
  const { channels, totalBudget, blendedCpa, blendedRoas, projectedRevenue, geos, format } = input;
  const ranked = channels.filter((c) => c.spend > 0).sort((a, b) => b.spend - a.spend);
  const totalSpend = ranked.reduce((s, c) => s + c.spend, 0);

  const parts: string[] = [];
  parts.push(
    `This plan deploys ${format(totalBudget)} across ${ranked.length} ${
      ranked.length === 1 ? 'channel' : 'channels'
    }, projecting ${format(projectedRevenue)} in ${input.revenueMetric.toLowerCase()} at a ${blendedRoas.toFixed(2)}x ${LIFETIME_ROAS_LABEL}${
      input.month1Roas == null ? '' : ` and ${input.month1Roas.toFixed(2)}x ${MONTH1_ROAS_LABEL}`
    }.`
  );

  if (ranked.length > 0 && totalSpend > 0) {
    const top = ranked
      .slice(0, 3)
      .map((c) => `${c.name} (${Math.round((c.spend / totalSpend) * 100)}%)`);
    parts.push(`Most of the budget goes to ${top.join(', ')}.`);
  }
  if (blendedCpa) parts.push(`The blended cost per customer is ${format(blendedCpa)}.`);
  parts.push(
    geos.length > 0
      ? `The main market${geos.length > 1 ? 's are' : ' is'} ${geos.slice(0, 3).join(', ')}.`
      : 'The plan targets a global reach.'
  );
  return parts.join(' ');
}
