import { computePlanSnapshot, useMediaPlanStore, type ChannelData } from '@/hooks/use-media-plan-store';
import { DEFAULT_BRIEF, generatePlan, type PlanBrief } from '@/lib/plan-generator';
import { INDUSTRY_PACKS, getIndustryPack, type ChannelTag, type IndustryId, type Objective, type RiskProfile } from '@/lib/industries';
import type { AIToolCall } from '@/lib/ai-client';

// Bridge between the AI conversation and the deterministic engine:
// builds the context the model sees and applies the model's tool calls to the store.

type Store = ReturnType<typeof useMediaPlanStore.getState>;

const round = (n: number | null | undefined, d = 0) => (n == null || !isFinite(n) ? null : Number(n.toFixed(d)));

const isFixed = (ch: ChannelData) => ch.tier === 'fixed' || ch.buyingModel === 'FLAT_FEE' || ch.buyingModel === 'RETAINER';

export function summarizePlan(state: Store = useMediaPlanStore.getState()) {
  const { channels, blended: b } = computePlanSnapshot(state);
  const budget = state.totalBudget || 1;
  return {
    totalBudget: state.totalBudget,
    markets: state.activeGeos.length ? state.activeGeos : state.activeTiers,
    channels: channels.map(c => ({
      id: c.id,
      name: c.name,
      model: c.buyingModel,
      spend: round(c.metrics.spend),
      sharePct: round((c.metrics.spend / budget) * 100, 1),
      conversions: round(c.metrics.conversions, 1),
      cpa: round(c.metrics.cpa),
      roas: round(c.metrics.roas, 2),
      locked: c.locked,
      active: c.isActive !== false,
    })),
    blended: {
      spend: round(b.totalSpend),
      conversions: round(b.totalConversions, 1),
      costPerConversion: round(b.blendedCpa),
      grossValue: round(b.projectedRevenue),
      roas: round(b.blendedRoas, 2),
    },
    warnings: state.planWarnings,
  };
}

export function buildPlannerContext(state: Store = useMediaPlanStore.getState()) {
  const brief = state.brief;
  const pack = getIndustryPack(brief?.industry);
  return {
    industries: INDUSTRY_PACKS.map(p => ({ id: p.id, label: p.label, description: p.description })),
    brief,
    catalog: pack.channels.map(c => ({ key: c.key, name: c.name, model: c.buyingModel, tags: c.tags ?? [], minBudget: c.minBudget, note: c.note })),
    compliance: pack.complianceNotes,
    funnel: pack.funnel,
    plan: brief ? summarizePlan(state) : null, // before a brief exists the plan is demo data
  };
}

// ---------- Tool application ----------

const OBJECTIVES: Objective[] = ['acquisition', 'retention', 'branding'];
const strArray = (v: unknown) => (Array.isArray(v) ? v.map(String) : undefined);

function mergeBrief(current: PlanBrief, args: Record<string, unknown>): PlanBrief {
  const next: PlanBrief = { ...current, objectives: { ...current.objectives }, notes: [...current.notes] };

  if (typeof args.industry === 'string' && INDUSTRY_PACKS.some(p => p.id === args.industry)) {
    if (args.industry !== current.industry) {
      // Channel keys are per-industry: drop stale preferences.
      next.includeChannels = [];
      next.excludeChannels = [];
    }
    next.industry = args.industry as IndustryId;
  }
  if (typeof args.monthlyBudget === 'number' && args.monthlyBudget > 0) next.monthlyBudget = args.monthlyBudget;
  if (typeof args.months === 'number' && args.months > 0) next.months = Math.round(args.months);
  if (args.objectives && typeof args.objectives === 'object') {
    const o = args.objectives as Record<string, unknown>;
    OBJECTIVES.forEach(k => {
      if (typeof o[k] === 'number') next.objectives[k] = Math.max(0, o[k] as number);
    });
  }
  const markets = strArray(args.markets);
  if (markets) next.markets = markets.map(m => m.toUpperCase());
  if (['conservative', 'balanced', 'aggressive'].includes(args.riskProfile as string)) next.riskProfile = args.riskProfile as RiskProfile;
  const inc = strArray(args.includeChannels);
  if (inc) next.includeChannels = inc;
  const exc = strArray(args.excludeChannels);
  if (exc) next.excludeChannels = exc;
  const tags = strArray(args.excludeTags);
  if (tags) next.excludeTags = tags as ChannelTag[];
  if (typeof args.targetCpa === 'number') next.targetCpa = args.targetCpa > 0 ? args.targetCpa : null;
  const notes = strArray(args.addNotes);
  if (notes) next.notes = [...next.notes, ...notes].slice(-20);
  return next;
}

/** Set one channel to `pct` of the total budget, rescaling the other unlocked variable channels. */
export function setChannelShare(channelId: string, pct: number) {
  const state = useMediaPlanStore.getState();
  const target = state.channels.find(c => c.id === channelId);
  if (!target || isFixed(target)) return false;

  const budget = state.totalBudget || 1;
  const fixedPct = state.channels.filter(c => c.isActive !== false && isFixed(c)).reduce((s, c) => s + ((c.typeConfig?.price || 0) / budget) * 100, 0);
  const variableTotal = Math.max(0, 100 - fixedPct);
  const variable = state.channels.filter(c => c.isActive !== false && !isFixed(c) && c.id !== channelId);
  const lockedPct = variable.filter(c => c.locked).reduce((s, c) => s + c.allocationPct, 0);
  const newTarget = Math.max(0, Math.min(pct, variableTotal - lockedPct));
  const others = variable.filter(c => !c.locked);
  const othersNow = others.reduce((s, c) => s + c.allocationPct, 0);
  const othersRoom = Math.max(0, variableTotal - lockedPct - newTarget);

  const allocations: Record<string, number> = { [channelId]: newTarget };
  others.forEach(c => {
    allocations[c.id] = othersNow > 0 ? (c.allocationPct / othersNow) * othersRoom : othersRoom / others.length;
  });
  state.setAllocations(allocations);
  return true;
}

export function applyPlannerToolCall(call: AIToolCall): Record<string, unknown> {
  const store = useMediaPlanStore.getState();

  if (call.name === 'update_brief') {
    const brief = mergeBrief(store.brief ?? DEFAULT_BRIEF, call.args);
    const plan = generatePlan(brief);
    store.applyGeneratedPlan(plan);
    return {
      ok: true,
      brief,
      plan: summarizePlan(),
      rationale: plan.rationale,
      skipped: plan.skipped,
      unallocated: plan.unallocated,
    };
  }

  if (call.name === 'adjust_channel') {
    const { channelId, action, sharePct } = call.args as { channelId: string; action: string; sharePct?: number };
    const ch = store.channels.find(c => c.id === channelId);
    if (!ch) return { ok: false, error: `Unknown channel id ${channelId}` };

    switch (action) {
      case 'set_share':
        if (typeof sharePct !== 'number') return { ok: false, error: 'sharePct required' };
        if (!setChannelShare(channelId, sharePct)) return { ok: false, error: 'Fixed-fee channels have a set price; change the fee instead.' };
        break;
      case 'lock':
      case 'unlock':
        if (ch.locked !== (action === 'lock')) store.toggleChannelLock(channelId);
        break;
      case 'activate':
      case 'deactivate':
        if ((ch.isActive !== false) !== (action === 'activate')) store.toggleChannelActive(channelId);
        break;
      case 'remove':
        store.deleteChannel(channelId);
        break;
      default:
        return { ok: false, error: `Unknown action ${action}` };
    }
    return { ok: true, plan: summarizePlan() };
  }

  return { ok: false, error: `Unknown tool ${call.name}` };
}
