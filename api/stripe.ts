import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

let stripeClient: Stripe | null = null;
function getStripe() {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is missing");
    stripeClient = new Stripe(key, { apiVersion: "2026-03-25.dahlia" as any });
  }
  return stripeClient;
}

export default async function handler(req: any, res: any) {
  const { action } = req.query;
  const method = req.method;

  if (method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stripe = getStripe();
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const supabaseAdmin = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

  try {
    switch (action) {
      case 'create-checkout': {
        const { userId, email } = req.body;
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [{ price: process.env.STRIPE_PRICE_ID || "price_1P3v6eL7vX9z8y7x6c5v4b3n", quantity: 1 }],
          mode: "subscription",
          success_url: `${req.headers.origin}/?upgrade=success&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${req.headers.origin}/?upgrade=cancel`,
          customer_email: email,
          metadata: { userId },
          subscription_data: { trial_period_days: 30 }
        });
        return res.status(200).json({ url: session.url });
      }

      case 'create-portal': {
        const { userId } = req.body;
        if (!supabaseAdmin) throw new Error("Supabase not configured");
        const { data: profile } = await supabaseAdmin.from('profiles').select('stripe_customer_id').eq('id', userId).single();
        if (!profile?.stripe_customer_id) return res.status(400).json({ error: "No active subscription found" });

        const session = await stripe.billingPortal.sessions.create({
          customer: profile.stripe_customer_id,
          return_url: `${req.headers.origin}/`
        });
        return res.status(200).json({ url: session.url });
      }

      case 'verify': {
        const { sessionId } = req.body;
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session.payment_status === 'paid' || session.subscription) {
          return res.status(200).json({ success: true, tier: 'pro' });
        }
        return res.status(400).json({ success: false });
      }

      default:
        return res.status(400).json({ error: "Invalid action" });
    }
  } catch (error: any) {
    console.error(`Error in /api/stripe action ${action}:`, error);
    res.status(500).json({ error: "Internal server error" });
  }
}
