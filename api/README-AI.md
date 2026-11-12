# AI gateway flags

All flags are read on the server from `process.env`. Their values are not secret. With no flag set the planner behaves as before.

| Flag | Values | Default | Effect |
|---|---|---|---|
| `AI_DECISIONS` | `on` / `off` | `off` | Enables the Jev decision layer: D2 router before the Gemini call and D7 reply check after it. Needs `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN`; without one the layer stays off. |
| `AI_DECISIONS_MODEL` | model id | `typesafe-ai/jev` | Decision model sent to `POST https://ai-gateway.vercel.sh/typesafe/v1/systemone`. |
| `AI_DECISIONS_ZDR` | `on` / `off` | `off` | Adds `zeroDataRetention: true` to the gateway provider options (needs a plan that supports it). |
| `AI_NUMBER_GUARD` | `log` / `annotate` / `off` | `log` | Deterministic check that figures in a final reply come from the plan, brief, tool results or the user's messages. `log` only writes `ai_number_guard {count}` (no content). `annotate` appends a fixed line in the reply language. |

## Decision layer

- D2 router (`api/_decision-router.ts`): off-topic messages and prompt injection get a fixed Italian or English reply with no Gemini call. Clear intents narrow the tool list (tools can only be removed, never added). Anything else keeps the full tool list.
- D7 reply check (`api/_reply-check.ts`): if a reply promises results, a fixed notice is appended.
- The decision model only classifies. It never writes text shown to users and never produces figures; all numbers come from the planning engine.
- Requests set `disallowPromptTraining: true` and are limited to the `typesafe-ai` and `digitalocean` providers.

## Fail-open behaviour

Every decision call has a 1500 ms timeout and no retries. On a timeout, network error, non-2xx status, malformed response, low confidence or unknown intent, the router returns `full` (today's behaviour) and the reply check leaves the reply unchanged. The number guard never throws.

## Thinking level (latency)

Gemini calls send `generationConfig.thinkingConfig.thinkingLevel` so each round trip stays fast. Each fetch also logs `ai_gemini_timing {model, ms, status, attempt}` (no content).

| Env | Values | Default | Effect |
|---|---|---|---|
| `AI_PLANNER_THINKING` | `minimal` / `low` / `medium` / `high` / `default` | `low` | Thinking level for planner chat calls. `default` sends nothing, so the model uses its own default (medium). |
| `AI_JSON_THINKING` | same | `low` | Same for the `json` task (onboarding refinement, report narrative). |

## Bring your own key (BYOK)

The shared `GEMINI_API_KEY` is a small trial: one free-tier quota for all users. A signed-in user can instead send their own Google Gemini API key with each request (created at https://aistudio.google.com/apikey; it has its own quota, and billing on it is between the user and Google).

**Request header:** `x-user-ai-key: <key>` (optional). Shape: `AIza` + 35 URL-safe characters. Anything else is refused with `400 user_key_malformed`; the gateway never falls back to the shared key for a request that carried a header.

| | Shared key (no header) | User key (header) |
|---|---|---|
| Key sent to Google | `GEMINI_API_KEY` | the header value, for every Gemini call of the request (both models, retries) |
| Clerk session | required | required |
| Per-user rate guard (`_quota.ts`: daily count, in-flight) | on | on |
| Request-size limits (`MAX_MESSAGES`, `MAX_TEXT`, `MAX_PROMPT`) | on | on |
| Free-tier monthly cap (`_usage.ts`) | on | skipped: not checked, not counted |
| "Model exhausted" memo (`_quota.ts`) | read and written | neither read nor written |
| Decision layer (`AI_DECISIONS`) | unchanged | unchanged (it uses the site's Vercel AI Gateway credentials, not Gemini) |

**Errors with a user key** (`{ error, code }`; the shared-key codes `FREE_TIER_LIMIT` and `AI_RATE_LIMITED` are never returned for these requests):

| Google answers | Gateway answers | Meaning |
|---|---|---|
| 400 with `API_KEY_INVALID` / "API key not valid" / "API key expired", or any 401 / 403 | `403 user_key_invalid` | Key mistyped, revoked, expired or restricted. No retry, no second model. |
| 429 on every model | `429 user_key_quota`, with `Retry-After` and `retryAfterSeconds` when Google gives a wait (`Retry-After` header or `RetryInfo.retryDelay`) | The user's quota is spent. |
| 404 on every model | `400 user_key_model` | The key's project cannot use the configured models. |
| anything else | `503 AI_BUSY` as today | |

**Security properties** (tests in `src/lib/ai-byok-gateway.test.ts`):

- The key lives in the request only. Nothing writes it to a store, a usage record or a cache; there is no server-side copy.
- It is never logged: `ai_gemini_timing` adds `key: "user"` for these calls, never the value. Google's error text is passed through `redactKey` before it is logged, and with a user key the catch-all logs a redacted string instead of the error object. A test captures every console call across all error paths, with an upstream that echoes the key, and searches the output for it.
- It is never returned: error bodies are fixed texts, and the same test searches response bodies and headers.
- It is sent to Google in the `x-goog-api-key` header, never in a URL.
- Same-origin only, as before: the gateway sets no CORS headers, so a browser on another origin cannot send the custom header (the preflight fails).
- In the browser the key is kept in `localStorage` (`mediaplan-user-ai-key`, see `src/lib/user-ai-key.ts`), for that browser only. It is not part of debug exports (`DEBUG_EXPORT_KEYS`) or cloud sync, and is sent only to `/api/ai-gateway`.
