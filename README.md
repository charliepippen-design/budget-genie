# MediaPlanner Pro (Budget Genie)

Budget planning and scaling tool for iGaming and digital marketing teams. Live at https://mediaplannerpro.com.

## How it works

- A deterministic planning engine (`src/lib/plan-generator.ts`, `computePlanSnapshot`) computes every number in a plan.
- AI (Google Gemini only) is used for assistance and does not produce the figures. Calls go through a server-side gateway (`api/ai-gateway.ts`, logic in `api/_gateway.ts`) that checks the Clerk session. The Gemini key lives only on the server.
- Projects are stored in the browser only (localStorage). There is no cloud save yet.
- Payments are not yet configured in production. Billing code exists in `api/billing-checkout.ts` and `api/stripe-webhook.ts`, and `scripts/setup-payments.mjs` is the one-time setup helper.

## Tech stack

React 18, Vite 7, TypeScript, Tailwind CSS, shadcn/ui, zustand. Auth is [Clerk](https://clerk.com). Serverless functions in `api/` run on Vercel.

`src/lib/supabase.ts` and the hooks that use it are legacy and are not part of the product's storage or auth.

## Getting started

```bash
npm ci
cp .env.example .env.local   # then fill in your own values
npm run dev
```

The dev server also serves `api/ai-gateway` locally, so `vercel dev` is not needed.

### Environment variables

Set these in `.env.local` (never commit it). See `.env.example` for the template.

| Variable | Where | Purpose |
| --- | --- | --- |
| `VITE_CLERK_PUBLISHABLE_KEY` | browser | Clerk auth |
| `GEMINI_API_KEY` | server only | Gemini access for the AI gateway |
| `GEMINI_MODEL` | server only, optional | Override the default Gemini model |
| `ALLOW_ANON` | server only, local dev | Lets the gateway skip the Clerk check |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_ENTERPRISE_MONTHLY`, `CLERK_SECRET_KEY` | server only | Billing endpoints (not yet live) |

Note: `.env.example` still lists some Supabase and Anthropic entries from earlier versions that the current code does not use for the product.

### Local QA without Clerk

```bash
MOCK_CLERK=1 npm run dev
```

This swaps `@clerk/clerk-react` for `src/dev/clerk-mock.tsx`, which simulates a signed-in superuser so `/app` is reachable. It only applies to the dev server, never to production builds.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run lint` | ESLint |
| `npx tsc -b --noEmit` | Type check |
| `npm run test:run` | Unit tests (Vitest, single run) |
| `npm run test:e2e` | Playwright end-to-end tests (starts the dev server with `MOCK_CLERK=1`) |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview the production build |
| `npm run perf:analyze` | Build with a bundle size report |

The first time you run the e2e tests, install the browser with `npx playwright install chromium`.

## Deploy

Vercel deploys automatically from `main`. `vercel.json` sets the build command, the `dist` output, and a SPA rewrite for non-`api/` routes. Set the server-only variables above in the Vercel project settings.

## Routes

`/` landing, `/auth`, `/pricing`, `/terms`, `/privacy`, `/refund-policy`, and the signed-in app at `/app` (plus `/onboard`, `/settings`, `/report`, `/output`).

## License

See `LICENSE.md`.
