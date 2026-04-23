# MediaPlanner Pro 🚀

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg) ![Status](https://img.shields.io/badge/status-production-green.svg)

## Official Launch v1.0

MediaPlanner Pro is the ultimate budget scaling and allocation tool for iGaming professionals.

## Features

- **Project Vault**: Save and load multiple media plans secured by Supabase.
- **AI Advisor**: "MediaPlanner Pro Advisor" helps you optimize spend and identify waste.
- **Multi-Month Strategy**: Distribute budgets across custom growth curves (Linear, Exponential, Seasonality).
- **Cloud-Ready**: Auto-save, data validation, and offline support.

## Tech Stack

- **Frontend**: React + Vite + TailwindCSS + Shadcn/UI
- **Auth**: [Clerk](https://clerk.com) (sign-in and session)
- **Data**: [Supabase](https://supabase.com) (Postgres, realtime, and Edge Functions)
- **AI**: Anthropic Claude and Google Gemini invoked from **Supabase Edge Functions** (keys stay server-side). The app calls those functions via `src/lib/ai-client.ts` using the Supabase anon key and project URL.

## AI Model Routing

Provider keys are **not** bundled in the browser for the main flows. Edge Functions read secrets from the Supabase project:

| Flow             | Model                                   | Edge Function        |
| ---------------- | --------------------------------------- | -------------------- |
| Onboarding plan  | Claude (Anthropic API)                  | `generate-plan`      |
| Report narrative | Claude (Anthropic API)                  | `generate-narrative` |
| Genie chat       | Gemini (Google Generative Language API) | `genie-chat`         |

### Environment variables

1. **Copy** [`.env.example`](./.env.example) to `.env.local` and fill in values. Do not commit `.env.local`.

2. **Client-safe variables** (Vite `import.meta.env`, prefixed with `VITE_`):
   - `VITE_CLERK_PUBLISHABLE_KEY` — from the [Clerk dashboard](https://dashboard.clerk.com) → API Keys
   - `VITE_SUPABASE_URL` — Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` — Supabase anon (public) key

3. **Server-only secrets** for Edge Functions — set on Supabase, not in `.env.local`:

   ```bash
   supabase secrets set ANTHROPIC_API_KEY=...
   supabase secrets set GOOGLE_GENERATIVE_AI_API_KEY=...
   ```

   Billing-related secrets (`STRIPE_*`, service role, etc.) are documented in the [Billing](#billing-stripe--supabase-edge-functions) section below.

4. **Optional — Import Assistant modal**  
   The spreadsheet import assistant still reads `VITE_GOOGLE_GENERATIVE_AI_API_KEY` in the browser. Prefer moving that flow to an Edge Function when possible so the key is not exposed. Until then, add that variable locally only if you use the feature.

### CI / build

GitHub Actions ([`.github/workflows/ci.yml`](./.github/workflows/ci.yml)) supplies stub `VITE_*` values for `npm run build`. Production deploys should use real values in your host’s environment.

### Superuser access (Clerk)

If you want one personal account to bypass paywall checks (for owner/admin access), set either of these values on your Clerk user `publicMetadata`:

- `is_superuser: true`
- `role: "superuser"`

You can edit this in Clerk Dashboard -> Users -> your user -> Metadata -> Public metadata.

When either flag is present, this app treats the account as having active access while normal users still require payment metadata.

## Billing (Stripe + Supabase Edge Functions)

Billing is handled via Supabase Edge Functions:

- `create-checkout-session`: creates hosted Stripe Checkout sessions for Pro/Enterprise.
- `stripe-webhook`: verifies Stripe webhook signatures and syncs subscription tier to Supabase Auth user metadata.

The Settings billing flow includes a signed return-state parameter (`billing_state`) and polls Supabase Auth metadata after Stripe redirect to confirm webhook propagation.

Webhook processing is idempotent via Deno KV keyed by Stripe `event.id`, so Stripe retries do not double-process subscription events.

### Required Supabase Function secrets

Set these in your Supabase project before deploying the functions:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_PRO_MONTHLY`
- `STRIPE_PRICE_ENTERPRISE_MONTHLY`

AI functions additionally require:

- `ANTHROPIC_API_KEY`
- `GOOGLE_GENERATIVE_AI_API_KEY`

### Deploy functions

```bash
supabase functions deploy genie-chat
supabase functions deploy generate-plan
supabase functions deploy generate-narrative
supabase functions deploy create-checkout-session
supabase functions deploy stripe-webhook
```

### Configure Stripe webhook endpoint

Point Stripe to:

`https://<your-project-ref>.functions.supabase.co/stripe-webhook`

Subscribe to at least:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
