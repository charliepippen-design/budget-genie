import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const allowedOrigin = Deno.env.get('ALLOWED_ORIGIN') ?? 'http://localhost:5173';

const getCorsHeaders = (origin: string | null): Record<string, string> => ({
  'Access-Control-Allow-Origin': origin === allowedOrigin ? allowedOrigin : 'null',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, stripe-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
});

const corsHeaders = getCorsHeaders(null);

type Tier = 'free' | 'pro' | 'enterprise';

interface StripeWebhookEvent {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
}

interface WebhookIdempotencyRecord {
  eventType: string;
  processedAt: string;
}

function json(
  status: number,
  body: Record<string, unknown>,
  corsHeadersOverride?: Record<string, string>
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...(corsHeadersOverride || corsHeaders), 'Content-Type': 'application/json' },
  });
}

function parseStripeSignature(headerValue: string): { timestamp: string; signatures: string[] } {
  const parts = headerValue.split(',').map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith('t='))?.slice(2) ?? '';
  const signatures = parts
    .filter((part) => part.startsWith('v1='))
    .map((part) => part.slice(3))
    .filter(Boolean);

  return { timestamp, signatures };
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function hmacSha256(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return toHex(signature);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function normalizeTier(value: unknown): Tier | null {
  if (value === 'free' || value === 'pro' || value === 'enterprise') {
    return value;
  }
  return null;
}

async function updateUserTier(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  tier: Tier,
  stripeCustomerId?: string,
  stripeSubscriptionId?: string,
  billingStatus: 'active' | 'canceled' = 'active'
) {
  const { data: currentUserData, error: getUserError } =
    await adminClient.auth.admin.getUserById(userId);

  if (getUserError || !currentUserData?.user) {
    throw new Error(getUserError?.message || 'Unable to load user for metadata update.');
  }

  const existingAppMetadata = currentUserData.user.app_metadata || {};

  const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, {
    app_metadata: {
      ...existingAppMetadata,
      subscription_tier: tier,
      billing_status: billingStatus,
      stripe_customer_id: stripeCustomerId ?? existingAppMetadata.stripe_customer_id ?? null,
      stripe_subscription_id:
        stripeSubscriptionId ?? existingAppMetadata.stripe_subscription_id ?? null,
      tier_synced_at: new Date().toISOString(),
    },
  });

  if (updateError) {
    throw new Error(updateError.message);
  }
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin');
  const requestCorsHeaders = getCorsHeaders(origin);

  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: requestCorsHeaders });
  }

  if (request.method !== 'POST') {
    return json(405, { error: 'Method not allowed' }, requestCorsHeaders);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

  if (!supabaseUrl || !supabaseServiceRoleKey || !stripeWebhookSecret) {
    return json(500, { error: 'Missing webhook environment configuration.' }, requestCorsHeaders);
  }

  const signatureHeader = request.headers.get('stripe-signature');
  if (!signatureHeader) {
    return json(400, { error: 'Missing Stripe signature header.' }, requestCorsHeaders);
  }

  const bodyText = await request.text();
  const { timestamp, signatures } = parseStripeSignature(signatureHeader);
  if (!timestamp || signatures.length === 0) {
    return json(400, { error: 'Invalid Stripe signature format.' }, requestCorsHeaders);
  }

  const signedPayload = `${timestamp}.${bodyText}`;
  const expected = await hmacSha256(stripeWebhookSecret, signedPayload);
  const isValid = signatures.some((sig) => timingSafeEqual(sig, expected));

  if (!isValid) {
    return json(400, { error: 'Stripe signature verification failed.' }, requestCorsHeaders);
  }

  let event: StripeWebhookEvent;
  try {
    event = JSON.parse(bodyText) as StripeWebhookEvent;
  } catch {
    return json(400, { error: 'Invalid webhook payload JSON.' }, requestCorsHeaders);
  }

  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

  let kv: Deno.Kv | null = null;
  try {
    kv = await Deno.openKv();
  } catch {
    kv = null;
  }

  if (kv) {
    const key = ['stripe_event', event.id];
    const existing = await kv.get<WebhookIdempotencyRecord>(key);
    if (existing.value) {
      return json(200, {
        received: true,
        eventType: event.type,
        idempotent: true,
        processedAt: existing.value.processedAt,
      });
    }
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const metadata = (session.metadata as Record<string, unknown>) ?? {};
      const userId =
        (metadata.supabase_user_id as string) || (session.client_reference_id as string);
      const tier = normalizeTier(metadata.subscription_tier);

      if (userId && tier) {
        await updateUserTier(
          adminClient,
          userId,
          tier,
          (session.customer as string) || undefined,
          (session.subscription as string) || undefined,
          'active'
        );
      }
    }

    if (
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.created'
    ) {
      const subscription = event.data.object;
      const metadata = (subscription.metadata as Record<string, unknown>) ?? {};
      const userId = metadata.supabase_user_id as string;
      const tier = normalizeTier(metadata.subscription_tier);
      const status = String(subscription.status || '').toLowerCase();
      const billingStatus = status === 'canceled' || status === 'unpaid' ? 'canceled' : 'active';

      if (userId && tier) {
        await updateUserTier(
          adminClient,
          userId,
          tier,
          (subscription.customer as string) || undefined,
          (subscription.id as string) || undefined,
          billingStatus
        );
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      const metadata = (subscription.metadata as Record<string, unknown>) ?? {};
      const userId = metadata.supabase_user_id as string;

      if (userId) {
        await updateUserTier(
          adminClient,
          userId,
          'free',
          (subscription.customer as string) || undefined,
          (subscription.id as string) || undefined,
          'canceled'
        );
      }
    }

    if (kv) {
      const key = ['stripe_event', event.id];
      await kv.set(
        key,
        {
          eventType: event.type,
          processedAt: new Date().toISOString(),
        } satisfies WebhookIdempotencyRecord,
        { expireIn: 1000 * 60 * 60 * 24 * 14 }
      );
    }

    return json(
      200,
      { received: true, eventType: event.type, idempotent: false },
      requestCorsHeaders
    );
  } catch (error) {
    return json(
      500,
      {
        error: error instanceof Error ? error.message : 'Webhook processing failed.',
      },
      requestCorsHeaders
    );
  }
});
