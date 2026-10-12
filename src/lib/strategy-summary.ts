import type { PlanHealth } from '@/lib/plan-health';

export interface StrategySummaryInput {
  channels: { name: string; spend: number }[];
  totalBudget: number;
  blendedCpa: number | null;
  blendedRoas: number;
  projectedRevenue: number;
  geos: string[];
  revenueMetric: string;
  format: (n: number) => string;
  /** Engine plan health (same as LossBanner). When it loses money the summary opens with the loss. */
  health?: PlanHealth;
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
  const { health } = input;
  const losing = !!health && health.losesMoney && health.breakEvenCpa !== null;
  if (losing && health && health.breakEvenCpa !== null) {
    const current = health.blendedCpa === null ? 'n/a' : format(health.blendedCpa);
    parts.push(
      `At these assumptions this plan loses about ${format(Math.abs(health.monthlyContribution))} per month. Break-even cost per customer is ${format(health.breakEvenCpa)} (current ${current}).`
    );
  }
  parts.push(
    `This plan deploys ${format(totalBudget)} across ${ranked.length} ${
      ranked.length === 1 ? 'channel' : 'channels'
    }, projecting ${format(projectedRevenue)} in ${input.revenueMetric.toLowerCase()} at a ${blendedRoas.toFixed(2)}x return on spend.`
  );
  if (losing) parts.push('At these assumptions that projected value does not cover the media cost.');
  else if (health && health.monthlyContribution > 0) {
    parts.push(`At these assumptions the plan earns about ${format(health.monthlyContribution)} per month.`);
  }

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
