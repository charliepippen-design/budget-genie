// Stripe → Clerk: marks a user as paid (or not) in Clerk publicMetadata, which the app reads
// to unlock /app. Env: STRIPE_WEBHOOK_SECRET, CLERK_SECRET_KEY

import { createHmac, timingSafeEqual } from "node:crypto";
import { json } from "./_auth.js";

const TOLERANCE_SECONDS = 300;

/** Verify the Stripe-Signature header (t=...,v1=...) over the raw body. */
export function verifyStripeSignature(rawBody: string, header: string | null, secret: string, now = Date.now()) {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const [k, ...v] = p.split("=");
      return [k.trim(), v.join("=")];
    })
  );
  const timestamp = Number(parts.t);
  const signatures = header
    .split(",")
    .filter((p) => p.trim().startsWith("v1="))
    .map((p) => p.trim().slice(3));
  if (!timestamp || signatures.length === 0) return false;
  if (Math.abs(now / 1000 - timestamp) > TOLERANCE_SECONDS) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return signatures.some((sig) => {
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

async function setClerkPayment(userId: string, paid: boolean, tier: string | null) {
  const key = process.env.CLERK_SECRET_KEY;
  if (!key) throw new Error("CLERK_SECRET_KEY is not configured");
  const res = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(userId)}/metadata`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      public_metadata: {
        payment_status: paid,
        subscription_tier: paid ? tier : "free",
        payment_method: "card",
      },
    }),
  });
  if (!res.ok) throw new Error(`Clerk metadata update failed: ${res.status} ${await res.text()}`);
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return json({ error: "Webhook not configured" }, 503);

  const raw = await req.text();
  if (!verifyStripeSignature(raw, req.headers.get("stripe-signature"), secret)) {
    return json({ error: "Invalid signature" }, 400);
  }

  const event = JSON.parse(raw) as { type: string; data: { object: Record<string, unknown> } };
  const obj = event.data.object;
  const meta = (obj.metadata as Record<string, string> | undefined) ?? {};
  const userId = meta.clerk_user_id || (obj.client_reference_id as string | undefined);
  const tier = meta.subscription_tier === "enterprise" ? "enterprise" : "pro";

  try {
    if (!userId) return json({ received: true, ignored: "no clerk user id" });
    switch (event.type) {
      case "checkout.session.completed":
        await setClerkPayment(userId, true, tier);
        break;
      case "customer.subscription.updated": {
        const status = obj.status as string;
        await setClerkPayment(userId, status === "active" || status === "trialing", tier);
        break;
      }
      case "customer.subscription.deleted":
        await setClerkPayment(userId, false, null);
        break;
      default:
        return json({ received: true, ignored: event.type });
    }
  } catch (err) {
    console.error("stripe-webhook:", err);
    // 500 makes Stripe retry later.
    return json({ error: "Update failed" }, 500);
  }
  return json({ received: true });
}
