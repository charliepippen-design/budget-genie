// Shared Clerk session verification for Vercel Functions.
// Tokens are verified against Clerk's public JWKS (no secret needed). The frontend API host is
// encoded in the publishable key: pk_live_<base64(host$)>.

import { createRemoteJWKSet, jwtVerify } from "jose";

const env = (k: string) => process.env[k];

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function clerkJwks() {
  if (jwks) return jwks;
  const pk = env("CLERK_PUBLISHABLE_KEY") ?? env("VITE_CLERK_PUBLISHABLE_KEY") ?? "";
  const encoded = pk.replace(/^pk_(live|test)_/, "");
  if (!encoded || encoded === pk) return null;
  const host = Buffer.from(encoded, "base64").toString("utf8").replace(/\$$/, "");
  jwks = createRemoteJWKSet(new URL(`https://${host}/.well-known/jwks.json`));
  return jwks;
}

/** Clerk user id of the caller, or null. With ALLOW_ANON=true (local dev) returns "anonymous". */
export async function verifyClerkUser(req: Request): Promise<string | null> {
  if (env("ALLOW_ANON") === "true") return "anonymous";
  const keySet = clerkJwks();
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!keySet || !token) return null;
  try {
    const { payload } = await jwtVerify(token, keySet);
    return typeof payload.sub === "string" && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
