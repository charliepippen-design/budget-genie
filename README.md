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
- **Backend**: Supabase (Auth + Database)
- **AI**: Vercel AI SDK + Google Gemini

## Billing (Stripe + Supabase Edge Functions)

Billing is handled via Supabase Edge Functions:

- `create-checkout-session`: creates hosted Stripe Checkout sessions for Pro/Enterprise.
- `stripe-webhook`: verifies Stripe webhook signatures and syncs subscription tier to Supabase Auth user metadata.

The Settings billing flow now includes a signed return-state parameter (`billing_state`) and
polls Supabase Auth metadata after Stripe redirect to confirm webhook propagation.

Webhook processing is idempotent via Deno KV keyed by Stripe `event.id`, so Stripe retries do not
double-process subscription events.

### Required Supabase Function Secrets

Set these in your Supabase project before deploying the functions:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_PRO_MONTHLY`
- `STRIPE_PRICE_ENTERPRISE_MONTHLY`

### Deploy Functions

```bash
supabase functions deploy create-checkout-session
supabase functions deploy stripe-webhook
```

### Configure Stripe Webhook Endpoint

Point Stripe to:

`https://<your-project-ref>.functions.supabase.co/stripe-webhook`

Subscribe to at least:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
