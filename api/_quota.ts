// Per-user quota guard for the AI gateway (abuse and shared-project-quota protection).
// Env (not secret): AI_QUOTA=on|off (default on), AI_QUOTA_USER_DAILY (default 60),
//                   AI_QUOTA_USER_INFLIGHT (default 2). Invalid values fall back to defaults.
//
// Storage is per serverless instance (best effort): counters live in memory and are not shared
// across instances or cold starts. Week 3 swaps in the ai_usage table behind the QuotaStore interface.

import { verifyClerkUser } from "./_auth.js";

const env = (k: string) => process.env[k];

const DEFAULT_DAILY = 60;
const DEFAULT_INFLIGHT = 2;
const MAX_KEYS = 10_000;
const INFLIGHT_TTL_SEC = 120; // safety net if a release is ever missed
const BUSY_RETRY_SEC = 5;

export interface QuotaStore {
  incr(key: string, ttlSec: number): number;
  get(key: string): number;
  set(key: string, value: number, ttlSec: number): void;
  del(key: string): void;
}

export class MemoryQuotaStore implements QuotaStore {
  private map = new Map<string, { value: number; expires: number }>();

  private live(key: string) {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (e.expires <= Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    return e;
  }

  private put(key: string, value: number, expires: number) {
    this.map.delete(key); // re-insert so the Map order stays oldest-first
    this.map.set(key, { value, expires });
    while (this.map.size > MAX_KEYS) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }

  incr(key: string, ttlSec: number): number {
    const e = this.live(key);
    const value = (e?.value ?? 0) + 1;
    this.put(key, value, e?.expires ?? Date.now() + ttlSec * 1000);
    return value;
  }

  get(key: string): number {
    return this.live(key)?.value ?? 0;
  }

  set(key: string, value: number, ttlSec: number): void {
    this.put(key, value, Date.now() + ttlSec * 1000);
  }

  del(key: string): void {
    this.map.delete(key);
  }
}

let defaultStore: QuotaStore = new MemoryQuotaStore();
const exhaustedModels = new Map<string, number>(); // model -> epoch ms until which it is skipped

/** Test helper: clears the default store and the model exhaustion memo. */
export function __resetQuotaForTests(): void {
  defaultStore = new MemoryQuotaStore();
  exhaustedModels.clear();
}

function positiveInt(raw: string | undefined, fallback: number): number {
  if (!raw || !/^\d+$/.test(raw.trim())) return fallback;
  const n = Number(raw.trim());
  return n > 0 ? n : fallback;
}

export function quotaConfig(): { enabled: boolean; userDaily: number; userInflight: number } {
  return {
    enabled: (env("AI_QUOTA") ?? "on").trim().toLowerCase() !== "off",
    userDaily: positiveInt(env("AI_QUOTA_USER_DAILY"), DEFAULT_DAILY),
    userInflight: positiveInt(env("AI_QUOTA_USER_INFLIGHT"), DEFAULT_INFLIGHT),
  };
}

export type QuotaDecision =
  | { ok: true; release: () => void }
  | { ok: false; status: 429; error: string; code: "AI_DAILY_LIMIT" | "AI_BUSY"; retryAfterSec: number };

export function checkUserQuota(userId: string, now: Date = new Date(), store: QuotaStore = defaultStore): QuotaDecision {
  const cfg = quotaConfig();
  const nextUtcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  const untilResetSec = Math.max(1, Math.ceil((nextUtcMidnight - now.getTime()) / 1000));

  const dailyKey = `ai:daily:${userId}:${now.toISOString().slice(0, 10)}`;
  if (store.get(dailyKey) >= cfg.userDaily) {
    const hours = Math.max(1, Math.ceil(untilResetSec / 3600));
    return {
      ok: false,
      status: 429,
      error: `You've reached today's AI limit. Your plan, sliders and exports still work; the AI resets in about ${hours} ${hours === 1 ? "hour" : "hours"}.`,
      code: "AI_DAILY_LIMIT",
      retryAfterSec: untilResetSec,
    };
  }

  const inflightKey = `ai:inflight:${userId}`;
  if (store.get(inflightKey) >= cfg.userInflight) {
    return {
      ok: false,
      status: 429,
      error: "The AI is still answering your previous request. Try again in a moment.",
      code: "AI_BUSY",
      retryAfterSec: BUSY_RETRY_SEC,
    };
  }

  store.incr(dailyKey, untilResetSec);
  store.incr(inflightKey, INFLIGHT_TTL_SEC);
  let released = false;
  return {
    ok: true,
    release: () => {
      if (released) return;
      released = true;
      const left = store.get(inflightKey) - 1;
      if (left > 0) store.set(inflightKey, left, INFLIGHT_TTL_SEC);
      else store.del(inflightKey);
    },
  };
}

export function withQuotaGuard(
  handler: (req: Request) => Promise<Response>,
  deps: {
    verify?: (req: Request) => Promise<string | null>;
    store?: QuotaStore;
    now?: () => Date;
  } = {}
): (req: Request) => Promise<Response> {
  const verify = deps.verify ?? verifyClerkUser;
  return async (req) => {
    if (req.method !== "POST" || !quotaConfig().enabled) return handler(req);
    // No user: pass through so the handler returns its usual 401. "anonymous" (local dev) is exempt.
    const userId = await verify(req);
    if (!userId || userId === "anonymous") return handler(req);

    const decision = checkUserQuota(userId, deps.now?.() ?? new Date(), deps.store);
    if (!decision.ok) {
      return new Response(JSON.stringify({ error: decision.error, code: decision.code }), {
        status: decision.status,
        headers: { "Content-Type": "application/json", "Retry-After": String(decision.retryAfterSec) },
      });
    }
    try {
      return await handler(req);
    } finally {
      decision.release();
    }
  };
}

// ---------- Model exhaustion memo ----------
export function isModelExhausted(model: string, now: Date = new Date()): boolean {
  const until = exhaustedModels.get(model);
  if (until === undefined) return false;
  if (until <= now.getTime()) {
    exhaustedModels.delete(model);
    return false;
  }
  return true;
}

/** Skip this model until the next midnight America/Los_Angeles (when Gemini daily quotas reset). */
export function markModelExhausted(model: string, now: Date = new Date()): void {
  exhaustedModels.set(model, nextPacificMidnight(now).getTime());
}

const ptFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});

/** Pacific wall-clock fields of an instant, expressed as a UTC timestamp (ms). */
function ptWallAsUtc(d: Date): number {
  const p: Record<string, number> = {};
  for (const part of ptFormat.formatToParts(d)) if (part.type !== "literal") p[part.type] = Number(part.value);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

/** The instant of the next 00:00 in America/Los_Angeles strictly after `now` (DST-safe). */
export function nextPacificMidnight(now: Date): Date {
  const wall = new Date(ptWallAsUtc(now));
  const targetWall = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() + 1);
  // Convert the wall time back to an instant; two passes settle the offset across DST changes.
  let guess = targetWall;
  for (let i = 0; i < 2; i++) {
    guess = targetWall - (ptWallAsUtc(new Date(guess)) - guess);
  }
  return new Date(guess);
}
