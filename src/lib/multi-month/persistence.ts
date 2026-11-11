import { z } from 'zod';
import type { MultiMonthState } from './state';

/** localStorage key. Never rename: existing users' month plans live under it. */
export const MULTI_MONTH_STORE_KEY = 'multi-month-plan-store';
/**
 * v0: saves written before the store had a version (zustand's default).
 * v1: same shape, now versioned and validated on load.
 */
export const MULTI_MONTH_STORE_VERSION = 1;

export function partializeMultiMonth(state: MultiMonthState) {
  return {
    includeSoftLaunch: state.includeSoftLaunch,
    planningMonths: state.planningMonths,
    startMonth: state.startMonth,
    progressionPattern: state.progressionPattern,
    patternParams: state.patternParams,
    globalSettings: state.globalSettings,
    months: state.months,
    monthsCustomized: state.monthsCustomized,
    scenarios: state.scenarios,
    pdfSections: state.pdfSections,
    userNotes: state.userNotes,
  };
}

/**
 * Upgrades an older save; user data is never reset. v0 -> v1 has no shape change (validation
 * happens in merge), so this is a passthrough. Without a migrate function zustand would drop
 * any save whose version differs from the current one. Add future steps as `if (version < N)`
 * blocks that fall through in order.
 */
export function migrateMultiMonth(persistedState: unknown, _version: number): Partial<MultiMonthState> {
  return { ...((persistedState ?? {}) as Partial<MultiMonthState>) };
}

// ========== VALIDATION ==========

const finite = z.number().refine(Number.isFinite);

const PATTERNS = [
  'linear',
  'exponential',
  'u-shaped',
  'inverse-u',
  'seasonal',
  'step',
  'aggressive-launch',
  'flat',
  'custom',
] as const;

const monthChannelSchema = z.looseObject({
  channelId: z.string(),
  allocationPct: finite,
});

const monthSchema = z.looseObject({
  id: z.string(),
  budget: finite,
  channels: z.array(monthChannelSchema),
});

const globalSettingsSchema = z.looseObject({
  baseMonthlyBudget: finite,
  growthRate: finite,
});

const scenarioSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  months: z.array(monthSchema),
});

const fieldSchemas: Partial<Record<keyof MultiMonthState, z.ZodType>> = {
  includeSoftLaunch: z.boolean(),
  planningMonths: finite,
  startMonth: z.string().regex(/^\d{4}-\d{2}$/),
  progressionPattern: z.enum(PATTERNS),
  patternParams: z.record(z.string(), finite),
  globalSettings: globalSettingsSchema,
  months: z.array(monthSchema),
  monthsCustomized: z.boolean(),
  pdfSections: z.record(z.string(), z.boolean()),
  userNotes: z.string(),
};

/** Valid persisted fields only. Bad fields are dropped (defaults stay), bad scenarios skipped. */
export function sanitizePersistedMultiMonth(persisted: unknown): Partial<MultiMonthState> {
  if (!persisted || typeof persisted !== 'object' || Array.isArray(persisted)) return {};
  const saved = persisted as Record<string, unknown>;
  const out: Partial<Record<keyof MultiMonthState, unknown>> = {};

  for (const [key, schema] of Object.entries(fieldSchemas) as [keyof MultiMonthState, z.ZodType][]) {
    if (key in saved && schema.safeParse(saved[key]).success) out[key] = saved[key];
  }

  if (Array.isArray(saved.scenarios)) {
    out.scenarios = saved.scenarios.filter((sc) => scenarioSchema.safeParse(sc).success);
  }

  return out as Partial<MultiMonthState>;
}

/** JSON turns createdAt into a string; bring it back to a Date (now, if unreadable). */
function reviveDate(value: unknown): Date {
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export function mergeMultiMonth<T extends MultiMonthState>(persisted: unknown, current: T): T {
  const saved = sanitizePersistedMultiMonth(persisted);
  return {
    ...current,
    ...saved,
    scenarios: (saved.scenarios ?? current.scenarios).map((sc) => ({
      ...sc,
      createdAt: reviveDate(sc.createdAt),
    })),
  };
}
