# MediaPlan Pro: session handoff (updated 2026-09-25)

For whoever picks this up next (a new Claude session or a developer). The owner is not technical: explain in simple Italian, one step at a time. The owner only copies and pastes; you run the commands.

## 1. Where things stand

- **Live site:** https://mediaplannerpro.com. Vercel project `budget-genie` (team `anthony-laners-projects`). It deploys automatically from GitHub `main` (`charliepippen-design/budget-genie`).
- **Live now (PR #1, merged):**
  - AI Planner chat.
  - 5 industry packs.
  - AI gateway on Vercel (`api/ai-gateway.ts`). The Gemini key is server-only and users are verified through Clerk.
  - Engine fixes.
  - The owner confirmed on the live site that the chat works.
- **Waiting for the owner's OK, not merged: PR #2**, branch `qa/bugs`, https://github.com/charliepippen-design/budget-genie/pull/2. It contains wave-1 fixes from the browser QA pass (section 4). CI is green: tsc, eslint, 138 tests, build. The Vercel preview is ready.
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

**Wave 2: numbers must agree everywhere**
- `/report` and `/output` call "Projected NGR" what is really Est. Revenue (+218k), while the dashboard waterfall shows NGR −29k. They must use the iGaming revenue model (margin, bonus).
- LTV:CAC, cohort value and payback differ between the dashboard LTV lab, report/output and XLSX. `Report.tsx`/`Output.tsx` use their own payback formula and a fixed churn of 0.042. Unify on one function.
- Currency:
  - The wizard is hardcoded in `$`, while the dashboard defaults to `€`.
  - Switching currency only relabels (no conversion). Either convert, or label it as "display currency".
  - Hardcoded `$` in the efficiency banner, the arbitrage card and the geo matrix; `€` in `ScenarioSidebar.tsx:112`.
  - Mixed number locales (en-US vs de-DE) on the same screen.
- Multi-month (`use-multi-month-store.ts`):
  - Months are empty until a control is touched.
  - `generateMonths` splits one month's budget across all months; it should be budget × months.
  - It ignores the plan's channels (uses 11 `DEFAULT_CHANNELS`) and doesn't follow plan changes.
  - Toggles wipe per-month edits without warning.
  - Start month is off by one in UTC+ (`MonthConfigPanel.tsx` uses `toISOString`).
  - P&L Net P/L ignores NGR for iGaming.
- Spend multiplier: the header shows budget×mult, but only the variable pool is multiplied. Budget utilisation >100% (`planning-insights.ts:97`).
- `useFtdVelocityMetrics` drops locked channels (`!ch.locked`, store ~:1509).
- Fixed-fee channels break allocation %: fixed rows show 0% but still spend; a locked channel's spend moves when others change (`setChannelAllocation` + `computePoolAwareSpend`). Keyboard slider changes never renormalise.
- Changing the budget flattens variable channels to equal shares.
- ChannelEditor:
  - Switching buying model keeps the old price (a €6 CPM becomes a €6 CPA).
  - CTR 0 is treated as 1% (`ctr || 1`).
  - The "Projected Yield" preview uses a hardcoded 10k spend.
- CPA/Rev-share deals get a saturation curve (arguably shouldn't). Negative CPA/ROAS targets are accepted.
- Insight actions (Reallocate, Auto-Fix) do something different from what their text says. The "CTR configured but impressions missing" alert fires on retainer/flat-fee channels.
- Reset (trash icon): no confirmation, then an impossible state (0 budget but revenue). Undo does not restore geo/targets (`use-history.ts` `createSnapshot`).
- Add Channel: accepts a negative price, shows `$` in EUR mode, has hardcoded AOV 100, and its model list differs from the editor's. No UI to activate/deactivate a channel.
- Forex/Fintech show the "General Marketing" badge and generic labels; the pack `funnel` labels are unused. "Paid Social" sits under the "Influencers" header (`mediaplan-data.ts:246`).
- The onboarding goal is ignored when the AI is down. Onboarding presets create plans that immediately flag themselves as broken. The geo list is iGaming-only (no US/FR/AU); the UK flag is broken (`code: 'UK'`).

**Wave 3: data in/out, saving, settings**
- Import (`import-service.ts`, `ImportWizard.tsx`):
  - Months get relabelled to the current month.
  - The 6-month sum is written as the monthly budget.
  - EU number format `€20.000,00` becomes 20.
  - A "Monthly Budget" header breaks column mapping.
  - Invalid or empty files reach "Ready to Import", or show a raw JS error.
  - Common channel names are not recognised; revenue/FTD columns are ignored.
- Projects:
  - `ProjectManager` is rendered twice with separate state, and saving from one deletes the other's projects.
  - Duplicate names, no rename, delete without confirmation.
  - Presets and scenarios can be saved but never loaded. `ScenarioComparison` and `MultiMonthCharts` are never mounted.
- Exports:
  - The "CSV" item actually exports JSON, and the app can't re-import its own JSON.
  - XLSX has no number formats and no multi-month data.
  - `/report` "Export PDF" is disabled.
  - "Copy Link" is not a real share link.
  - Printing `/output` keeps the dark theme.
- Settings shows the Clerk user as a guest and "Cloud CONNECTED" while Supabase is dead. "Continue Free" doesn't stick.
- Cloud save: there is none. Supabase is paused, and `useAutoSave` is not mounted. Decide between a new backend (e.g. Vercel Postgres/Neon) and dropping the claims from the UI.
- Minor: reloading mid-wizard loses answers; invalid CPA/LTV is silently dropped; a phantom 4th month on import; linear and flat curves are identical; the storage-sync key is wrong (`use-store-sync.ts:19`); `/output` overflows on mobile.

## 5. Product direction (agreed with the owner)

- The AI planner is the centrepiece. The user talks to it, the plan builds live, and the user fine-tunes with sliders.
- The AI fills the brief; the deterministic engine computes every number.
- Support many industries, not only iGaming.
- Next AI improvements:
  - a local fallback parser when the AI is down;
  - record table edits (not only chat edits) in the brief;
  - show "requested vs placed budget" explicitly.
