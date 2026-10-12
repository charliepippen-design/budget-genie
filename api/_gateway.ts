// AI gateway: the only place that holds the LLM key (runs as a Vercel Function).
// Tasks are allow-listed; prompts live here, the browser only sends data.
//
// Env: GEMINI_API_KEY (required), GEMINI_MODEL and GEMINI_FALLBACK_MODEL (optional, see _models.ts),
//      VITE_CLERK_PUBLISHABLE_KEY (used to verify signed-in users), ALLOW_ANON=true (local dev only)

import { verifyClerkSession } from "./_auth.js";
import { geminiModels } from "./_models.js";
import { admitRequest } from "./_usage.js";

import { isModelExhausted, markModelExhausted } from "./_quota.js";

const env = (k: string) => process.env[k];

// Decision layer (Jev) and number guard, see api/README-AI.md.
import { getDecisionModel } from "./_decisions.js";
import { routeMessage } from "./_decision-router.js";
import { checkReply } from "./_reply-check.js";
import { collectNumberSources, findUnsourcedNumbers, NUMBER_GUARD_NOTE } from "./_number-guard.js";
import { detectLang } from "./_language.js";
import { mentionsRegulation, REGULATORY_DISCLAIMER } from "./_regulatory.js";
import { stripFieldNames } from "./_reply-clean.js";

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

// ---------- Gemini ----------
const THINKING_LEVELS = ["minimal", "low", "medium", "high"];

/** thinkingConfig for a task from its env var. Default low; "default" sends nothing. */
function thinkingConfig(name: string): { thinkingConfig?: { thinkingLevel: string } } {
  const v = (env(name) || "low").trim().toLowerCase();
  if (v === "default") return {};
  return { thinkingConfig: { thinkingLevel: THINKING_LEVELS.includes(v) ? v : "low" } };
}

async function callGemini(body: Record<string, unknown>): Promise<{ parts: Part[] }> {
  const key = env("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY is not configured");

  const errors: string[] = [];
  let quotaExhausted = false;
  // Retry transient overloads (429/503) once per model, then fall back to the next model.
  let attempted = 0;
  for (const model of geminiModels()) {
    if (isModelExhausted(model)) continue; // daily quota already spent, resets at midnight PT
    attempted++;
    for (let attempt = 0; attempt < 2; attempt++) {
      const startedAt = Date.now();
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
      });
      console.info("ai_gemini_timing", { model, ms: Date.now() - startedAt, status: res.status, attempt });
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
        // Only a per-day limit is worth remembering; a per-minute 429 recovers on its own.
        if (/PerDay|per day/i.test(detail) || !/PerMinute|per minute/i.test(detail)) markModelExhausted(model);
        break;
      }
      if (res.status !== 429 && res.status !== 503) break;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  if (attempted === 0) quotaExhausted = true; // every model is exhausted: no fetch was made
  else console.error("Gemini failed:", errors);
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
  return `You are the planning copilot of MediaPlanner Pro, a media planning tool for performance and brand marketing.
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
   Lead with profitability using PLAN STATE.profitability: if losesMoney is true, the first sentence says the plan loses money per month, with the monthly contribution and the break-even cost per customer versus the current blended cost per customer, before any ROAS or gross value. Never present ROAS or gross value as a positive result when losesMoney is true. Never write field or key names from PLAN STATE in replies; use plain words. These numbers are engine-computed: quote them, never compute new ones.

RULES
- Never invent metrics. Quote numbers only from PLAN STATE or tool results. Benchmarks are estimates; say so if the user relies on them.
- Use only channel keys from CHANNEL CATALOG and ids from PLAN STATE.
- Flag compliance issues from COMPLIANCE NOTES when they matter.
- Never state specific regulatory facts (licence requirements, approvals, restrictions, fees, dates, regulator rulings) unless they appear in COMPLIANCE NOTES; otherwise tell the user to check with the regulator.
- Name regulators only as places to check, never as sources of claims.
- Never present compliance information as legal advice.
- Reply in the user's language. Be concise, plain words, no jargon without explanation.

INDUSTRIES: ${JSON.stringify(ctx.industries ?? [])}
CURRENT BRIEF: ${JSON.stringify(ctx.brief ?? null)}
CHANNEL CATALOG (current industry): ${JSON.stringify(ctx.catalog ?? [])}
COMPLIANCE NOTES: ${JSON.stringify(ctx.compliance ?? [])}
FUNNEL LABELS: ${JSON.stringify(ctx.funnel ?? {})}
PLAN STATE: ${JSON.stringify(ctx.plan ?? null)}`;
}

async function runPlanner(payload: { messages: AgentMessage[]; context: Record<string, unknown> }) {
  const ctx = payload.context ?? {};
  const decisions = getDecisionModel();
  const lastUser = [...payload.messages].reverse().find((m) => m.role === "user");
  const userText = lastUser && lastUser.role === "user" ? String(lastUser.text ?? "") : "";

  // D2 router: may answer with a fixed text or remove tools; any failure leaves the request untouched.
  let tools = PLANNER_TOOLS;
  if (decisions) {
    const lastAssistant = [...payload.messages].reverse().find((m) => m.role === "assistant");
    const catalog = Array.isArray(ctx.catalog) ? (ctx.catalog as { name?: unknown }[]) : [];
    const route = await routeMessage(decisions, {
      message: userText,
      lastAssistant: lastAssistant && lastAssistant.role === "assistant" ? lastAssistant.text : undefined,
      briefExists: !!ctx.brief,
      channelNames: catalog.map((c) => c?.name).filter((n): n is string => typeof n === "string"),
      availableTools: PLANNER_TOOLS.map((t) => t.name),
    });
    if (route.action === "canned" && route.cannedText) {
      return { text: route.cannedText, toolCalls: [], raw: [{ text: route.cannedText }] };
    }
    if (route.action === "narrow") tools = PLANNER_TOOLS.filter((t) => route.tools?.includes(t.name));
  }

  const planThinking = thinkingConfig("AI_PLANNER_THINKING");
  const { parts } = await callGemini({
    systemInstruction: { parts: [{ text: plannerSystemPrompt(ctx) }] },
    contents: toContents(payload.messages),
    ...(tools.length ? { tools: [{ functionDeclarations: tools }] } : {}),
    ...(planThinking.thinkingConfig ? { generationConfig: planThinking } : {}),
  });
  const result = splitParts(parts);
  result.text = stripFieldNames(result.text);

  // Post-call checks run on final text replies only.
  if (result.text && result.toolCalls.length === 0) {
    const guardMode = env("AI_NUMBER_GUARD") || "log";
    if (guardMode === "log" || guardMode === "annotate") {
      try {
        const { unsourced } = findUnsourcedNumbers(result.text, collectNumberSources(ctx, payload.messages));
        if (guardMode === "log") console.info("ai_number_guard", { count: unsourced.length });
        else if (unsourced.length) result.text += `\n\n${NUMBER_GUARD_NOTE[detectLang(userText)]}`;
      } catch {
        // the guard must never break a reply
      }
    }
    if (decisions) {
      const brief = ctx.brief as { industry?: string } | null | undefined;
      const check = await checkReply(decisions, { userMessage: userText, reply: result.text, industry: brief?.industry });
      if (check.appendNotice) result.text += `\n\n${check.appendNotice}`;
    }
    const disclaimer = REGULATORY_DISCLAIMER[detectLang(userText)];
    if (mentionsRegulation(result.text) && !result.text.includes(disclaimer)) result.text += `\n\n${disclaimer}`;
  }
  return result;
}

// ---------- Task: json (onboarding refinement, report narrative) ----------
// The prompt is built by the app; output is forced to JSON and validated client-side.

async function runJson(payload: { prompt: string }) {
  const { parts } = await callGemini({
    contents: [{ role: "user", parts: [{ text: String(payload.prompt ?? "").slice(0, MAX_PROMPT) }] }],
    generationConfig: { responseMimeType: "application/json", ...thinkingConfig("AI_JSON_THINKING") },
  });
  return splitParts(parts);
}

// ---------- Router ----------

export async function handleAIRequest(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const session = await verifyClerkSession(req);
  if (!session) return json({ error: "Sign in to use the AI planner." }, 401);

  try {
    const body = await req.json();
    const messages = trimHistory(Array.isArray(body.messages) ? body.messages : []);

    if (body.task !== "planner" && body.task !== "json") return json({ error: "Unknown task" }, 400);

    // Free-tier cap (see _usage.ts). Paid and superuser accounts pass straight through.
    const admit = await admitRequest(session.userId, session.claims, body.turnId);
    if (!admit.ok) {
      return json({ error: admit.message, code: admit.code, used: admit.used, limit: admit.limit }, admit.status);
    }

    const result =
      body.task === "planner"
        ? await runPlanner({ messages, context: body.context })
        : await runJson({ prompt: body.prompt });
    await admit.commit();
    return json(result);
  } catch (err) {
    console.error("ai-gateway error:", err);
    if (err instanceof GatewayError) return json({ error: err.message }, err.status);
    return json({ error: "AI request failed. Please try again." }, 500);
  }
}
