// D7 reply check: after Gemini returns final text, ask whether the reply promises results.
// If so, append a fixed notice. Fails open: on any error the reply is left unchanged.

import { withDecisionTimeout, type DecisionModel, type Question } from "./_decisions.js";
import { PROMISES_RESULTS_MIN } from "./_decision-thresholds.js";
import { resolveLang, type Lang } from "./_language.js";

export const RESULTS_NOTICE: Record<Lang, string> = {
  it: "Le cifre sono stime del motore di pianificazione, non garanzie.",
  en: "Figures are engine estimates, not guarantees.",
};

const QUESTIONS: Record<string, Question> = {
  promisesResults: {
    type: "noul",
    instructions: "Does the reply promise or guarantee specific business results?",
    criteria: { true: "It guarantees or promises outcomes.", false: "It describes estimates or plan structure only." },
  },
  sameLanguage: {
    type: "noul",
    instructions: "Is the reply written in the same language as the user's message?",
  },
};

export type ReplyCheck = { appendNotice?: string; flags: { promisesResults?: number; sameLanguage?: number } };

export async function checkReply(
  model: DecisionModel,
  input: { userMessage: string; reply: string; industry?: string; uiLang?: string }
): Promise<ReplyCheck> {
  try {
    const answers = await withDecisionTimeout(
      model.decide({ userMessage: input.userMessage.slice(0, 1500), reply: input.reply.slice(0, 4000), industry: input.industry }, QUESTIONS)
    );
    const p = answers.promisesResults;
    const s = answers.sameLanguage;
    const flags = {
      promisesResults: p?.type === "noul" ? p.noul : undefined,
      sameLanguage: s?.type === "noul" ? s.noul : undefined,
    };
    if (flags.promisesResults !== undefined && flags.promisesResults >= PROMISES_RESULTS_MIN) {
      return { appendNotice: RESULTS_NOTICE[resolveLang(input.userMessage, input.uiLang)], flags };
    }
    return { flags };
  } catch {
    return { flags: {} };
  }
}
