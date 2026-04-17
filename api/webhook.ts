import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const config = {
  api: {
    bodyParser: false,
  },
};

async function buffer(readable: any) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  if (!stripeKey || !webhookSecret) {
    return res.status(500).json({ error: 'Stripe is not configured on the server' });
  }

  const stripe = new Stripe(stripeKey);
  const sig = req.headers['stripe-signature'];

  let event;

  try {
    const buf = await buffer(req);
    event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
  } catch (err: any) {
    console.error(`Webhook Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('Supabase credentials missing');
    return res.status(500).json({ error: 'Supabase credentials missing' });
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;
        const itemType = session.metadata?.itemType;

        if (userId) {
          if (itemType === 'iconic_premium') {
            // Find an available code
            const { data: codeData } = await supabaseAdmin
              .from('iconic_codes')
              .select('id')
              .is('claimed_by', null)
              .limit(1)
              .single();

            if (codeData) {
              await supabaseAdmin
                .from('iconic_codes')
                .update({ 
                  claimed_by: userId, 
                  claimed_at: new Date().toISOString(),
                  purchase_session_id: session.id 
                })
                .eq('id', codeData.id);
            }
          } else if (itemType === 'farfetch_premium') {
             // Similarly check farfetch_codes table
             const { data: codeData } = await supabaseAdmin
              .from('farfetch_codes')
              .select('id')
              .is('claimed_by', null)
              .limit(1)
              .single();

            if (codeData) {
              await supabaseAdmin
                .from('farfetch_codes')
                .update({ 
                  claimed_by: userId, 
                  claimed_at: new Date().toISOString(),
                  purchase_session_id: session.id 
                })
                .eq('id', codeData.id);
            }
          } else {
            // Default Pro Membership
            await supabaseAdmin.from("profiles").update({
              tier: "pro",
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
              search_credits: 100,
            }).eq("id", userId);
          }
        }
        break;
      }
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as any;
        const subscriptionId = invoice.subscription as string;
        
        if (invoice.billing_reason === 'subscription_cycle') {
          await supabaseAdmin.from("profiles").update({
            search_credits: 100,
          }).eq("stripe_subscription_id", subscriptionId);
        }
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await supabaseAdmin.from("profiles").update({
          tier: "free",
          search_credits: 5,
        }).eq("stripe_subscription_id", subscription.id);
        break;
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error("Error processing webhook:", error);
    res.status(500).json({ error: "Webhook handler failed" });
  }
}
