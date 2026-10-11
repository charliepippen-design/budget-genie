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
