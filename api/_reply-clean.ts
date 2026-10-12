// Deterministic safety net: the model sometimes echoes PLAN STATE field names in parentheses,
// e.g. "break-even cost per customer (breakEvenCpa)". Drop those, never touch numbers or words.

const FIELD_NAMES = [
  "breakEvenCpa",
  "blendedCpa",
  "monthlyContribution",
  "losesMoney",
  "netValueBasis",
  "costPerConversion",
  "grossValue",
  "sharePct",
  "projectedRevenue",
];

const PAREN_KEY = new RegExp(`[ \\t]*\\(\\s*\`?(?:${FIELD_NAMES.join("|")})\`?\\s*\\)`, "g");

export function stripFieldNames(text: string): string {
  if (!text) return text;
  return text
    .replace(PAREN_KEY, "")
    .replace(/(\S)[ \t]{2,}(?=\S)/g, "$1 ");
}
