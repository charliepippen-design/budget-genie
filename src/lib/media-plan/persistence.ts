import { z } from 'zod';
import type { ChannelCategory } from '@/lib/mediaplan-data';
import { inferChannelFamily, inferBuyingModel } from '@/types/channel';
import { TIER_DEFAULTS } from '@/lib/geo-market-data';
import { createInitialChannels, DEFAULT_MULTIPLIERS } from './defaults';
import type { ChannelData, GlobalMultipliers } from './types';
import type { MediaPlanData, MediaPlanState } from './state';

/** localStorage key. Never rename: existing users' plans live under it. */
export const MEDIA_PLAN_STORE_KEY = 'mediaplan-store-v2';
export const MEDIA_PLAN_STORE_VERSION = 9;

/** Fills the fields a pre-v2 channel may lack, keeping everything the user saved. */
export function upgradeLegacyChannel(raw: Partial<ChannelData>): ChannelData {
  const name = raw.name ?? 'Unnamed Channel';
  const family = raw.family ?? inferChannelFamily(name);
  const buyingModel = raw.buyingModel ?? inferBuyingModel(name, family);
  return {
    ...raw,
    id: raw.id ?? crypto.randomUUID(),
    name,
    category: raw.category ?? ('Other' as ChannelCategory),
    allocationPct: raw.allocationPct ?? 0,
    family,
    buyingModel,
    typeConfig: raw.typeConfig ?? {
      family,
      buyingModel,
      price: 5,
      baselineMetrics: { ctr: 1, conversionRate: 2.5, saturationCeiling: 50000 },
    },
    tier: raw.tier ?? (buyingModel === 'RETAINER' || buyingModel === 'FLAT_FEE' ? 'fixed' : 'scalable'),
    locked: raw.locked ?? false,
    isActive: raw.isActive ?? true,
  };
}

/** The keys written to localStorage, in this order. */
export function partializeMediaPlan(state: MediaPlanData) {
  return {
    totalBudget: state.totalBudget,
    channels: state.channels,
    globalMultipliers: state.globalMultipliers,
    presets: state.presets,
    activeTiers: state.activeTiers,
    activeGeos: state.activeGeos,
    geoOverrides: state.geoOverrides,
    observedLtv: state.observedLtv,
    subscriptionTier: state.subscriptionTier,
    userStatus: state.userStatus,
    hasCompletedOnboarding: state.hasCompletedOnboarding,
    onboardingVertical: state.onboardingVertical,
    onboardingSubvertical: state.onboardingSubvertical,
    brief: state.brief,
    planRationale: state.planRationale,
    planWarnings: state.planWarnings,
  };
}

type MigrationStep = (state: Partial<MediaPlanState>) => Partial<MediaPlanState>;

/**
 * `MIGRATION_STEPS[n]` upgrades a v`n` save to v`n + 1`. Steps cascade: a save from any older
 * version runs every later step in order. User data is never reset.
 */
const MIGRATION_STEPS: Record<number, MigrationStep> = {
  // v1 used an older channel shape: keep the user's data and fill in what is missing.
  1: (state) => ({
    ...state,
    totalBudget:
      typeof state.totalBudget === 'number' && Number.isFinite(state.totalBudget)
        ? state.totalBudget
        : 50000,
    channels:
      Array.isArray(state.channels) && state.channels.length > 0
        ? state.channels.map(upgradeLegacyChannel)
        : createInitialChannels(),
    presets: Array.isArray(state.presets) ? state.presets : [],
  }),
  // isActive flag
  2: (state) => ({
    ...state,
    channels: (state.channels ?? []).map((ch) => ({ ...ch, isActive: ch.isActive ?? true })),
  }),
  3: (state) => ({
    ...state,
    activeTiers: { ...TIER_DEFAULTS, ...(state.activeTiers ?? {}) },
    activeGeos: state.activeGeos ?? [],
  }),
  4: (state) => ({ ...state, subscriptionTier: state.subscriptionTier ?? 'free' }),
  5: (state) => ({ ...state, userStatus: state.userStatus ?? 'demo' }),
  6: (state) => ({
    ...state,
    geoOverrides: state.geoOverrides ?? {},
    observedLtv: state.observedLtv ?? { m1: null, m3: null, m6: null },
  }),
  7: (state) => ({ ...state, onboardingVertical: state.onboardingVertical ?? null }),
};

export function migrateMediaPlan(persistedState: unknown, version: number): MediaPlanState {
  let state = { ...((persistedState ?? {}) as Partial<MediaPlanState>) };
  // Versions 0 and 1 share the v1 step (zustand's default version is 0).
  for (let v = Math.max(1, version); v < MEDIA_PLAN_STORE_VERSION; v++) {
    const step = MIGRATION_STEPS[v];
    if (step) state = step(state);
  }

  // Current version (also applied to v9 saves): revenue model defaults, subvertical.
  return {
    ...state,
    globalMultipliers: {
      ...DEFAULT_MULTIPLIERS,
      ...(state.globalMultipliers ?? {}),
    },
    onboardingSubvertical: state.onboardingSubvertical ?? null,
  } as MediaPlanState;
}

// ========== VALIDATION ==========
// Stored data can be stale, hand-edited, or written by an older build. Each field is checked on
// its own: a bad field falls back to the default, the rest of the save is kept.

const finite = z.number().refine(Number.isFinite);
const nullableFinite = finite.nullable();

const channelSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  allocationPct: finite,
  family: z.string(),
  buyingModel: z.string(),
  typeConfig: z.looseObject({
    price: finite.optional(),
    baselineMetrics: z.looseObject({}),
  }),
});

// Lenient on channels: presets saved before v2 hold legacy channel shapes the v1 step never upgraded.
const presetSchema = z.looseObject({
  name: z.string(),
  totalBudget: finite,
  channels: z.array(z.looseObject({})),
  globalMultipliers: z.looseObject({}).optional(),
});

const multiplierSchemas: Record<keyof GlobalMultipliers, z.ZodType> = {
  spendMultiplier: finite,
  defaultCpmOverride: nullableFinite,
  ctrBump: finite,
  cpaTarget: nullableFinite,
  roasTarget: nullableFinite,
  playerValue: finite,
  retentionRate: finite,
  regToFtdCvr: finite,
  turnoverRate: finite,
  margin: finite,
  bonusRate: finite,
};

const fieldSchemas: Partial<Record<keyof MediaPlanData, z.ZodType>> = {
  totalBudget: finite,
  projectName: z.string(),
  activeTiers: z.looseObject({ tier1: finite, tier2: finite, tier3: finite }),
  activeGeos: z.array(z.string()),
  geoOverrides: z.record(z.string(), z.looseObject({})),
  observedLtv: z.looseObject({ m1: nullableFinite, m3: nullableFinite, m6: nullableFinite }),
  subscriptionTier: z.enum(['free', 'pro', 'enterprise']),
  userStatus: z.enum(['demo', 'active']),
  hasCompletedOnboarding: z.boolean(),
  onboardingVertical: z.string().nullable(),
  onboardingSubvertical: z.string().nullable(),
  brief: z.looseObject({}).nullable(),
  planRationale: z.array(z.looseObject({})),
  planWarnings: z.array(z.string()),
};

/**
 * Channels as stored, checked one by one: valid entries are kept unchanged, legacy entries are
 * upgraded, and entries that are still unusable are dropped. A non-array value, or one where no
 * channel survives, returns undefined so the default channels are used instead of an empty plan.
 */
function validChannels(raw: unknown): ChannelData[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const kept: ChannelData[] = [];
  for (const ch of raw) {
    if (channelSchema.safeParse(ch).success) {
      kept.push(ch as ChannelData);
      continue;
    }
    if (!ch || typeof ch !== 'object' || Array.isArray(ch)) continue;
    const repaired = upgradeLegacyChannel(ch as Partial<ChannelData>);
    if (channelSchema.safeParse(repaired).success) kept.push(repaired);
  }
  return kept.length > 0 ? kept : undefined;
}

/** Valid persisted fields only, keyed as in MediaPlanData. Never throws. */
export function sanitizePersistedMediaPlan(persisted: unknown): Partial<MediaPlanData> {
  if (!persisted || typeof persisted !== 'object' || Array.isArray(persisted)) return {};
  const saved = persisted as Record<string, unknown>;
  const out: Partial<Record<keyof MediaPlanData, unknown>> = {};

  for (const [key, schema] of Object.entries(fieldSchemas) as [keyof MediaPlanData, z.ZodType][]) {
    if (key in saved && schema.safeParse(saved[key]).success) out[key] = saved[key];
  }

  if ('channels' in saved) {
    const channels = validChannels(saved.channels);
    if (channels) out.channels = channels;
  }

  if (Array.isArray(saved.presets)) {
    out.presets = saved.presets.filter((p) => presetSchema.safeParse(p).success);
  }

  if (saved.globalMultipliers && typeof saved.globalMultipliers === 'object') {
    const raw = saved.globalMultipliers as Record<string, unknown>;
    out.globalMultipliers = Object.fromEntries(
      Object.entries(raw).filter(([k, v]) => {
        const schema = multiplierSchemas[k as keyof GlobalMultipliers];
        return schema ? schema.safeParse(v).success : false;
      })
    );
  }

  return out as Partial<MediaPlanData>;
}

/**
 * Hydration: valid saved fields win, invalid or missing ones keep the in-memory defaults.
 * Multipliers are merged key by key (JSON drops undefined keys in older/broken saves).
 */
export function mergeMediaPlan<T extends MediaPlanState>(persisted: unknown, current: T): T {
  const saved = sanitizePersistedMediaPlan(persisted);
  return {
    ...current,
    ...saved,
    globalMultipliers: { ...current.globalMultipliers, ...(saved.globalMultipliers ?? {}) },
  };
}
