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
  /** Engine plan health (same as LossBanner). When it loses money the summary opens with the loss. */
  health?: import('@/lib/plan-health').PlanHealth;
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
  return withProfitability(parts, input).join(' ');
}

/** Puts the engine profit or loss around the opening sentence (parts[0]). */
function withProfitability(parts: string[], input: StrategySummaryInput): string[] {
  const { health, format } = input;
  if (!health) return parts;
  const [opening, ...rest] = parts;
  if (health.losesMoney && health.breakEvenCpa !== null) {
    const current = health.blendedCpa === null ? 'n/a' : format(health.blendedCpa);
    return [
      `At these assumptions this plan loses about ${format(Math.abs(health.monthlyContribution))} per month. Break-even cost per customer is ${format(health.breakEvenCpa)} (current ${current}).`,
      opening,
      'At these assumptions that projected value does not cover the media cost.',
      ...rest,
    ];
  }
  if (health.monthlyContribution > 0) {
    return [opening, `At these assumptions the plan earns about ${format(health.monthlyContribution)} per month.`, ...rest];
  }
  return parts;
}
