/**
 * Drops sentences that make guarantee-style promises from AI-generated text
 * (EN + IT). Use before showing any LLM prose in the UI.
 */
const BANNED_CLAIMS: RegExp[] = [
  /\bguarantee[ds]?\b/i,
  /\bguaranteeing\b/i,
  /\brisk[- ]free\b/i,
  /\bassured\b/i,
  /\bcertain (?:returns?|profits?|results?|wins?)\b/i,
  /\b100\s?%/,
  /\bgarantit\w*/i,
  /\bgaranzi\w*/i,
  /\bacquisizioni sicure\b/i,
  /\b(?:ritorni|risultati|guadagni|profitti) sicuri\b/i,
  /\bsenza rischi?\b/i,
];

export function isBannedClaim(sentence: string): boolean {
  return BANNED_CLAIMS.some(re => re.test(sentence));
}

export function filterBannedClaims(text: string | null | undefined): string {
  if (!text) return '';
  const sentences = text.match(/[^.!?]+(?:[.!?]+|$)/g) ?? [];
  return sentences
    .map(s => s.trim())
    .filter(s => s.length > 0 && !isBannedClaim(s))
    .join(' ');
}
