// Creates a Stripe Checkout session for the signed-in Clerk user.
// Env: STRIPE_SECRET_KEY, STRIPE_PRICE_PRO_MONTHLY, STRIPE_PRICE_ENTERPRISE_MONTHLY

import { json, verifyClerkUser } from "./_auth.js";

type Tier = "pro" | "enterprise";

export async function POST(req: Request) {
  const userId = await verifyClerkUser(req);
  if (!userId || userId === "anonymous") return json({ error: "Sign in to upgrade." }, 401);

  const secret = process.env.STRIPE_SECRET_KEY;
  const prices: Record<Tier, string | undefined> = {
    pro: process.env.STRIPE_PRICE_PRO_MONTHLY,
    enterprise: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY,
  };
  if (!secret) return json({ error: "Payments are not configured yet." }, 503);

  let body: { tier?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }
  const tier = body.tier as Tier;
  const priceId = prices[tier];
  if (!priceId) return json({ error: "Unknown or unconfigured plan." }, 400);

  // Redirects always go back to this site, never to a URL supplied by the client.
  const origin = new URL(req.url).origin;
  const params = new URLSearchParams({
    mode: "subscription",
    success_url: `${origin}/settings?checkout=success`,
    cancel_url: `${origin}/pricing?checkout=cancelled`,
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    allow_promotion_codes: "true",
    client_reference_id: userId,
    "metadata[clerk_user_id]": userId,
    "metadata[subscription_tier]": tier,
    "subscription_data[metadata][clerk_user_id]": userId,
    "subscription_data[metadata][subscription_tier]": tier,
  });
  if (typeof body.email === "string" && body.email.includes("@")) params.set("customer_email", body.email);

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const data = (await res.json()) as { id?: string; url?: string; error?: { message?: string } };
  if (!res.ok || !data.url) {
    console.error("Stripe checkout failed:", data.error?.message);
    return json({ error: "Could not start checkout. Please try again." }, 502);
  }
  return json({ url: data.url, sessionId: data.id });
}
