// Tiny language heuristic shared by the decision layer: Italian or English.

const IT = /\b(il|lo|la|le|gli|una|che|per|con|non|sono|come|della|del|dei|delle|nel|nella|voglio|vorrei|quanto|quanti|mi|ho|abbiamo|puoi|piano|mercato|mercati|grazie|ciao|anche|più|perché|cosa|dove|quale|budget)\b|[àèéìòù]/gi;
const EN = /\b(the|and|for|with|what|how|want|would|can|you|please|plan|my|our|is|are|to|of|in|this|that)\b/gi;

export type Lang = "it" | "en";

export function detectLang(text: string): Lang {
  const it = (text.match(IT) ?? []).length;
  const en = (text.match(EN) ?? []).length;
  return it > en ? "it" : "en";
}
