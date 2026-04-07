import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const allowedOrigin = Deno.env.get('ALLOWED_ORIGIN') ?? 'http://localhost:5173';

const getCorsHeaders = (origin: string | null): Record<string, string> => ({
  'Access-Control-Allow-Origin': origin === allowedOrigin ? allowedOrigin : 'null',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
});

const corsHeaders = getCorsHeaders(null);

type Tier = 'pro' | 'enterprise';

type CheckoutRequest = {
  tier: Tier;
  paymentMethod: 'card' | 'crypto';
  successUrl?: string;
  cancelUrl?: string;
};

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

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin');
  const requestCorsHeaders = getCorsHeaders(origin);

  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: requestCorsHeaders });
  }

  // Validate Origin for security
  if (origin && origin !== allowedOrigin) {
    return json(403, { error: 'CORS policy: origin not allowed' }, requestCorsHeaders);
  }

  if (request.method !== 'POST') {
    return json(405, { error: 'Method not allowed' }, requestCorsHeaders);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
  const stripePricePro = Deno.env.get('STRIPE_PRICE_PRO_MONTHLY');
  const stripePriceEnterprise = Deno.env.get('STRIPE_PRICE_ENTERPRISE_MONTHLY');

  if (!supabaseUrl || !supabaseAnonKey) {
    return json(500, { error: 'Supabase environment variables are missing.' }, requestCorsHeaders);
  }

  if (!stripeSecretKey || !stripePricePro || !stripePriceEnterprise) {
    return json(
      500,
      { error: 'Stripe billing environment variables are missing.' },
      requestCorsHeaders
    );
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json(401, { error: 'Missing bearer token.' }, requestCorsHeaders);
  }

  const token = authHeader.replace('Bearer ', '');
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return json(401, { error: 'Unauthorized user.' }, requestCorsHeaders);
  }

  let payload: CheckoutRequest;
  try {
    payload = (await request.json()) as CheckoutRequest;
  } catch {
    return json(400, { error: 'Invalid request body.' }, requestCorsHeaders);
  }

  if (payload.tier !== 'pro' && payload.tier !== 'enterprise') {
    return json(400, { error: 'Only pro and enterprise tiers are billable.' }, requestCorsHeaders);
  }

  if (payload.paymentMethod === 'crypto') {
    return json(
      501,
      {
        error: 'Crypto checkout orchestration is not yet active.',
        checkoutProvider: 'crypto',
      },
      requestCorsHeaders
    );
  }

  const priceId = payload.tier === 'pro' ? stripePricePro : stripePriceEnterprise;

  const successUrl =
    payload.successUrl ?? `${request.url.split('/functions/')[0]}/settings?checkout=success`;
  const cancelUrl =
    payload.cancelUrl ?? `${request.url.split('/functions/')[0]}/settings?checkout=cancelled`;

  const params = new URLSearchParams();
  params.append('mode', 'subscription');
  params.append('success_url', successUrl);
  params.append('cancel_url', cancelUrl);
  params.append('line_items[0][price]', priceId);
  params.append('line_items[0][quantity]', '1');
  params.append('allow_promotion_codes', 'true');
  params.append('client_reference_id', user.id);
  params.append('metadata[supabase_user_id]', user.id);
  params.append('metadata[subscription_tier]', payload.tier);
  params.append('metadata[payment_method]', payload.paymentMethod);
  params.append('subscription_data[metadata][supabase_user_id]', user.id);
  params.append('subscription_data[metadata][subscription_tier]', payload.tier);
  params.append('subscription_data[metadata][payment_method]', payload.paymentMethod);

  if (user.email) {
    params.append('customer_email', user.email);
  }

  const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  const stripePayload = await stripeResponse.json();

  if (!stripeResponse.ok) {
    const errorMessage =
      stripePayload?.error?.message ?? 'Stripe checkout session creation failed.';
    return json(400, { error: errorMessage }, requestCorsHeaders);
  }

  return json(
    200,
    {
      sessionId: stripePayload.id,
      url: stripePayload.url,
      tier: payload.tier,
    },
    requestCorsHeaders
  );
});
