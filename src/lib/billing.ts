import { supabase } from '@/lib/supabase';
import { SubscriptionTier } from '@/hooks/use-media-plan-store';

interface CreateCheckoutSessionInput {
  tier: Extract<SubscriptionTier, 'pro' | 'enterprise'>;
  paymentMethod: 'card' | 'crypto';
  successUrl: string;
  cancelUrl: string;
}

interface CheckoutSessionResponse {
  url?: string;
  sessionId?: string;
  message?: string;
}

export async function createCheckoutSession(
  input: CreateCheckoutSessionInput
): Promise<CheckoutSessionResponse> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    throw new Error('You must be signed in to start checkout.');
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl || supabaseUrl.includes('placeholder-url')) {
    throw new Error('Supabase URL is not configured for billing functions.');
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/create-checkout-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(input),
  });

  const payload = (await response.json()) as CheckoutSessionResponse & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error || payload.message || 'Failed to create checkout session.');
  }

  return payload;
}
