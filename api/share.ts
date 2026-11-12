// Share links: an immutable, read-only snapshot of a plan at shares/<id>.json in the private
// Blob store. The id is 128 random bits and is the only way to reach a snapshot: there is no
// listing endpoint. POST and DELETE need a signed-in user; GET is public and never returns ownerId.
// Env: BLOB_STORE_ID (the store is connected to the Vercel project; auth is OIDC).

import { z } from "zod";
import { json, verifyClerkUser } from "./_auth.js";
import { blobConfigured, isSafeUserId, readJson, readJsonBody, removeJson, writeJson } from "./_blob-store.js";

export const MAX_SHARE_BYTES = 512 * 1024;
const SHARE_ID = /^[A-Za-z0-9_-]{22,64}$/;

const PlainObject = z.record(z.string(), z.unknown());

// Only what the engine reads (see EngineSource in src/engine/input.ts). zod drops every other key,
// so account fields (subscriptionTier, userStatus), presets and the brief never reach a snapshot.
const PlanSchema = z.object({
  totalBudget: z.number().finite().min(0),
  channels: z.array(PlainObject).max(200),
  globalMultipliers: PlainObject,
  activeTiers: PlainObject.optional(),
  activeGeos: z.array(z.string().max(64)).max(500).optional(),
  geoOverrides: PlainObject.optional(),
  onboardingVertical: z.string().max(32).nullable().optional(),
  observedLtv: PlainObject.optional(),
});

const ShareRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  currency: z.string().regex(/^[A-Z]{3}$/),
  vertical: z.string().max(32).nullable().optional(),
  mediaPlanState: PlanSchema,
});

const StoredShareSchema = z.object({
  version: z.literal(1),
  id: z.string(),
  createdAt: z.string(),
  ownerId: z.string(),
  name: z.string(),
  mediaPlanState: PlainObject,
  currency: z.string(),
  vertical: z.string().nullable(),
});

const pathFor = (id: string) => `shares/${id}.json`;

const newShareId = () => Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64url");

/** Public responses are never cached or indexed: a revoked link must stop working at once. */
const publicJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });

const NOT_CONFIGURED = { error: "Share links are not configured." };
const NOT_FOUND = { error: "This shared plan does not exist or was removed." };

async function signedInUser(req: Request): Promise<string | null> {
  const userId = await verifyClerkUser(req);
  return userId && userId !== "anonymous" && isSafeUserId(userId) ? userId : null;
}

const shareIdOf = (req: Request) => {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  return SHARE_ID.test(id) ? id : null;
};

export async function POST(req: Request) {
  const ownerId = await signedInUser(req);
  if (!ownerId) return json({ error: "Sign in to share a plan." }, 401);
  if (!blobConfigured()) return json(NOT_CONFIGURED, 503);

  const body = await readJsonBody(req, MAX_SHARE_BYTES, "This plan is too large to share (limit 512 KB).");
  if (!body.ok) return json({ error: body.error }, body.status);
  const parsed = ShareRequestSchema.safeParse(body.data);
  if (!parsed.success) return json({ error: "Invalid plan." }, 400);

  const id = newShareId();
  const snapshot = {
    version: 1,
    id,
    createdAt: new Date().toISOString(),
    ownerId,
    name: parsed.data.name,
    mediaPlanState: parsed.data.mediaPlanState,
    currency: parsed.data.currency,
    vertical: parsed.data.vertical ?? parsed.data.mediaPlanState.onboardingVertical ?? null,
  };
  try {
    // overwrite: false, so a snapshot can never be replaced once its link is out.
    await writeJson(pathFor(id), snapshot, { overwrite: false });
    return json({ id });
  } catch (e) {
    console.error("share POST failed:", e instanceof Error ? e.message : "unknown error");
    return json({ error: "Could not create the share link. Please try again." }, 502);
  }
}

export async function GET(req: Request) {
  const id = shareIdOf(req);
  if (!id) return publicJson(NOT_FOUND, 404);
  if (!blobConfigured()) return publicJson(NOT_CONFIGURED, 503);
  try {
    const stored = await readJson(pathFor(id));
    const share = stored ? StoredShareSchema.safeParse(stored.data) : null;
    if (!share?.success) return publicJson(NOT_FOUND, 404);
    const { ownerId: _ownerId, ...publicSnapshot } = share.data;
    return publicJson(publicSnapshot);
  } catch (e) {
    console.error("share GET failed:", e instanceof Error ? e.message : "unknown error");
    return publicJson({ error: "This shared plan could not be loaded. Please try again." }, 502);
  }
}

export async function DELETE(req: Request) {
  const userId = await signedInUser(req);
  if (!userId) return json({ error: "Sign in to remove a share link." }, 401);
  const id = shareIdOf(req);
  if (!id) return json(NOT_FOUND, 404);
  if (!blobConfigured()) return json(NOT_CONFIGURED, 503);
  try {
    const stored = await readJson(pathFor(id));
    const share = stored ? StoredShareSchema.safeParse(stored.data) : null;
    if (!share?.success) return json(NOT_FOUND, 404);
    if (share.data.ownerId !== userId) return json({ error: "Only the owner can remove this share link." }, 403);
    await removeJson(pathFor(id));
    return json({ ok: true });
  } catch (e) {
    console.error("share DELETE failed:", e instanceof Error ? e.message : "unknown error");
    return json({ error: "Could not remove the share link. Please try again." }, 502);
  }
}
