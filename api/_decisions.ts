// Jev decision layer: small yes/no, choice and score questions answered by a decision model.
// Plain HTTP to the Vercel AI Gateway TypeSafe-compatible endpoint (no SDK, no dependency).
// The decision model never writes user-facing text or numbers; it only classifies.
//
// Env: AI_DECISIONS=on (default off), AI_DECISIONS_MODEL, AI_DECISIONS_ZDR=on,
//      AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN (auth)

export type Question =
  | { type: "noul"; instructions: string; criteria?: { true?: string; false?: string } }
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "score"; instructions: string; criteria: string[] };

export type Answer =
  | { type: "noul"; noul: number }
  | { type: "choice"; choice: string; probabilities: Record<string, number>; confidence: number }
  | { type: "score"; score: number; probabilities: Record<string, number>; confidence: number };

export interface DecisionModel {
  id: string;
  decide(state: unknown, questions: Record<string, Question>): Promise<Record<string, Answer>>;
}

export const DECISION_URL = "https://ai-gateway.vercel.sh/typesafe/v1/systemone";
export const DECISION_TIMEOUT_MS = 1500;
const DEFAULT_MODEL = "typesafe-ai/jev";

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isProbs = (v: unknown): v is Record<string, number> =>
  !!v && typeof v === "object" && !Array.isArray(v) && Object.values(v).every(isNum);

function parseAnswer(raw: unknown): Answer {
  const a = raw as Record<string, unknown> | null;
  if (!a || typeof a !== "object") throw new Error("Bad decision answer");
  if (a.type === "noul" && isNum(a.noul)) return { type: "noul", noul: a.noul };
  if (a.type === "choice" && typeof a.choice === "string" && isProbs(a.probabilities) && isNum(a.confidence)) {
    return { type: "choice", choice: a.choice, probabilities: a.probabilities, confidence: a.confidence };
  }
  if (a.type === "score" && isNum(a.score) && isProbs(a.probabilities) && isNum(a.confidence)) {
    return { type: "score", score: a.score, probabilities: a.probabilities, confidence: a.confidence };
  }
  throw new Error("Bad decision answer");
}

export function createHttpDecisionModel(token: string, model: string, zdr: boolean): DecisionModel {
  return {
    id: model,
    async decide(state, questions) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), DECISION_TIMEOUT_MS);
      try {
        const res = await fetch(DECISION_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            model,
            state,
            questions,
            providerOptions: {
              gateway: {
                disallowPromptTraining: true,
                only: ["typesafe-ai", "digitalocean"],
                ...(zdr ? { zeroDataRetention: true } : {}),
              },
            },
          }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Decision request failed: ${res.status}`);
        let data: unknown;
        try {
          data = await res.json();
        } catch {
          throw new Error("Decision response is not JSON");
        }
        const answers = (data as { answers?: unknown } | null)?.answers;
        if (!answers || typeof answers !== "object" || Array.isArray(answers)) throw new Error("Decision response has no answers");
        const out: Record<string, Answer> = {};
        for (const key of Object.keys(questions)) {
          out[key] = parseAnswer((answers as Record<string, unknown>)[key]);
        }
        return out;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** Returns null unless AI_DECISIONS=on and a gateway credential is present. */
export function decisionModelFromEnv(): DecisionModel | null {
  if (process.env.AI_DECISIONS !== "on") return null;
  const token = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
  if (!token) return null;
  return createHttpDecisionModel(token, process.env.AI_DECISIONS_MODEL || DEFAULT_MODEL, process.env.AI_DECISIONS_ZDR === "on");
}

/** Hard cap on a decision call, in case a model implementation ignores its own timeout. */
export function withDecisionTimeout<T>(p: Promise<T>, ms = DECISION_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Decision timeout")), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

let testModel: DecisionModel | null | undefined;

/** Test hook: pass a model (or null) to override the env; pass undefined to restore env behaviour. */
export function __setDecisionModelForTests(model: DecisionModel | null | undefined) {
  testModel = model;
}

export function getDecisionModel(): DecisionModel | null {
  return testModel !== undefined ? testModel : decisionModelFromEnv();
}
