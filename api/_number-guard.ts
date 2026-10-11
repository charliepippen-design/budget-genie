// Number guard: deterministic check that figures quoted in a reply come from the engine.
// No model is involved. Sources are plan state, brief, tool results and the user's own messages.

import type { Lang } from "./_language.js";

export const NUMBER_GUARD_NOTE: Record<Lang, string> = {
  it: "Alcune cifre in questa risposta non provengono dal motore del piano: controlla la tabella del piano.",
  en: "Some figures in this reply don't come from the plan engine: check the plan table.",
};

type Parsed = { raw: string; values: number[]; ignorable: boolean };

// optional currency prefix, number with optional thousand/decimal separators, optional suffix
const NUMBER_RE =
  /(?<![\w.,])([€$£]\s?)?(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)(\s?(?:%|€|\$|£|[kKmM](?![a-zA-Z])|[xX](?![a-zA-Z])))?(?![\w])/g;

const SUFFIX_SCALE: Record<string, number> = { k: 1e3, m: 1e6 };

/** Candidate numeric values of a digit string with "." / "," separators (ambiguous forms yield two). */
function parseDigits(s: string): number[] {
  const dots = (s.match(/\./g) ?? []).length;
  const commas = (s.match(/,/g) ?? []).length;
  const toNum = (t: string) => Number(t);
  if (dots && commas) {
    const decimalSep = s.lastIndexOf(".") > s.lastIndexOf(",") ? "." : ",";
    const thousandSep = decimalSep === "." ? "," : ".";
    return [toNum(s.split(thousandSep).join("").replace(decimalSep, "."))];
  }
  if (dots + commas === 0) return [toNum(s)];
  const sep = dots ? "." : ",";
  const count = dots || commas;
  if (count > 1) return [toNum(s.split(sep).join(""))];
  const [intPart, frac] = s.split(sep);
  if (frac.length === 3 && intPart.length <= 3 && intPart !== "0") {
    // "1.234" is 1234 (IT) or 1.234 (EN); "1,234" is 1234 (EN) or 1.234 (IT)
    return [toNum(intPart + frac), toNum(`${intPart}.${frac}`)];
  }
  return [toNum(`${intPart}.${frac}`)];
}

function extract(text: string): Parsed[] {
  const out: Parsed[] = [];
  const clean = text.replace(/^[ \t]*\d{1,2}[.)][ \t]/gm, ""); // list markers
  for (const m of clean.matchAll(NUMBER_RE)) {
    const currency = m[1];
    const digits = m[2];
    const suffix = (m[3] ?? "").trim().toLowerCase();
    let values = parseDigits(digits).filter((v) => Number.isFinite(v));
    const scale = SUFFIX_SCALE[suffix];
    if (scale) values = values.map((v) => v * scale);
    const plain = !currency && !suffix;
    const isInt = /^\d+$/.test(digits);
    const ignorable =
      (plain && isInt && Number(digits) <= 10) ||
      (!currency && suffix === "x" && isInt && Number(digits) <= 10) ||
      (plain && isInt && digits.length === 4 && Number(digits) >= 1990 && Number(digits) <= 2100);
    out.push({ raw: m[0].trim(), values, ignorable });
  }
  return out;
}

function close(a: number, b: number): boolean {
  const diff = Math.abs(a - b);
  const big = Math.max(Math.abs(a), Math.abs(b));
  if (diff <= 0.005 * big) return true;
  return diff <= (big >= 10 ? 1 : 0.1);
}

/** Returns the numeric tokens of the reply that match no source (within rounding tolerance). */
export function findUnsourcedNumbers(reply: string, sources: ReadonlyArray<number | string>): { unsourced: string[] } {
  const pool: number[] = [];
  for (const s of sources) {
    const vals = typeof s === "number" ? [s] : extract(s).flatMap((p) => p.values);
    for (const v of vals) {
      if (!Number.isFinite(v)) continue;
      const a = Math.abs(v);
      pool.push(a, a * 100, a / 100); // percent <-> share equivalence
    }
  }
  const unsourced: string[] = [];
  for (const tok of extract(reply)) {
    if (tok.ignorable) continue;
    const ok = tok.values.some((v) => pool.some((p) => close(v, p)));
    if (!ok) unsourced.push(tok.raw);
  }
  return { unsourced };
}

function walk(value: unknown, out: Array<number | string>, depth = 0) {
  if (depth > 12 || value == null) return;
  if (typeof value === "number") out.push(value);
  else if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) walk(v, out, depth + 1);
  else if (typeof value === "object") for (const v of Object.values(value as Record<string, unknown>)) walk(v, out, depth + 1);
}

/** Everything the reply may legitimately quote: plan, brief, tool results and the user's own words. */
export function collectNumberSources(
  context: Record<string, unknown> | undefined,
  messages: ReadonlyArray<{ role: string; text?: string; results?: ReadonlyArray<{ response?: unknown }> }>
): Array<number | string> {
  const out: Array<number | string> = [];
  walk(context?.plan, out);
  walk(context?.brief, out);
  for (const m of messages) {
    if (m.role === "user" && typeof m.text === "string") out.push(m.text);
    else if (m.role === "tool") for (const r of m.results ?? []) walk(r.response, out);
  }
  return out;
}
