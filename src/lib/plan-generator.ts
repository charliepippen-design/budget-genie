import type { ChannelData, GlobalMultipliers } from '@/hooks/use-media-plan-store';
import {
  averageCostIndex,
  getIndustryPack,
  type ChannelTag,
  type ChannelTemplate,
  type IndustryId,
  type Objective,
  type RiskProfile,
} from '@/lib/industries';

/** Everything the planner knows about the user's situation. Built by the AI conversation or the wizard. */
export interface PlanBrief {
  industry: IndustryId;
  monthlyBudget: number;
  months: number;
  objectives: Partial<Record<Objective, number>>; // relative weights, normalized internally
  markets: string[];                              // ISO country codes
  riskProfile: RiskProfile;
  includeChannels: string[];                      // template keys the user wants
  excludeChannels: string[];                      // template keys the user refuses
  excludeTags: ChannelTag[];                      // e.g. ['restricted'] when no ad licence
  targetCpa?: number | null;
  notes: string[];                                // free-text peculiarities captured in chat
}

export const DEFAULT_BRIEF: PlanBrief = {
  industry: 'igaming',
  monthlyBudget: 50000,
  months: 6,
  objectives: { acquisition: 0.7, retention: 0.2, branding: 0.1 },
  markets: [],
  riskProfile: 'balanced',
  includeChannels: [],
  excludeChannels: [],
  excludeTags: [],
  targetCpa: null,
  notes: [],
};

export interface ChannelRationale {
  channelId: string;
  name: string;
  reason: string;
}

export interface GeneratedPlan {
  brief: PlanBrief;
  totalBudget: number;
  channels: ChannelData[];
  multipliers: Partial<GlobalMultipliers>;
  rationale: ChannelRationale[];
  skipped: { key: string; name: string; reason: string }[];
  warnings: string[];
  unallocated: number;
}

const OBJECTIVES: Objective[] = ['acquisition', 'retention', 'branding'];
const MAX_FIXED_SHARE = 0.4;

const isFixedModel = (t: ChannelTemplate) => t.buyingModel === 'FLAT_FEE' || t.buyingModel === 'RETAINER';

function normalizeObjectives(obj: PlanBrief['objectives']): Record<Objective, number> {
  const raw = OBJECTIVES.map(o => Math.max(0, Number(obj?.[o]) || 0));
  const sum = raw.reduce((a, b) => a + b, 0);
  if (sum <= 0) return { acquisition: 1, retention: 0, branding: 0 };
  return { acquisition: raw[0] / sum, retention: raw[1] / sum, branding: raw[2] / sum };
}

function riskMultiplier(t: ChannelTemplate, risk: RiskProfile): number {
  const tags = t.tags ?? [];
  if (risk === 'conservative') {
    if (tags.includes('experimental')) return 0.4;
    if (tags.includes('proven')) return 1.3;
  } else if (risk === 'aggressive') {
    if (tags.includes('experimental')) return 1.4;
    if (tags.includes('proven')) return 0.9;
  } else if (tags.includes('experimental')) {
    return 0.8;
  }
  return 1;
}

function maxChannelsForBudget(budget: number): number {
  if (budget < 10000) return 4;
  if (budget < 30000) return 6;
  if (budget < 80000) return 8;
  return 12;
}

function toChannelData(t: ChannelTemplate, industry: IndustryId, costIndex: number, spend: number, budget: number): ChannelData {
  const fixed = isFixedModel(t);
  // RevShare % is not a media cost, so it does not scale with market prices.
  const price = t.buyingModel === 'REV_SHARE' ? t.price : Math.round(t.price * costIndex * 100) / 100;
  return {
    id: `${industry}-${t.key}`,
    name: t.name,
    category: t.category,
    allocationPct: budget > 0 ? (spend / budget) * 100 : 0,
    family: t.family,
    buyingModel: t.buyingModel,
    typeConfig: {
      family: t.family,
      buyingModel: t.buyingModel,
      price,
      secondaryPrice: t.secondaryPrice,
      baselineMetrics: {
        ctr: t.ctr,
        clickToReg: t.clickToLead,
        regToFtd: t.leadToConversion,
        conversionRate: (t.clickToLead * t.leadToConversion) / 100,
        aov: t.ltv,
        expectedLtv: t.ltv,
        trafficPerUnit: t.trafficPerUnit,
        saturationCeiling: Math.round(t.saturationCeiling * costIndex),
      },
    },
    tier: fixed ? 'fixed' : 'scalable',
    maxSpendLimit: 0,
    locked: false,
    isActive: true,
  };
}

function describeReason(t: ChannelTemplate, objectives: Record<Objective, number>): string {
  const main = OBJECTIVES.reduce((best, o) => (objectives[o] * t.fit[o] > objectives[best] * t.fit[best] ? o : best), OBJECTIVES[0]);
  const label = { acquisition: 'acquisition', retention: 'retention', branding: 'brand reach' }[main];
  return t.note ? `Strong for ${label}. ${t.note}` : `Strong for ${label}.`;
}

/**
 * Deterministic plan builder: brief -> channels with budgets.
 * The AI never invents numbers; it only fills the brief and this function does the maths.
 */
export function generatePlan(input: Partial<PlanBrief>): GeneratedPlan {
  const brief: PlanBrief = { ...DEFAULT_BRIEF, ...input };
  const pack = getIndustryPack(brief.industry);
  const budget = Math.max(0, Number(brief.monthlyBudget) || 0);
  const objectives = normalizeObjectives(brief.objectives);
  const costIndex = averageCostIndex(brief.markets);
  const include = new Set(brief.includeChannels);
  const exclude = new Set(brief.excludeChannels);
  const excludeTags = new Set(brief.excludeTags);

  const skipped: GeneratedPlan['skipped'] = [];
  const warnings: string[] = [];

  // 1. Score every template
  const scored = pack.channels.flatMap(t => {
    const forced = include.has(t.key);
    if (exclude.has(t.key)) {
      skipped.push({ key: t.key, name: t.name, reason: 'Excluded by you.' });
      return [];
    }
    const blockedTag = (t.tags ?? []).find(tag => excludeTags.has(tag));
    if (blockedTag && !forced) {
      skipped.push({ key: t.key, name: t.name, reason: blockedTag === 'restricted' ? 'Needs an ad licence/certification you do not have.' : `Excluded (${blockedTag}).` });
      return [];
    }
    if (t.minBudget && budget < t.minBudget && !forced) {
      skipped.push({ key: t.key, name: t.name, reason: `Needs at least ${t.minBudget.toLocaleString('en-US')}/month to be effective.` });
      return [];
    }
    const objectiveFit = OBJECTIVES.reduce((s, o) => s + objectives[o] * t.fit[o], 0);
    if (objectiveFit < 0.15 && !forced) {
      skipped.push({ key: t.key, name: t.name, reason: 'Does not serve your objectives.' });
      return [];
    }
    const score = t.baseWeight * objectiveFit * riskMultiplier(t, brief.riskProfile) * (forced ? 1.6 : 1);
    return [{ t, score, forced }];
  });

  // 2. Keep the best N (forced channels always stay)
  scored.sort((a, b) => b.score - a.score);
  const limit = maxChannelsForBudget(budget);
  const selected = scored.filter((s, i) => s.forced || i < limit);
  scored.filter(s => !selected.includes(s)).forEach(s => skipped.push({ key: s.t.key, name: s.t.name, reason: 'Lower priority at this budget.' }));

  // 3. Fixed-fee channels take their fee first, within a cap
  const spend = new Map<string, number>();
  let fixedTotal = 0;
  const fixedCap = budget * MAX_FIXED_SHARE;
  for (const s of selected.filter(s => isFixedModel(s.t))) {
    const fee = Math.round(s.t.price * costIndex);
    if (fixedTotal + fee > fixedCap && !s.forced) {
      skipped.push({ key: s.t.key, name: s.t.name, reason: 'Fixed fee too large for this budget.' });
      continue;
    }
    spend.set(s.t.key, fee);
    fixedTotal += fee;
  }
  if (fixedTotal > budget) warnings.push('Fixed fees exceed the total budget.');

  // 4. Split the variable pool by score, respecting saturation ceilings
  const variable = selected.filter(s => !isFixedModel(s.t));
  let pool = Math.max(0, budget - fixedTotal);
  let open = [...variable];
  for (let pass = 0; pass < 6 && pool > 0.01 && open.length > 0; pass++) {
    const weight = open.reduce((sum, s) => sum + s.score, 0);
    const next: typeof open = [];
    let leftover = 0;
    for (const s of open) {
      const share = weight > 0 ? pool * (s.score / weight) : pool / open.length;
      const current = spend.get(s.t.key) ?? 0;
      const ceiling = s.t.saturationCeiling * costIndex;
      const room = Math.max(0, ceiling - current);
      if (share > room) {
        spend.set(s.t.key, current + room);
        leftover += share - room;
      } else {
        spend.set(s.t.key, current + share);
        next.push(s);
      }
    }
    pool = leftover;
    open = next;
  }
  const unallocated = Math.round(pool);
  if (unallocated > 0) {
    warnings.push(`${unallocated.toLocaleString('en-US')} could not be placed without saturating channels. Add channels or markets, or lower the budget.`);
  }

  // 5. Build store channels
  const kept = selected.filter(s => (spend.get(s.t.key) ?? 0) > 0);
  const channels = kept.map(s => toChannelData(s.t, pack.id, costIndex, spend.get(s.t.key) ?? 0, budget));
  const rationale = kept.map(s => ({ channelId: `${pack.id}-${s.t.key}`, name: s.t.name, reason: describeReason(s.t, objectives) }));

  if (channels.length === 0) warnings.push('No channel fits this brief. Loosen the exclusions or raise the budget.');

  return {
    brief,
    // plan-math spends the whole budget across variable channels, so budget that
    // would only saturate channels is held back instead of silently wasted.
    totalBudget: budget - unallocated,
    channels,
    multipliers: {
      playerValue: pack.defaultLtv,
      cpaTarget: brief.targetCpa ?? null,
    },
    rationale,
    skipped,
    warnings,
    unallocated,
  };
}
