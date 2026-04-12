import Stripe from 'stripe';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, email } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return res.status(500).json({ error: 'Stripe is not configured on the server' });
    }

    const stripe = new Stripe(stripeKey);
    const domain = req.headers.origin || req.headers.referer?.replace(/\/$/, '') || `https://${req.headers.host}`;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "subscription",
      client_reference_id: userId,
      customer_email: email || undefined,
      line_items: [
        {
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
        },
      ],
      subscription_data: {
        trial_period_days: 30,
      },
      success_url: `${domain}?upgrade=success`,
      cancel_url: `${domain}?upgrade=cancelled`,
    });

    res.status(200).json({ url: session.url });
  } catch (error: any) {
    console.error('Stripe error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
