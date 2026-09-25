# MediaPlan Pro: session handoff (updated 2026-09-25, evening)

For whoever picks this up next (a new Claude session or a developer). The owner is not technical: explain in simple Italian, one step at a time. The owner only copies and pastes; you run the commands.

## 1. Where things stand

- **Live site:** https://mediaplannerpro.com. Vercel project `budget-genie` (team `anthony-laners-projects`). It deploys automatically from GitHub `main` (`charliepippen-design/budget-genie`).
- **Live now (PR #1, merged):**
  - AI Planner chat.
  - 5 industry packs.
  - AI gateway on Vercel (`api/ai-gateway.ts`). The Gemini key is server-only and users are verified through Clerk.
  - Engine fixes.
  - The owner confirmed on the live site that the chat works.
- **Waiting for the owner's OK, not merged: PR #2 (wave 1), PR #3 (wave 2) and PR #4 (wave 3 + payments), stacked in that order**, branch `qa/bugs`, https://github.com/charliepippen-design/budget-genie/pull/2. It contains wave-1 fixes from the browser QA pass (section 4). CI is green: tsc, eslint, 138 tests, build. The Vercel preview is ready.
  - Merging to `main` deploys production. Do it only after the owner writes "ok merge 2". Auto-mode blocks production deploys without explicit consent.
- **Branches:**
  - `main` is the real codebase (April work plus PR #1).
  - `fix/calc-engine` is an old line based on February. It is kept only as a backup. Do not build on it.
  - `feat/ai-planner` was merged via PR #1.

## 2. Pending actions for the owner (guide click by click)

1. **"ok merge 2".** Then run `gh pr merge 2 --merge`, wait until `npx vercel ls budget-genie` shows Production Ready, and check that `curl https://mediaplannerpro.com/` returns 200.
2. **Gemini billing (critical).** The key is on the free tier, about 20 requests/day, and each chat turn uses 2–4.
   - Go to aistudio.google.com/apikey, then the "Plan" column, then "Set up billing", and add a card.
   - Until this is done, the chat stops with "AI usage limit reached".
3. **Delete the old keys.** On AI Studio, trash the keys starting with `AIzaSyBTw` and `AIzaSyCV`. Both were exposed in the public bundle.
   - `AIzaSyCV` is also in the local `.env.local` as `GEMINI_API_KEY`. After deletion, local AI stops working. Do not write the new key into files.
4. **Payments (owner's step 4).** Stripe checkout and webhook still live in `supabase/functions/*`, but the Supabase project `pghzfvztxztsaijybdwi` is paused and cannot be restored (free-plan 2-project limit). Result: new customers can pay, but `/app` never unlocks for them.
   - Plan: move `create-checkout-session` and `stripe-webhook` to Vercel functions. The webhook sets Clerk `publicMetadata.payment_status` / `subscription_tier` with `CLERK_SECRET_KEY`.
   - The owner must add `STRIPE_SECRET_KEY` and `CLERK_SECRET_KEY` to Vercel. Use the same method as `GEMINI_API_KEY`: the owner pastes into `npx vercel env add NAME production --sensitive --force` in the Antigravity terminal. Never put a secret in chat, files or logs.
   - After deploying, create `STRIPE_WEBHOOK_SECRET` in the Stripe dashboard (Developers → Webhooks → endpoint `https://mediaplannerpro.com/api/stripe-webhook`).
   - Also fix `src/pages/Pricing.tsx`. "Get Started" is an `alert()`, and its prices contradict `/settings` ($29/$99 vs $0/$129/$499).

## 3. How to work on it

- Setup: `npm install` (not `npm ci` while the IDE has files locked). Checks: `npx tsc -b --noEmit`, `npm run lint`, `npx vitest run`, `npm run build`. CI runs the same checks.
- **Local QA mode:** `MOCK_CLERK=1 npx vite --port 5199`. It uses a fake signed-in paying superuser. It runs only on the dev server and is never in builds. Only a `pk_live` Clerk key exists, so real login doesn't work on localhost.
- Browser testing uses the skill script `node "C:/Users/lenov/.claude/skills/browser-automation/browser.mjs" <url> --script file.mjs`. `/app` redirects to `/onboard` until onboarding is done.
- The Vercel CLI is logged in as `charliepippen-design`, and the repo is linked (`.vercel/`). `gh` is authenticated.
- Key code:
  - `src/lib/plan-generator.ts`: brief → channel mix. Deterministic; the AI never computes numbers.
  - `src/lib/planner-agent.ts`: applies AI tool calls to the store.
  - `src/lib/industries/`: channel packs.
  - `api/_gateway.ts`: Gemini, prompts, auth.
  - `src/components/planner/PlannerChat.tsx`.
  - `computePlanSnapshot` in `src/hooks/use-media-plan-store.ts`: the single source for plan numbers.

## 4. Bug backlog from the 4-agent QA pass

Wave 1 is fixed in PR #2 (demo lock, NaN, budget input, wizard lockout, undo in inputs, mobile/1280 layout, chat memory, target CPA, Italy ban, quota errors). Remaining:

**Wave 2: done in PR #3** (branch `qa/wave2`, stacked on PR #2; merge #2 first, then retarget #3 to `main`).
- Shared LTV model, unified currency formatting, multi-month sync, budget mix kept, spend multiplier, locked velocity, buying-model price conversion, validation, reset confirm, undo scope.
- Still open from wave 2:
  - Keyboard slider changes don't renormalise.
  - Fixed-fee rows show 0% in the table.
  - Rev-share/hybrid rows show odd CTR/impressions.
  - No UI to activate/deactivate a channel.

**Wave 3 + payments: done in PR #4** (branch `qa/wave3`, stacked on #3).
- My Projects no longer loses saves.
- Import handles EU numbers, real months, the "Monthly Budget" header, common platform names, and empty/bad files.
- Exports: real CSV, JSON can be re-imported, Excel is formatted.
- Settings shows the Clerk user and honest storage status.
- **Payments moved to Vercel:**
  - `api/billing-checkout.ts` creates the Stripe Checkout session.
  - `api/stripe-webhook.ts` verifies the Stripe signature and sets Clerk `publicMetadata.payment_status` / `subscription_tier`.
  - The Pricing page uses real checkout. Prices come from `src/lib/plans.ts` (Pro $99, Enterprise $499; confirm with the owner).
  - The old Supabase billing functions were removed. They wrote to Supabase auth, so they never unlocked anyone.
- **To switch payments on, these Vercel env vars are needed:**
  - `STRIPE_SECRET_KEY` (the owner pastes it via `npx vercel env add ... --sensitive`)
  - `STRIPE_PRICE_PRO_MONTHLY` and `STRIPE_PRICE_ENTERPRISE_MONTHLY` (price IDs of the Stripe products)
  - `CLERK_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`, from a Stripe webhook endpoint `https://mediaplannerpro.com/api/stripe-webhook` with events `checkout.session.completed`, `customer.subscription.updated` and `customer.subscription.deleted`.
- Still open:
  - No cloud save exists (browser only): decide on a backend.
  - Presets and scenarios can be saved but never loaded; `ScenarioComparison` and `MultiMonthCharts` are never mounted.
  - `/report` "Export PDF" is disabled; "Copy Link" is not a real share link; printing `/output` keeps the dark theme.
  - Reloading mid-wizard loses the answers.

## 5. Product direction (agreed with the owner)

- The AI planner is the centrepiece. The user talks to it, the plan builds live, and the user fine-tunes with sliders.
- The AI fills the brief; the deterministic engine computes every number.
- Support many industries, not only iGaming.
- Next AI improvements:
  - a local fallback parser when the AI is down;
  - record table edits (not only chat edits) in the brief;
  - show "requested vs placed budget" explicitly.
