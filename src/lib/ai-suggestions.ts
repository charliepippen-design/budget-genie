import type { EngineResult } from '@/engine';

// Suggestion chips for the AI command bar. Pure: every figure quoted in a prompt is read from the
// engine result, never computed here, so a chip can never disagree with the dashboard.

export interface AiSuggestion {
  id: 'fix-below-break-even' | 'move-weakest-to-strongest' | 'ease-saturation' | 'lower-cost' | 'what-if-budget' | 'explain';
  /** Short text on the chip. */
  label: string;
  /** Self-contained message sent to the AI planner. */
  prompt: string;
}

export interface AiSuggestionTerms {
  /** e.g. 'Orders', 'FTDs'. */
  conversionPlural: string;
  /** e.g. 'Cost per Order', 'Cost per FTD'. */
  costPerConversion: string;
}

export const MAX_AI_SUGGESTIONS = 5;

/** 'Cost per Order' -> 'cost per order', 'Cost per FTD' -> 'cost per FTD' (acronyms keep their case). */
const midSentence = (term: string) =>
  term
    .split(' ')
    .map((word) => (/[A-Z].*[A-Z]/.test(word) ? word : word.toLowerCase()))
    .join(' ');

const times = (roas: number) => `${roas.toFixed(2)}x`;

/**
 * Up to five suggestions for the current plan, most urgent first. A chip is offered only when the
 * plan gives it a reason (see each block); a plan that spends nothing gets none.
 */
export function buildAiSuggestions(
  plan: EngineResult,
  terms: AiSuggestionTerms,
  formatMoney: (value: number) => string
): AiSuggestion[] {
  const { alerts, totals } = plan;
  if (!(totals.totalSpend > 0)) return [];

  const byId = new Map(plan.channels.map((c) => [c.id, c]));
  const conversions = midSentence(terms.conversionPlural);
  const cost = midSentence(terms.costPerConversion);
  const spendLine = `My plan spends ${formatMoney(totals.totalSpend)} a month`;
  const out: AiSuggestion[] = [];

  // Channels returning less than they cost.
  const losing = alerts.belowBreakEven.flatMap((id) => byId.get(id) ?? []);
  if (losing.length > 0) {
    const one = losing.length === 1;
    const list = losing
      .map((c) => `${c.name} (${formatMoney(c.metrics.spend)} a month, return ${times(c.metrics.roas)})`)
      .join('; ');
    out.push({
      id: 'fix-below-break-even',
      label: one ? `Fix ${losing[0].name}: it is below 1x` : `Fix the ${losing.length} channels below 1x`,
      prompt:
        `${one ? 'This channel returns less than it costs' : 'These channels return less than they cost'} (below 1x): ${list}. ` +
        `${one ? 'It spends' : 'Together they spend'} ${formatMoney(alerts.wastedSpend)} a month. ` +
        `Cut or pause ${one ? 'it' : 'them'} and move that budget to the channels that return more than 1x, keeping my total monthly budget the same. ` +
        `Then tell me what you changed.`,
    });
  }

  // A clear loser and a clear winner.
  const weakest = alerts.weakestChannelId ? byId.get(alerts.weakestChannelId) : undefined;
  const strongest = plan.strongestChannelId ? byId.get(plan.strongestChannelId) : undefined;
  if (weakest && strongest && weakest.id !== strongest.id) {
    out.push({
      id: 'move-weakest-to-strongest',
      label: `Move 10% from ${weakest.name} to ${strongest.name}`,
      prompt:
        `Move 10% of the budget that is on ${weakest.name} (${formatMoney(weakest.metrics.spend)} a month, return ${times(weakest.metrics.roas)}) ` +
        `to ${strongest.name} (${formatMoney(strongest.metrics.spend)} a month, return ${times(strongest.metrics.roas)}). ` +
        `Leave every other channel as it is, then tell me how ${conversions} and the overall return change.`,
    });
  }

  // A channel spending close to its ceiling.
  const saturated = alerts.nearSaturation.flatMap((id) => byId.get(id) ?? [])[0];
  if (saturated) {
    const pct = plan.channelInsights[saturated.id]?.saturationPct;
    out.push({
      id: 'ease-saturation',
      label: `Ease off ${saturated.name}: it is near saturation`,
      prompt:
        `${saturated.name} spends ${formatMoney(saturated.metrics.spend)} a month, ${pct != null ? `${pct}% of` : 'close to'} its saturation ceiling, so extra budget there buys very little. ` +
        `Lower its share and move the difference to channels that still have room to grow, keeping my total monthly budget the same. ` +
        `Then tell me what you changed.`,
    });
  }

  if (totals.blendedCpa != null && totals.blendedCpa > 0) {
    out.push({
      id: 'lower-cost',
      label: `Lower my ${cost}`,
      prompt:
        `${spendLine} and my blended ${cost} is ${formatMoney(totals.blendedCpa)}. ` +
        `Rebalance the channel mix to bring the ${cost} down without changing the total monthly budget, ` +
        `then tell me which channels you changed and why.`,
    });
  }

  out.push({
    id: 'what-if-budget',
    label: 'What if I add 20% budget?',
    prompt:
      `${spendLine}. What if I add 20% to the monthly budget? Do not change the plan yet: ` +
      `tell me which channels you would put the extra money on and what it should do to ${conversions} and the overall return, ` +
      `then ask me whether to apply it.`,
  });

  out.push({
    id: 'explain',
    label: 'Explain this plan in 3 bullets',
    prompt:
      `Explain my current media plan in 3 short bullets: where the ${formatMoney(totals.totalSpend)} a month goes, ` +
      `what it should return in ${conversions}, and the biggest risk. Do not change anything.`,
  });

  return out.slice(0, MAX_AI_SUGGESTIONS);
}
