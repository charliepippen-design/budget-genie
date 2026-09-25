// @vitest-environment node
import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST as checkout } from '../../api/billing-checkout';
import { POST as webhook, verifyStripeSignature } from '../../api/stripe-webhook';

const sign = (body: string, secret: string, t = Math.floor(Date.now() / 1000)) =>
  `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('stripe webhook', () => {
  it('verifies signatures and rejects tampering or stale events', () => {
    const body = '{"a":1}';
    expect(verifyStripeSignature(body, sign(body, 'whsec'), 'whsec')).toBe(true);
    expect(verifyStripeSignature('{"a":2}', sign(body, 'whsec'), 'whsec')).toBe(false);
    expect(verifyStripeSignature(body, sign(body, 'other'), 'whsec')).toBe(false);
    expect(verifyStripeSignature(body, sign(body, 'whsec', 1000), 'whsec')).toBe(false);
  });

  it('marks the Clerk user as paid on checkout.session.completed', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec');
    vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_x');
    const fetchMock = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    const body = JSON.stringify({
      type: 'checkout.session.completed',
      data: { object: { metadata: { clerk_user_id: 'user_1', subscription_tier: 'enterprise' } } },
    });
    const res = await webhook(new Request('http://x', { method: 'POST', body, headers: { 'stripe-signature': sign(body, 'whsec') } }));
    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.clerk.com/v1/users/user_1/metadata');
    expect(JSON.parse(String(init.body)).public_metadata).toEqual({
      payment_status: true,
      subscription_tier: 'enterprise',
      payment_method: 'card',
    });
  });

  it('rejects unsigned requests', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec');
    const res = await webhook(new Request('http://x', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(400);
  });
});

describe('billing checkout', () => {
  it('requires a signed-in user', async () => {
    vi.stubEnv('ALLOW_ANON', '');
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', '');
    const res = await checkout(new Request('https://site/api/billing-checkout', { method: 'POST', body: '{"tier":"pro"}' }));
    expect(res.status).toBe(401);
  });
});
