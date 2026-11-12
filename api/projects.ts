// Cloud save: the signed-in user's saved projects, one JSON document per user in the private
// Blob store at users/<clerkUserId>/projects.json. The path is always built from the verified
// session, never from anything in the request.
// Env: BLOB_STORE_ID (the store is connected to the Vercel project; auth is OIDC).

import { z } from "zod";
import { json, verifyClerkUser } from "./_auth.js";
import { blobConfigured, isSafeUserId, readJson, readJsonBody, writeJson } from "./_blob-store.js";

export const MAX_BODY_BYTES = 2 * 1024 * 1024;
export const MAX_PROJECTS = 200;
const MAX_TOMBSTONES = 1000;

const PlainObject = z.record(z.string(), z.unknown());
const Timestamp = z.string().min(1).max(64);

// Same rules as normalizeProject (src/lib/saved-projects.ts), without its repairs: the app
// normalises before it uploads, so anything that does not fit is refused.
const ProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  createdAt: Timestamp,
  updatedAt: Timestamp,
  mediaPlanState: PlainObject,
  multiMonthState: PlainObject,
});

const DocumentSchema = z.object({
  projects: z.array(ProjectSchema),
  deleted: z.array(z.object({ id: z.string().uuid(), deletedAt: Timestamp })).max(MAX_TOMBSTONES),
});

const EMPTY = { version: 1, updatedAt: null, projects: [], deleted: [] };

const pathFor = (userId: string) => `users/${userId}/projects.json`;

/** The caller's storage path, or the response that ends the request. */
async function authorize(req: Request): Promise<{ path: string } | { response: Response }> {
  const userId = await verifyClerkUser(req);
  if (!userId || userId === "anonymous" || !isSafeUserId(userId)) {
    return { response: json({ error: "Sign in to sync your projects." }, 401) };
  }
  if (!blobConfigured()) return { response: json({ error: "Cloud save is not configured." }, 503) };
  return { path: pathFor(userId) };
}

export async function GET(req: Request) {
  const auth = await authorize(req);
  if ("response" in auth) return auth.response;
  try {
    const stored = await readJson(auth.path);
    if (!stored) return json({ ...EMPTY, etag: null });
    const doc = DocumentSchema.safeParse(stored.data);
    // A stored document that no longer parses is reported, never served half-read or replaced.
    if (!doc.success) return json({ error: "Your cloud projects could not be read." }, 500);
    const updatedAt = (stored.data as { updatedAt?: unknown }).updatedAt;
    return json({
      version: 1,
      updatedAt: typeof updatedAt === "string" ? updatedAt : null,
      ...doc.data,
      etag: stored.etag,
    });
  } catch (e) {
    console.error("projects GET failed:", e instanceof Error ? e.message : "unknown error");
    return json({ error: "Cloud save is unavailable right now." }, 502);
  }
}

export async function PUT(req: Request) {
  const auth = await authorize(req);
  if ("response" in auth) return auth.response;

  const body = await readJsonBody(
    req,
    MAX_BODY_BYTES,
    "Your projects are too large to sync (limit 2 MB). Delete or export some projects."
  );
  if (!body.ok) return json({ error: body.error }, body.status);

  const count = Array.isArray((body.data as { projects?: unknown } | null)?.projects)
    ? (body.data as { projects: unknown[] }).projects.length
    : 0;
  if (count > MAX_PROJECTS) {
    return json({ error: `You can sync up to ${MAX_PROJECTS} projects. Delete or export some projects.` }, 413);
  }
  const doc = DocumentSchema.safeParse(body.data);
  if (!doc.success) return json({ error: "Invalid projects document." }, 400);
  if (new Set(doc.data.projects.map((p) => p.id)).size !== doc.data.projects.length) {
    return json({ error: "Invalid projects document: repeated project id." }, 400);
  }

  const updatedAt = new Date().toISOString();
  // If-Match carries the version the client merged with, so two devices never overwrite each other.
  const ifMatch = req.headers.get("if-match") ?? undefined;
  try {
    const written = await writeJson(
      auth.path,
      { version: 1, updatedAt, projects: doc.data.projects, deleted: doc.data.deleted },
      { overwrite: true, ifMatch }
    );
    if (!written.ok) {
      return json({ error: "Your projects changed on another device. Sync again." }, 409);
    }
    return json({ ok: true, updatedAt, etag: written.etag });
  } catch (e) {
    console.error("projects PUT failed:", e instanceof Error ? e.message : "unknown error");
    return json({ error: "Cloud save is unavailable right now." }, 502);
  }
}
