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
const MAX_IMAGES = 4;
const MAX_IMAGE_B64 = 6_000_000;

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
      if (res.status === 401 || res.status === 403) throw new Error(errors.join(" | "));
      if (res.status !== 429 && res.status !== 503) break;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  console.error("Gemini failed:", errors);
  throw new Error("The AI model is busy or unavailable right now. Please try again in a minute.");
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
   - "we have no Google gambling licence" -> excludeTags ["restricted"] (or excludeChannels for the specific one)
   - "our affiliates work great" -> includeChannels ["affiliate-cpa"]
   - "we only sell in Italy and Spain" -> markets ["IT","ES"]
   - "we need to grow the brand" -> raise objectives.branding
   - "max €80 per customer" -> targetCpa 80
   Facts that are not a field (seasonality, product details, team limits) go in addNotes.
4. For a specific change to one channel, use adjust_channel with an id from PLAN STATE.
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

// ---------- Task: import_chat (map a messy CSV to channels) ----------

async function runImportChat(payload: { messages: AgentMessage[]; fileName: string; preview: string }) {
  const system = `You are the Import Agent of MediaPlan Pro. Help the user map this file to: Channel Name, Spend (number), Impressions (optional), Revenue (optional).
File: "${String(payload.fileName).slice(0, 200)}"
Preview (first lines):
\`\`\`
${String(payload.preview).slice(0, MAX_TEXT)}
\`\`\`
Clarify ambiguous columns briefly. When the user confirms, end your reply with a JSON block:
\`\`\`json
{ "action": "extract", "data": [ { "Channel Name": "...", "Spend": 100 } ] }
\`\`\`
Ignore total/subtotal rows. Reply in the user's language.`;
  const { parts } = await callGemini({
    systemInstruction: { parts: [{ text: system }] },
    contents: toContents(payload.messages),
    generationConfig: { temperature: 0.2 },
  });
  return splitParts(parts);
}

// ---------- Task: extract_report (screenshot of an affiliate/campaign report -> JSON) ----------

async function runExtractReport(payload: { images: { mimeType: string; data: string }[] }) {
  const images = (payload.images ?? []).slice(0, MAX_IMAGES);
  if (images.some((i) => !/^image\//.test(i.mimeType) || i.data.length > MAX_IMAGE_B64)) {
    throw new Error("Invalid image");
  }
  const prompt = `Extract the metrics from this performance report screenshot.
Return ONLY JSON: {"clicks": number, "regs": number, "ftds": number, "deposits": number, "sources": [{"source": string, "clicks": number, "regs": number, "ftds": number, "deposits": number}]}
clicks = unique visitors/clicks, regs = registrations/sign-ups, ftds = first-time depositors/customers, deposits = deposit or revenue amount (numbers only, no currency symbols). Use 0 when a metric is missing.`;
  const { parts } = await callGemini({
    contents: [{ role: "user", parts: [{ text: prompt }, ...images.map((i) => ({ inlineData: { mimeType: i.mimeType, data: i.data } }))] }],
    generationConfig: { temperature: 0, responseMimeType: "application/json" },
  });
  return splitParts(parts);
}

// ---------- Router ----------

export async function handleAIRequest(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!(await isSignedInUser(req))) return json({ error: "Sign in to use the AI planner." }, 401);

  try {
    const body = await req.json();
    const messages: AgentMessage[] = Array.isArray(body.messages) ? body.messages.slice(-MAX_MESSAGES) : [];

    switch (body.task) {
      case "planner":
        return json(await runPlanner({ messages, context: body.context }));
      case "import_chat":
        return json(await runImportChat({ messages, fileName: body.fileName, preview: body.preview }));
      case "extract_report":
        return json(await runExtractReport({ images: body.images }));
      default:
        return json({ error: "Unknown task" }, 400);
    }
  } catch (err) {
    console.error("ai-gateway error:", err);
    return json({ error: err instanceof Error ? err.message : "AI request failed" }, 500);
  }
}
