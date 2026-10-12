// Deterministic regulatory-mention detector and fixed disclaimer for planner replies.
import type { Lang } from "./_language.js";

// Acronyms are matched case-sensitively so ordinary words are not caught.
const ACRONYMS = /\b(UKGC|AGCO|GGL|ADM|DGOJ|MGA|KSA|FCA|CySEC|ESMA|CONSOB|BaFin|SEC)\b/;
const TERMS =
  /gambling commission|igaming ontario|gl(?:ü|ue|u)cksspiel|spelinspektionen|licen[cs](?:e|es|ed|ing|a|e)\b|regulator|regolator|gambling advertising rules/i;

export function mentionsRegulation(text: string): boolean {
  return ACRONYMS.test(text) || TERMS.test(text);
}

export const REGULATORY_DISCLAIMER: Record<Lang, string> = {
  it: "Le note normative sono informazioni generali, non consulenza legale. Le regole cambiano spesso: verifica con l'autorità competente o con un legale prima del lancio.",
  en: "Regulatory notes are general information, not legal advice. Rules change often: check with the regulator or a qualified lawyer before you launch.",
};
