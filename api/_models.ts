// Gemini model names in one place. Explicit versions, no "latest" aliases, so a silent
// re-route by Google cannot change behaviour or quota buckets under us.
//
// Env (both optional): GEMINI_MODEL (primary), GEMINI_FALLBACK_MODEL (fallback)

export const DEFAULT_MODEL = "gemini-3.6-flash";
export const DEFAULT_FALLBACK_MODEL = "gemini-3.5-flash-lite"; // GA, separate free-tier quota bucket

/** Models to try in order. Read at call time so env overrides apply without a reload. */
export function geminiModels(): string[] {
  return [process.env.GEMINI_MODEL || DEFAULT_MODEL, process.env.GEMINI_FALLBACK_MODEL || DEFAULT_FALLBACK_MODEL];
}
