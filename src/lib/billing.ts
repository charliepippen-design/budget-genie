import type { SubscriptionTier } from '@/hooks/use-media-plan-store';
import { getAuthToken } from '@/lib/ai-client';

// Browser side of api/billing-checkout.ts (Stripe Checkout on Vercel, user verified via Clerk).

interface CreateCheckoutSessionInput {
  tier: Extract<SubscriptionTier, 'pro' | 'enterprise'>;
  email?: string;
}

export async function createCheckoutSession(
  input: CreateCheckoutSessionInput
): Promise<{ url: string; sessionId?: string }> {
  const token = await getAuthToken();
  if (!token) throw new Error('Please sign in to upgrade.');

  const res = await fetch('/api/billing-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
  const data = (await res.json().catch(() => ({}))) as { url?: string; sessionId?: string; error?: string };
  if (!res.ok || !data.url) throw new Error(data.error || 'Could not start checkout.');
  return { url: data.url, sessionId: data.sessionId };
}
