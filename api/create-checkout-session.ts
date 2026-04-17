import Stripe from 'stripe';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, email, itemType } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return res.status(500).json({ error: 'Stripe is not configured on the server' });
    }

    const stripe = new Stripe(stripeKey);
    const domain = req.headers.origin || req.headers.referer?.replace(/\/$/, '') || `https://${req.headers.host}`;

    let lineItems: any[] = [];
    let mode: "payment" | "subscription" = "subscription";

    if (itemType === 'iconic_premium') {
      lineItems = [{
        price_data: {
          currency: "aud",
          product_data: {
            name: "THE ICONIC 25% OFF Code",
            description: "One high-value unique discount code",
          },
          unit_amount: 2000, // $20.00 AUD
        },
        quantity: 1,
      }];
      mode = "payment";
    } else if (itemType === 'farfetch_premium') {
      lineItems = [{
        price_data: {
          currency: "aud",
          product_data: {
            name: "FARFETCH 10% OFF Code",
            description: "One verified discount code",
          },
          unit_amount: 1500, // $15.00 AUD
        },
        quantity: 1,
      }];
      mode = "payment";
    } else {
      // Default to Pro Membership
      lineItems = [{
        price_data: {
          currency: "aud",
          product_data: {
            name: "Pro Membership",
            description: "100 searches per month",
          },
          unit_amount: 1000, // $10.00 AUD
          recurring: {
            interval: "month",
          },
        },
        quantity: 1,
      }];
      mode = "subscription";
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: mode,
      client_reference_id: userId,
      customer_email: email || undefined,
      metadata: { itemType: itemType || 'pro' },
      line_items: lineItems,
      success_url: `${domain}?purchase=success&item=${itemType || 'pro'}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${domain}?purchase=cancelled`,
      ...(mode === 'subscription' ? { subscription_data: { trial_period_days: 30 } } : {})
    });

    res.status(200).json({ url: session.url });
  } catch (error: any) {
    console.error('Stripe error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
