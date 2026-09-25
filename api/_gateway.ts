// AI gateway: the only place that holds the LLM key (runs as a Vercel Function).
// Tasks are allow-listed; prompts live here, the browser only sends data.
//
// Env: GEMINI_API_KEY (required), GEMINI_MODEL (optional),
//      VITE_CLERK_PUBLISHABLE_KEY (used to verify signed-in users), ALLOW_ANON=true (local dev only)

import { createRemoteJWKSet, jwtVerify } from "jose";

const env = (k: string) => process.env[k];

const MODEL = env("GEMINI_MODEL") || "gemini-3.5-flash";
const FALLBACK_MODEL = "gemini-flash-latest"; // alias, survives model retirements
const MAX_MESSAGES = 60;
const MAX_TEXT = 6000;
const MAX_PROMPT = 20000;

type Part = Record<string, unknown>;
type AgentMessage =
  | { role: "user"; text: string }
  | { role: "assistant"; text?: string; raw?: Part[] }
  | { role: "tool"; results: { id?: string; name: string; response: Record<string, unknown> }[] };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// ---------- Auth ----------
// Clerk session tokens are verified against Clerk's public JWKS (no secret needed).
// The frontend API host is encoded in the publishable key: pk_live_<base64(host$)>.

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function clerkJwks() {
  if (jwks) return jwks;
  const pk = env("CLERK_PUBLISHABLE_KEY") ?? env("VITE_CLERK_PUBLISHABLE_KEY") ?? "";
  const encoded = pk.replace(/^pk_(live|test)_/, "");
  if (!encoded || encoded === pk) return null;
  const host = Buffer.from(encoded, "base64").toString("utf8").replace(/\$$/, "");
  jwks = createRemoteJWKSet(new URL(`https://${host}/.well-known/jwks.json`));
  return jwks;
}

async function isSignedInUser(req: Request): Promise<boolean> {
  if (env("ALLOW_ANON") === "true") return true;
  const keySet = clerkJwks();
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!keySet || !token) return false;
  try {
    const { payload } = await jwtVerify(token, keySet);
    return !!payload.sub;
  } catch {
    return false;
  }
}

// ---------- Gemini ----------
async function callGemini(body: Record<string, unknown>): Promise<{ parts: Part[] }> {
  const key = env("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY is not configured");

  const errors: string[] = [];
  let quotaExhausted = false;
  // Retry transient overloads (429/503) once per model, then fall back to the next model.
  for (const model of [MODEL, FALLBACK_MODEL]) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        return { parts: data?.candidates?.[0]?.content?.parts ?? [] };
      }
      const detail = await res.text();
      errors.push(`${model}: ${res.status} ${detail.slice(0, 300)}`);
      if (res.status === 401 || res.status === 403) {
        console.error("Gemini auth failed:", errors);
        throw new GatewayError("The AI service key is invalid. The site owner needs to update it.", 503);
      }
      // A spent daily/monthly quota won't recover by retrying.
      if (res.status === 429 && /quota/i.test(detail)) {
        quotaExhausted = true;
        break;
      }
      if (res.status !== 429 && res.status !== 503) break;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  console.error("Gemini failed:", errors);
  if (quotaExhausted) {
    throw new GatewayError(
      "The AI usage limit has been reached for now. Your plan and sliders still work; try the chat again later.",
      429
    );
  }
  throw new GatewayError("The AI model is busy or unavailable right now. Please try again in a minute.", 503);
}

class GatewayError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** Keep the last MAX_MESSAGES, starting at a user turn: an orphan tool result or call is rejected by Gemini. */
function trimHistory(messages: AgentMessage[]): AgentMessage[] {
  const recent = messages.slice(-MAX_MESSAGES);
  const firstUser = recent.findIndex((m) => m.role === "user");
  return firstUser >= 0 ? recent.slice(firstUser) : [];
}

function toContents(messages: AgentMessage[]) {
  return messages.map((m) => {
    if (m.role === "user") return { role: "user", parts: [{ text: String(m.text).slice(0, MAX_TEXT) }] };
    if (m.role === "tool") {
      return { role: "user", parts: m.results.map((r) => ({ functionResponse: { ...(r.id ? { id: r.id } : {}), name: r.name, response: r.response } })) };
    }
    // Echo raw model parts back so function-call signatures stay valid.
    return { role: "model", parts: m.raw?.length ? m.raw : [{ text: m.text ?? "" }] };
  });
}

function splitParts(parts: Part[]) {
  const text = parts.filter((p) => typeof p.text === "string" && !p.thought).map((p) => p.text).join("\n").trim();
  const toolCalls = parts
    .filter((p) => p.functionCall)
    .map((p) => {
      const fc = p.functionCall as { id?: string; name: string; args?: Record<string, unknown> };
      return { id: fc.id, name: fc.name, args: fc.args ?? {} };
    });
  return { text, toolCalls, raw: parts };
}

// ---------- Task: planner ----------

const PLANNER_TOOLS = [
  {
    name: "update_brief",
    description:
      "Update the planning brief. The engine then rebuilds the whole channel mix from it. Send only the fields that change. Use this to create the first plan and whenever the user's situation, goals, markets or channel preferences change.",
    parameters: {
      type: "object",
      properties: {
        industry: { type: "string", enum: ["igaming", "forex", "fintech", "ecommerce", "saas"] },
        monthlyBudget: { type: "number", description: "Monthly media budget in the user's currency" },
        months: { type: "integer", description: "Campaign duration in months" },
        objectives: {
          type: "object",
          description: "Relative weights 0-1 for each objective",
          properties: {
            acquisition: { type: "number" },
            retention: { type: "number" },
            branding: { type: "number" },
          },
        },
        markets: { type: "array", items: { type: "string" }, description: "ISO 3166 alpha-2 country codes" },
        riskProfile: { type: "string", enum: ["conservative", "balanced", "aggressive"] },
        includeChannels: { type: "array", items: { type: "string" }, description: "Channel keys from the catalog the user wants (full list, replaces previous)" },
        excludeChannels: { type: "array", items: { type: "string" }, description: "Channel keys the user refuses (full list, replaces previous)" },
        excludeTags: { type: "array", items: { type: "string", enum: ["restricted", "experimental", "fixed_cost"] } },
        targetCpa: { type: "number", description: "Target cost per conversion, if the user has one" },
        addNotes: { type: "array", items: { type: "string" }, description: "Short facts about the business worth remembering" },
      },
    },
  },
  {
    name: "adjust_channel",
    description:
      "Fine-tune one channel of the current plan without rebuilding the mix. Use for requests like 'more on Meta', 'lock affiliates', 'turn off push'.",
    parameters: {
      type: "object",
      properties: {
        channelId: { type: "string", description: "Channel id from PLAN STATE" },
        action: { type: "string", enum: ["set_share", "lock", "unlock", "activate", "deactivate", "remove"] },
        sharePct: { type: "number", description: "For set_share: new % of total budget (0-100)" },
      },
      required: ["channelId", "action"],
    },
  },
];

function plannerSystemPrompt(ctx: Record<string, unknown>): string {
  return `You are the planning copilot of MediaPlan Pro, a media planning tool for performance and brand marketing.
You work together with a deterministic planning engine: YOU gather the brief and translate what the user says into brief fields and channel adjustments; THE ENGINE computes every number.

HOW TO WORK
1. Interview briefly. You need at minimum: industry, monthly budget, main objective. Ask at most 2 short questions per turn. Useful extras: markets (countries), duration, licences/ad restrictions, channels already working or refused, target CPA, risk appetite.
2. As soon as you have the minimum, call update_brief to generate a first plan. Showing a plan early beats a long interview; refine afterwards.
3. Translate every peculiarity into the brief or a channel action. Examples:
   - "we have no Google licence/verification" -> excludeChannels ["google-search"] (only that channel)
   - "we can't advertise on Google or Meta" / "no ad licences at all" -> excludeTags ["restricted"]
   - "our affiliates work great" -> includeChannels ["affiliate-cpa"]
   - "we only sell in Italy and Spain" -> markets ["IT","ES"]
   - "we need to grow the brand" -> raise objectives.branding
   - "max €80 per customer" -> targetCpa 80
   Facts that are not a field (seasonality, product details, team limits) go in addNotes.
4. For a specific change to one channel, use adjust_channel with an id from PLAN STATE. Locks, removals and
   pinned shares are remembered in the brief, so later update_brief calls keep them.
   If a tool result contains "note" or "warnings", tell the user plainly (e.g. a share that could not be reached,
   a target CPA that is not achievable, budget held back because channels would saturate).
5. After a tool result, explain the plan in 3-6 short lines: the top allocations, why, and one trade-off or risk. Mention channels that were skipped only when relevant.

RULES
- Never invent metrics. Quote numbers only from PLAN STATE or tool results. Benchmarks are estimates; say so if the user relies on them.
- Use only channel keys from CHANNEL CATALOG and ids from PLAN STATE.
- Flag compliance issues from COMPLIANCE NOTES when they matter.
- Reply in the user's language. Be concise, plain words, no jargon without explanation.

INDUSTRIES: ${JSON.stringify(ctx.industries ?? [])}
CURRENT BRIEF: ${JSON.stringify(ctx.brief ?? null)}
CHANNEL CATALOG (current industry): ${JSON.stringify(ctx.catalog ?? [])}
COMPLIANCE NOTES: ${JSON.stringify(ctx.compliance ?? [])}
FUNNEL LABELS: ${JSON.stringify(ctx.funnel ?? {})}
PLAN STATE: ${JSON.stringify(ctx.plan ?? null)}`;
}

async function runPlanner(payload: { messages: AgentMessage[]; context: Record<string, unknown> }) {
  const { parts } = await callGemini({
    systemInstruction: { parts: [{ text: plannerSystemPrompt(payload.context ?? {}) }] },
    contents: toContents(payload.messages),
    tools: [{ functionDeclarations: PLANNER_TOOLS }],
    generationConfig: { temperature: 0.4 },
  });
  return splitParts(parts);
}

// ---------- Task: json (onboarding refinement, report narrative) ----------
// The prompt is built by the app; output is forced to JSON and validated client-side.

async function runJson(payload: { prompt: string }) {
  const { parts } = await callGemini({
    contents: [{ role: "user", parts: [{ text: String(payload.prompt ?? "").slice(0, MAX_PROMPT) }] }],
    generationConfig: { temperature: 0.3, responseMimeType: "application/json" },
  });
  return splitParts(parts);
}

// ---------- Router ----------

export async function handleAIRequest(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!(await isSignedInUser(req))) return json({ error: "Sign in to use the AI planner." }, 401);

  try {
    const body = await req.json();
    const messages = trimHistory(Array.isArray(body.messages) ? body.messages : []);

    switch (body.task) {
      case "planner":
        return json(await runPlanner({ messages, context: body.context }));
      case "json":
        return json(await runJson({ prompt: body.prompt }));
      default:
        return json({ error: "Unknown task" }, 400);
    }
  } catch (err) {
    console.error("ai-gateway error:", err);
    if (err instanceof GatewayError) return json({ error: err.message }, err.status);
    return json({ error: "AI request failed. Please try again." }, 500);
  }
}
