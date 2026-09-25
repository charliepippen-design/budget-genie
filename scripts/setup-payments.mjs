#!/usr/bin/env node
// One-time payments setup. Run from the repo root:  node scripts/setup-payments.mjs
//
// Asks for the Stripe secret key and the Clerk secret key (typed input is hidden), then:
//  1. creates (or reuses) the Pro and Enterprise monthly prices in Stripe
//  2. creates (or reuses) the webhook endpoint pointing at the live site
//  3. saves every value as a sensitive Vercel env var (Production + Preview)
// Secrets are never printed or written to disk.

import { spawnSync } from 'node:child_process';
import readline from 'node:readline';

const SITE = 'https://mediaplannerpro.com';
const WEBHOOK_URL = `${SITE}/api/stripe-webhook`;
const WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.updated',
  'customer.subscription.deleted',
];
// Keep in sync with src/lib/plans.ts (amounts in cents).
const PLANS = [
  { env: 'STRIPE_PRICE_PRO_MONTHLY', lookupKey: 'mediaplan_pro_monthly', name: 'MediaPlanner Pro', amount: 1900 },
  { env: 'STRIPE_PRICE_ENTERPRISE_MONTHLY', lookupKey: 'mediaplan_enterprise_monthly', name: 'MediaPlanner Enterprise', amount: 3900 },
];

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => {
      // Echo only the question and newlines, never the typed characters.
      if (s.includes(question) || s === '\r\n' || s === '\n') rl.output.write(s);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

async function stripe(key, method, path, params) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params ? new URLSearchParams(params) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Stripe ${path}: ${data?.error?.message ?? res.status}`);
  return data;
}

async function ensurePrice(key, plan) {
  const found = await stripe(key, 'GET', `/prices?lookup_keys[]=${plan.lookupKey}&active=true`);
  const existing = found.data?.[0];
  if (existing && existing.unit_amount === plan.amount) return existing.id;

  const product = await stripe(key, 'POST', '/products', { name: plan.name });
  const price = await stripe(key, 'POST', '/prices', {
    product: product.id,
    unit_amount: String(plan.amount),
    currency: 'usd',
    'recurring[interval]': 'month',
    lookup_key: plan.lookupKey,
    transfer_lookup_key: 'true',
  });
  return price.id;
}

async function ensureWebhook(key) {
  const list = await stripe(key, 'GET', '/webhook_endpoints?limit=100');
  // The signing secret is only returned on creation, so replace any old endpoint for this URL.
  for (const ep of list.data ?? []) {
    if (ep.url === WEBHOOK_URL) await stripe(key, 'DELETE', `/webhook_endpoints/${ep.id}`);
  }
  const params = { url: WEBHOOK_URL };
  WEBHOOK_EVENTS.forEach((e, i) => (params[`enabled_events[${i}]`] = e));
  const created = await stripe(key, 'POST', '/webhook_endpoints', params);
  return created.secret;
}

function saveEnv(name, value) {
  for (const target of ['production', 'preview']) {
    const r = spawnSync('npx', ['vercel', 'env', 'add', name, target, '--sensitive', '--force'], {
      input: value,
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
    if (r.status !== 0) throw new Error(`Could not save ${name} (${target}) to Vercel`);
  }
  console.log(`  ✓ ${name} saved`);
}

async function main() {
  console.log('\nMediaPlanner Pro — payments setup\n');
  const stripeKey = await askHidden('Paste the Stripe secret key (sk_test_… or sk_live_…) and press Enter: ');
  if (!/^sk_(test|live)_/.test(stripeKey)) throw new Error('That does not look like a Stripe secret key (sk_test_… or sk_live_…).');
  const clerkKey = await askHidden('Paste the Clerk secret key (sk_live_… or sk_test_…) and press Enter: ');
  if (!/^sk_(test|live)_/.test(clerkKey)) throw new Error('That does not look like a Clerk secret key.');

  console.log(`\nStripe mode: ${stripeKey.startsWith('sk_test_') ? 'TEST (no real money)' : 'LIVE'}`);
  console.log('Creating prices in Stripe…');
  const priceIds = {};
  for (const plan of PLANS) priceIds[plan.env] = await ensurePrice(stripeKey, plan);
  console.log('Creating the webhook…');
  const webhookSecret = await ensureWebhook(stripeKey);

  console.log('Saving to Vercel…');
  saveEnv('STRIPE_SECRET_KEY', stripeKey);
  saveEnv('CLERK_SECRET_KEY', clerkKey);
  for (const plan of PLANS) saveEnv(plan.env, priceIds[plan.env]);
  saveEnv('STRIPE_WEBHOOK_SECRET', webhookSecret);

  console.log('\nDone. Tell Claude: "fatto pagamenti".\n');
}

main().catch((err) => {
  console.error(`\nSetup stopped: ${err.message}\nNothing secret was printed. Tell Claude what the message says.\n`);
  process.exit(1);
});
