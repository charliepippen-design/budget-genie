import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@12.1.1?target=deno";

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') as string, {
  apiVersion: '2022-11-15',
  httpClient: Stripe.createFetchHttpClient(),
});

const CLERK_SECRET_KEY = Deno.env.get('CLERK_SECRET_KEY');

// Helper to update Clerk user metadata
async function upgradeClerkUserTier(userId: string, tierLevel: string) {
    if (!CLERK_SECRET_KEY) throw new Error("Missing CLERK_SECRET_KEY");
    
    // We update publicMetadata so the frontend can retrieve it securely
    const res = await fetch(`https://api.clerk.dev/v1/users/${userId}/metadata`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${CLERK_SECRET_KEY}`
        },
        body: JSON.stringify({
            public_metadata: {
                tier: tierLevel
            }
        })
    });

    if (!res.ok) {
        throw new Error(`Clerk Update Failed: ${res.statusText}`);
    }
}

serve(async (req) => {
    try {
        const signature = req.headers.get("stripe-signature");
        if (!signature) throw new Error("Missing stripe-signature header");

        const bodyText = await req.text();
        const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
        
        if (!webhookSecret) throw new Error("Missing STRIPE_WEBHOOK_SECRET");
        
        let event;
        try {
            event = stripe.webhooks.constructEvent(bodyText, signature, webhookSecret);
        } catch (err: any) {
            console.error(`Webhook Error: ${err.message}`);
            return new Response(`Webhook Error: ${err.message}`, { status: 400 });
        }

        // Process Checkout completion
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            // The Clerk userId is passed via client_reference_id in the checkout URL
            const userId = session.client_reference_id;
            
            if (userId) {
                console.log(`[Stripe Webhook] Upgrading user ${userId} to DEITY tier...`);
                await upgradeClerkUserTier(userId, 'DEITY');
                console.log(`[Stripe Webhook] Success: User upgraded.`);
            } else {
                console.warn("[Stripe Webhook] Warning: checkout completed without client_reference_id");
            }
        }

        return new Response(JSON.stringify({ received: true }), {
            headers: { "Content-Type": "application/json" },
        });

    } catch (err: any) {
        console.error(err);
        return new Response(JSON.stringify({ error: err.message }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        });
    }
});
