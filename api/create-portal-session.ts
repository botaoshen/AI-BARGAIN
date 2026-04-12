import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return res.status(500).json({ error: 'Stripe is not configured on the server' });
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: 'Supabase credentials missing' });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
    
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', userId)
      .single();

    if (error || !profile?.stripe_customer_id) {
      return res.status(404).json({ error: 'Customer not found or no active subscription' });
    }

    const stripe = new Stripe(stripeKey);
    const domain = req.headers.origin || req.headers.referer?.replace(/\/$/, '') || `https://${req.headers.host}`;

    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${domain}`,
    });

    return res.status(200).json({ url: session.url });
  } catch (error: any) {
    console.error('Create portal session error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
