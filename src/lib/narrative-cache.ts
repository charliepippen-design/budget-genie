import type { ReportNarrative, ReportNarratorInput } from '@/lib/report-narrator';

// One cache shared by /report and /output, keyed by a hash of the narrator input,
// so revisiting a page with an unchanged plan never costs another AI turn.

export const NARRATIVE_CACHE_KEY = 'mediaplan-report-narrative-v1';
export const NARRATIVE_CACHE_MAX = 5;

interface CacheEntry {
  hash: string;
  narrative: ReportNarrative;
}

/** Stable JSON: object keys sorted, so key order never changes the hash. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** FNV-1a over the canonical input (including currency), as a hex string. */
export function hashNarratorInput(input: ReportNarratorInput): string {
  const s = stableStringify(input);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function isNarrative(v: unknown): v is ReportNarrative {
  const n = v as Record<string, unknown> | null;
  return (
    !!n &&
    ['executiveSummary', 'operatorInsight', 'biggestRisk', 'firstCheckIn'].every(
      (k) => typeof n[k] === 'string'
    )
  );
}

function readAll(): CacheEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(NARRATIVE_CACHE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is CacheEntry => !!e && typeof e.hash === 'string' && isNarrative(e.narrative)
    );
  } catch {
    return [];
  }
}

export function getCachedNarrative(hash: string): ReportNarrative | null {
  return readAll().find((e) => e.hash === hash)?.narrative ?? null;
}

/** Stores the narrative as most recent and keeps only the last NARRATIVE_CACHE_MAX entries. */
export function setCachedNarrative(hash: string, narrative: ReportNarrative): void {
  const entries = [{ hash, narrative }, ...readAll().filter((e) => e.hash !== hash)].slice(
    0,
    NARRATIVE_CACHE_MAX
  );
  try {
    localStorage.setItem(NARRATIVE_CACHE_KEY, JSON.stringify(entries));
  } catch {
    // Storage full or unavailable: the summary still shows for this visit.
  }
}
