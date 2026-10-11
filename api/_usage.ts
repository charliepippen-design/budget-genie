// Free-tier AI cap: 10 AI "turns" per calendar month (UTC) per Clerk user.
//
// A turn is one user chat message (or one one-shot JSON generation). The client tags every gateway
// request of a turn with the same turnId, so a chat message that needs several model round trips
// counts once. Only turnIds not seen this month count toward the cap. A single turnId may make at
// most MAX_REQUESTS_PER_TURN requests, so a reused id cannot be a loophole.
//
// Storage is chosen at runtime by which env vars exist (no new env is required to deploy):
//   1. Clerk privateMetadata via the Backend API  (CLERK_SECRET_KEY)
//   2. Vercel KV / Upstash Redis REST             (KV_REST_API_URL + KV_REST_API_TOKEN, or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN)
//   3. In-memory, per serverless instance         (best-effort only: resets on cold start, not shared)

export const FREE_TURNS_PER_MONTH = 10;
export const MAX_REQUESTS_PER_TURN = 6;

const env = (k: string) => process.env[k];

export interface UsageRecord {
  month: string; // "YYYY-MM" (UTC)
  turns: Record<string, number>; // turnId -> requests made in that turn
}

export interface UsageStore {
  readonly name: string;
  readonly persistent: boolean;
  load(userId: string): Promise<UsageRecord | null>;
  save(userId: string, record: UsageRecord): Promise<void>;
}

export const monthKey = (now: Date = new Date()) => now.toISOString().slice(0, 7);

const TURN_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

/** Valid client turnId, or null (callers then treat the request as its own turn). */
export function normalizeTurnId(value: unknown): string | null {
  return typeof value === "string" && TURN_ID_RE.test(value) ? value : null;
}

// ---------- Plan lookup ----------

export type Plan = "paid" | "free" | "unknown";

const truthy = (v: unknown) => v === true || v === "true" || v === 1 || v === "1";

/** Same rules as src/hooks/use-payment-status.ts: payment_status or superuser means unlimited. */
export function planFromMetadata(meta: unknown): Plan {
  if (!meta || typeof meta !== "object") return "unknown";
  const m = meta as Record<string, unknown>;
  const superuser = truthy(m.is_superuser) || m.role === "superuser";
  return superuser || truthy(m.payment_status) ? "paid" : "free";
}

/** Reads publicMetadata from a custom Clerk session-token claim, if the instance exposes one. */
export function planFromClaims(claims: Record<string, unknown> | undefined): Plan {
  if (!claims) return "unknown";
  const meta = claims.metadata ?? claims.public_metadata ?? claims.publicMetadata;
  return meta ? planFromMetadata(meta) : "unknown";
}

interface ClerkUser {
  public_metadata?: Record<string, unknown>;
  private_metadata?: { ai_usage?: Partial<UsageRecord> };
}

async function clerkGetUser(userId: string): Promise<ClerkUser> {
  const key = env("CLERK_SECRET_KEY");
  if (!key) throw new Error("CLERK_SECRET_KEY is not configured");
  const res = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`Clerk user lookup failed: ${res.status}`);
  return res.json();
}

/**
 * Paid / free for this caller.
 * - Local dev (ALLOW_ANON=true, user "anonymous"): "unknown", the cap is not enforced.
 * - No trustworthy paid signal (no session-token metadata claim and no CLERK_SECRET_KEY): "free",
 *   so the cap is enforced. Payments are not live yet, so this cannot lock out paying customers;
 *   once CLERK_SECRET_KEY is set (or the Clerk session token exposes public metadata), paid and
 *   superuser accounts are recognised and bypass the cap.
 * - A failed Clerk lookup (secret set, API error) yields "unknown" (fail open for possibly-paid users).
 */
export async function resolvePlan(claims: Record<string, unknown> | undefined, userId: string): Promise<Plan> {
  if (env("ALLOW_ANON") === "true" && userId === "anonymous") return "unknown";
  const fromClaims = planFromClaims(claims);
  if (fromClaims !== "unknown") return fromClaims;
  if (!env("CLERK_SECRET_KEY")) return "free";
  try {
    return planFromMetadata((await clerkGetUser(userId)).public_metadata ?? {});
  } catch (err) {
    console.error("usage: plan lookup failed, not enforcing cap:", err);
    return "unknown";
  }
}

// ---------- Stores ----------

const memory = new Map<string, UsageRecord>();
export const memoryStore: UsageStore = {
  name: "memory",
  persistent: false,
  async load(userId) {
    return memory.get(userId) ?? null;
  },
  async save(userId, record) {
    memory.set(userId, record);
  },
};

export function clerkStore(): UsageStore {
  return {
    name: "clerk-private-metadata",
    persistent: true,
    async load(userId) {
      const usage = (await clerkGetUser(userId)).private_metadata?.ai_usage;
      return usage && typeof usage.month === "string" && usage.turns && typeof usage.turns === "object"
        ? (usage as UsageRecord)
        : null;
    },
    async save(userId, record) {
      const res = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(userId)}/metadata`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${env("CLERK_SECRET_KEY")}`, "Content-Type": "application/json" },
        body: JSON.stringify({ private_metadata: { ai_usage: record } }),
      });
      if (!res.ok) throw new Error(`Clerk usage save failed: ${res.status}`);
    },
  };
}

export function kvStore(url: string, token: string): UsageStore {
  const command = async (...args: (string | number)[]) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    if (!res.ok) throw new Error(`KV request failed: ${res.status}`);
    return (await res.json()).result;
  };
  const key = (userId: string) => `ai_usage:${userId}`;
  return {
    name: "kv-rest",
    persistent: true,
    async load(userId) {
      const raw = await command("GET", key(userId));
      if (!raw) return null;
      try {
        return JSON.parse(raw) as UsageRecord;
      } catch {
        return null;
      }
    },
    async save(userId, record) {
      await command("SET", key(userId), JSON.stringify(record), "EX", 60 * 60 * 24 * 45);
    },
  };
}

/** Picks the adapter from the environment. Clerk first, then KV/Upstash, else per-instance memory. */
export function selectStore(): UsageStore {
  if (env("CLERK_SECRET_KEY")) return clerkStore();
  const url = env("KV_REST_API_URL") || env("UPSTASH_REDIS_REST_URL");
  const token = env("KV_REST_API_TOKEN") || env("UPSTASH_REDIS_REST_TOKEN");
  if (url && token) return kvStore(url, token);
  return memoryStore;
}

let warnedMemory = false;
function warnIfMemory(store: UsageStore) {
  if (!store.persistent && !warnedMemory) {
    warnedMemory = true;
    console.warn(
      "usage: no persistent store configured (CLERK_SECRET_KEY or KV_REST_API_URL/TOKEN). " +
        "Free-tier AI cap is best-effort, per serverless instance."
    );
  }
}

// ---------- Counting ----------

export interface UsageCheck {
  allowed: boolean;
  used: number;
  limit: number;
  /** Record to persist once the request succeeded (null when nothing changes). */
  next: UsageRecord | null;
}

/** Pure counting logic. A new month discards the previous record. */
export function evaluateUsage(
  record: UsageRecord | null,
  turnId: string | null,
  now: Date = new Date(),
  limit = FREE_TURNS_PER_MONTH
): UsageCheck {
  const month = monthKey(now);
  const turns = record && record.month === month ? { ...record.turns } : {};
  const used = Object.keys(turns).length;
  // No turnId: the request is its own turn, so it can never reuse a counted one.
  const id = turnId ?? `req-${now.getTime()}-${Math.random().toString(36).slice(2, 10)}`;
  const seen = turns[id];

  if (seen !== undefined) {
    if (seen >= MAX_REQUESTS_PER_TURN) return { allowed: false, used, limit, next: null };
    turns[id] = seen + 1;
    return { allowed: true, used, limit, next: { month, turns } };
  }
  if (used >= limit) return { allowed: false, used, limit, next: null };
  turns[id] = 1;
  return { allowed: true, used: used + 1, limit, next: { month, turns } };
}

export type AdmitResult =
  | { ok: true; commit: () => Promise<void> }
  | { ok: false; status: 429 | 503; code: "FREE_TIER_LIMIT" | "USAGE_UNAVAILABLE"; message: string; used?: number; limit?: number };

/**
 * Gate for one gateway request. Paid, superuser and unknown-plan callers pass untouched.
 * Free callers: over the cap -> 429 FREE_TIER_LIMIT; store failure -> 503 USAGE_UNAVAILABLE (fail closed).
 * Call commit() after the model call succeeded so a failed upstream call does not burn a turn.
 */
export async function admitRequest(
  userId: string,
  claims: Record<string, unknown> | undefined,
  turnId: unknown,
  deps: { store?: UsageStore; now?: Date; resolve?: typeof resolvePlan } = {}
): Promise<AdmitResult> {
  const noop = { ok: true as const, commit: async () => {} };
  if (userId === "anonymous") return noop; // ALLOW_ANON local dev

  const plan = await (deps.resolve ?? resolvePlan)(claims, userId);
  if (plan !== "free") return noop;

  const store = deps.store ?? selectStore();
  warnIfMemory(store);

  let check: UsageCheck;
  try {
    check = evaluateUsage(await store.load(userId), normalizeTurnId(turnId), deps.now);
  } catch (err) {
    console.error("usage: store read failed, refusing free-tier request:", err);
    return {
      ok: false,
      status: 503,
      code: "USAGE_UNAVAILABLE",
      message: "We could not check your free AI usage right now. Please try again in a moment.",
    };
  }

  if (!check.allowed) {
    return {
      ok: false,
      status: 429,
      code: "FREE_TIER_LIMIT",
      message: `You have used all ${check.limit} free AI messages for this month. Upgrade for unlimited AI planning.`,
      used: check.used,
      limit: check.limit,
    };
  }

  return {
    ok: true,
    commit: async () => {
      if (!check.next) return;
      try {
        await store.save(userId, check.next);
      } catch (err) {
        // The user already got their answer; do not turn that into an error.
        console.error("usage: store write failed:", err);
      }
    },
  };
}
