// Bring your own key (BYOK): a signed-in user may send their own Google Gemini API key with a
// request, in the `x-user-ai-key` header. The key is used for that request only: it is never
// stored, logged or echoed back. See api/README-AI.md.

export const USER_KEY_HEADER = "x-user-ai-key";

// Google has more than one key format ("AIza…", "AQ.…"), so the shape is not checked: any value
// without spaces or control characters goes to Google, which decides. The cap bounds the header size.
const USER_KEY_RE = /^[!-~]{1,512}$/;

export type UserKeyResult = { ok: true; key: string | null } | { ok: false; message: string };

/** The caller's own Gemini key, null when the header is absent, or a refusal when it is malformed. */
export function readUserKey(req: Request): UserKeyResult {
  const raw = req.headers.get(USER_KEY_HEADER);
  if (raw === null) return { ok: true, key: null };
  const key = raw.trim();
  // The regex caps the length, so an oversized header never gets past this line.
  if (!USER_KEY_RE.test(key)) {
    return {
      ok: false,
      message: "That does not look like a Gemini API key. Paste the whole key, with no spaces.",
    };
  }
  return { ok: true, key };
}

/** Removes the key from any text that may be logged or returned (Google could echo it in an error). */
export function redactKey(text: string, key: string | null | undefined): string {
  return key ? text.split(key).join("[user key]") : text;
}

/** Seconds Google asks us to wait: Retry-After header, else the RetryInfo detail ("retryDelay": "34s"). */
export function upstreamRetryAfter(header: string | null, detail: string): number | undefined {
  const fromHeader = header && /^\d+$/.test(header.trim()) ? Number(header.trim()) : NaN;
  const m = detail.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  const secs = Number.isFinite(fromHeader) ? fromHeader : m ? Number(m[1]) : NaN;
  return Number.isFinite(secs) && secs > 0 ? Math.min(3600, Math.ceil(secs)) : undefined;
}
