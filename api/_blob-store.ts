// JSON documents in the project's private Vercel Blob store (cloud-saved projects, share links).
// On Vercel the SDK authenticates with the deployment's OIDC token + BLOB_STORE_ID: there is no
// read-write token to configure or leak.

import { BlobPreconditionFailedError, del, get, put } from "@vercel/blob";

/** False in local dev and on a deployment without the store: callers answer 503. */
export const blobConfigured = () => !!process.env.BLOB_STORE_ID;

export interface StoredJson {
  data: unknown;
  etag: string;
}

/** The latest stored document (never a CDN copy), or null when there is none. */
export async function readJson(path: string): Promise<StoredJson | null> {
  const result = await get(path, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return null;
  return { data: JSON.parse(await new Response(result.stream).text()), etag: result.blob.etag };
}

export type WriteJsonResult = { ok: true; etag: string } | { ok: false; reason: "conflict" };

/**
 * Writes a document at an exact path. `ifMatch` makes the write conditional on the stored
 * version; `overwrite: false` refuses to replace an existing document.
 */
export async function writeJson(
  path: string,
  data: unknown,
  options: { overwrite: boolean; ifMatch?: string }
): Promise<WriteJsonResult> {
  try {
    const result = await put(path, JSON.stringify(data), {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: options.overwrite,
      ...(options.ifMatch ? { ifMatch: options.ifMatch } : {}),
    });
    return { ok: true, etag: result.etag };
  } catch (e) {
    if (e instanceof BlobPreconditionFailedError) return { ok: false, reason: "conflict" };
    throw e;
  }
}

export const removeJson = (path: string) => del(path);

export type BodyResult = { ok: true; data: unknown } | { ok: false; status: number; error: string };

/** Reads a JSON request body, refusing anything larger than `maxBytes` (declared or actual). */
export async function readJsonBody(req: Request, maxBytes: number, tooLarge: string): Promise<BodyResult> {
  if (Number(req.headers.get("content-length") ?? 0) > maxBytes) return { ok: false, status: 413, error: tooLarge };
  let text: string;
  try {
    text = await req.text();
  } catch {
    return { ok: false, status: 400, error: "Invalid request body." };
  }
  if (Buffer.byteLength(text, "utf8") > maxBytes) return { ok: false, status: 413, error: tooLarge };
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400, error: "Invalid request body." };
  }
}

/** Clerk user ids are used as a path segment, so anything unusual is refused before it is used. */
export const isSafeUserId = (userId: string) => /^[A-Za-z0-9_-]{1,128}$/.test(userId);
