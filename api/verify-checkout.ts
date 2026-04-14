import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return res.status(500).json({ error: 'Stripe is not configured on the server' });
    }

    const stripe = new Stripe(stripeKey);
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === 'paid' || session.status === 'complete') {
      const userId = session.client_reference_id;
      
      if (userId) {
        const supabaseUrl = process.env.VITE_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
        
        if (supabaseUrl && supabaseKey) {
          const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
          
          await supabaseAdmin.from("profiles").update({
            tier: "pro",
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: session.subscription as string,
            search_credits: 100,
          }).eq("id", userId);
        }
      }
      
      return res.status(200).json({ success: true });
    }

    res.status(400).json({ error: 'Payment not completed' });
  } catch (error: any) {
    console.error('Verify checkout error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
