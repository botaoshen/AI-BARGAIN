import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import { dbService } from "./src/services/db.ts";
import cron from "node-cron";
import nodemailer from "nodemailer";
import { GoogleGenAI, Type } from "@google/genai";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

let stripeClient: Stripe | null = null;
function getStripe() {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is missing");
    stripeClient = new Stripe(key, { apiVersion: "2025-02-24.acacia" });
  }
  return stripeClient;
}

let supabaseAdminClient: any = null;
function getSupabaseAdmin() {
  if (!supabaseAdminClient) {
    const url = process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("Supabase credentials missing");
    supabaseAdminClient = createClient(url, key);
  }
  return supabaseAdminClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Stripe webhook needs raw body
  app.post("/api/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
      event = getStripe().webhooks.constructEvent(
        req.body,
        sig as string,
        process.env.STRIPE_WEBHOOK_SECRET || ""
      );
    } catch (err: any) {
      console.error(`Webhook Error: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          const userId = session.client_reference_id;
          const customerId = session.customer as string;
          const subscriptionId = session.subscription as string;

          if (userId) {
            // Update Supabase profile
            await getSupabaseAdmin().from("profiles").update({
              tier: "pro",
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
              search_credits: 100, // Give 100 credits on signup
            }).eq("id", userId);
            
            // Also update local SQLite for fallback
            dbService.upgradeUser(userId);
          }
          break;
        }
        case "invoice.payment_succeeded": {
          const invoice = event.data.object as Stripe.Invoice;
          const subscriptionId = invoice.subscription as string;
          
          if (invoice.billing_reason === 'subscription_cycle') {
            // Reset monthly search credits to 100
            await getSupabaseAdmin().from("profiles").update({
              search_credits: 100,
            }).eq("stripe_subscription_id", subscriptionId);
          }
          break;
        }
        case "customer.subscription.deleted": {
          const subscription = event.data.object as Stripe.Subscription;
          await getSupabaseAdmin().from("profiles").update({
            tier: "free",
            search_credits: 5, // Reset to free tier credits
          }).eq("stripe_subscription_id", subscription.id);
          break;
        }
      }
      res.json({ received: true });
    } catch (error) {
      console.error("Error processing webhook:", error);
      res.status(500).json({ error: "Webhook handler failed" });
    }
  });

  app.use(express.json());

  // API Routes
  app.post("/api/create-checkout-session", async (req, res) => {
    try {
      const { userId, email } = req.body;
      if (!userId) return res.status(400).json({ error: "userId is required" });

      const domain = req.headers.origin || req.headers.referer?.replace(/\/$/, '') || `${req.protocol}://${req.get("host")}`;

      const session = await getStripe().checkout.sessions.create({
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
          trial_period_days: 7,
        },
        success_url: `${domain}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${domain}`,
      });

      res.json({ url: session.url });
    } catch (error: any) {
      console.error("Error creating checkout session:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/subscribe", (req, res) => {
    const { email, storeName } = req.body;
    if (!email || !storeName) {
      return res.status(400).json({ error: "Email and Store Name are required" });
    }
    try {
      dbService.subscribe(email, storeName);
      res.json({ success: true, message: `Subscribed to ${storeName}` });
    } catch (error) {
      res.status(500).json({ error: "Failed to subscribe" });
    }
  });

  app.get("/api/subscriptions", (req, res) => {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: "Email is required" });
    const subs = dbService.getSubscriptions(email as string);
    res.json(subs);
  });

  app.post("/api/unsubscribe", (req, res) => {
    const { email, storeName } = req.body;
    dbService.unsubscribe(email, storeName);
    res.json({ success: true });
  });

  // User Management
  app.post("/api/user/init", (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) return res.status(400).json({ error: "userId is required" });
      dbService.createUser(userId);
      const user = dbService.getUser(userId);
      const count = dbService.getDailySearchCount(userId);
      res.json({ user, dailyCount: count, extraSearches: user?.extra_searches || 0 });
    } catch (error) {
      console.error("Error in /api/user/init:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/user/sync", (req, res) => {
    try {
      const { userId, email } = req.body;
      if (!userId || !email) return res.status(400).json({ error: "userId and email are required" });
      
      let user = dbService.getUser(userId);
      const tier = email === 'botaoshen@gmail.com' ? 'admin' : (user?.tier || 'free');

      if (!user) {
        dbService.createUser(userId, tier, email);
      } else {
        dbService.updateUserEmailAndTier(userId, email, tier);
      }
      
      user = dbService.getUser(userId);
      const count = dbService.getDailySearchCount(userId);
      res.json({ user, dailyCount: count, extraSearches: user?.extra_searches || 0 });
    } catch (error) {
      console.error("Error in /api/user/sync:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/user/:userId", (req, res) => {
    try {
      const { userId } = req.params;
      const user = dbService.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });
      const count = dbService.getDailySearchCount(userId);
      res.json({ user, dailyCount: count, extraSearches: user?.extra_searches || 0 });
    } catch (error) {
      console.error("Error in /api/user/:userId:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/user/upgrade", (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) return res.status(400).json({ error: "userId is required" });
      dbService.upgradeUser(userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error in /api/user/upgrade:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Temporary endpoint to reset user tier for testing
  app.post("/api/user/reset", (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) return res.status(400).json({ error: "userId is required" });
      dbService.resetUser(userId);
      res.json({ success: true, message: "User reset to free tier" });
    } catch (error) {
      console.error("Error in /api/user/reset:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/user/log-search", async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) return res.status(400).json({ error: "userId is required" });
      
      // Try Supabase first
      try {
        const { data: profile, error: sbError } = await getSupabaseAdmin()
          .from("profiles")
          .select("tier, search_credits")
          .eq("id", userId)
          .single();

        if (profile && !sbError) {
          if (profile.tier !== 'admin' && profile.search_credits <= 0) {
            return res.status(403).json({ error: "Monthly limit reached" });
          }
          if (profile.tier !== 'admin') {
            await getSupabaseAdmin()
              .from("profiles")
              .update({ search_credits: profile.search_credits - 1 })
              .eq("id", userId);
          }
          
          // Also log in SQLite for history
          dbService.logSearch(userId);
          return res.json({ success: true, newCount: 1, extraSearches: profile.search_credits - 1 });
        }
      } catch (e) {
        console.warn("Supabase not configured or failed, falling back to SQLite");
      }

      // Fallback to SQLite
      const user = dbService.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });

      const count = dbService.getDailySearchCount(userId);
      
      if (user.tier !== 'admin' && user.tier === 'free' && count >= 1) {
        if (user.extra_searches > 0) {
          dbService.useExtraSearch(userId);
        } else {
          return res.status(403).json({ error: "Daily limit reached" });
        }
      }

      dbService.logSearch(userId);
      const updatedUser = dbService.getUser(userId);
      res.json({ success: true, newCount: count + 1, extraSearches: updatedUser?.extra_searches || 0 });
    } catch (error) {
      console.error("Error in /api/user/log-search:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/voucher/redeem", (req, res) => {
    try {
      const { userId, code } = req.body;
      if (!userId || !code) return res.status(400).json({ error: "userId and code are required" });
      
      if (code.toLowerCase() === 'test50') {
        dbService.addExtraSearches(userId, 50);
        const user = dbService.getUser(userId);
        return res.json({ success: true, message: "Successfully redeemed 50 searches!", extraSearches: user?.extra_searches });
      }

      const result = dbService.redeemVoucher(userId, code);
      if (result.success) {
        const user = dbService.getUser(userId);
        res.json({ success: true, message: result.message, extraSearches: user?.extra_searches });
      } else {
        res.status(400).json({ error: result.message });
      }
    } catch (error) {
      console.error("Error in /api/voucher/redeem:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin endpoint to generate vouchers for testing
  app.post("/api/voucher/create", (req, res) => {
    try {
      const { code, searches } = req.body;
      dbService.createVoucher(code, searches);
      res.json({ success: true, message: `Voucher ${code} created for ${searches} searches` });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Endpoint to fetch the latest synced gift card deals
  app.get("/api/gift-cards", (req, res) => {
    try {
      const deals = dbService.getGiftCardDeals();
      res.json(deals);
    } catch (error) {
      console.error("Error fetching gift cards:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Endpoint to manually trigger a sync
  app.post("/api/gift-cards/sync", async (req, res) => {
    try {
      await syncGiftCardDeals();
      const deals = dbService.getGiftCardDeals();
      res.json({ success: true, ...deals });
    } catch (error: any) {
      console.error("Error syncing gift cards:", error);
      const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
      res.status(500).json({ error: error.message || "Internal server error", apiKeyUsed: apiKey, geminiEnv: process.env.GEMINI_API_KEY, viteGeminiEnv: process.env.VITE_GEMINI_API_KEY });
    }
  });

  // Daily Cron Job (Simulated)
  // In a real app, this would use Gemini to find new deals and email users
  cron.schedule("0 9 * * *", async () => {
    console.log("Running daily bargain check...");
    const allSubs = dbService.getAllSubscriptions();
    
    // Group by store to minimize API calls
    const stores = [...new Set(allSubs.map(s => s.store_name))];
    
    for (const store of stores) {
      console.log(`Checking deals for ${store}...`);
      // Here we would call findDiscountCodes(store)
      // and compare with previous results to find NEW deals
    }
  });

  // Sync Gift Card Deals from ozbargain.com.au 1-2 times a week (Mondays and Thursdays at 2:00 AM)
  const syncGiftCardDeals = async () => {
    try {
      console.log("Starting gift card deals sync from ozbargain.com.au...");
      const response = await fetch("https://www.ozbargain.com.au/tag/gift-card");
      const html = await response.text();

      // Extract text to save tokens (basic strip tags)
      // We will keep href attributes so Gemini can extract the links
      const textContent = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                              .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
                              .substring(0, 80000);

      const prompt = `Extract the top 6 latest gift card offers from the following website HTML (OzBargain).
      Return a JSON array of objects with these exact keys:
      - title: (e.g., "Apple Gift Cards")
      - store: (e.g., "Woolworths", "Coles")
      - offer: (e.g., "20x Everyday Rewards points" or "10% off")
      - dates: (e.g., "4 Mar - 10 Mar" or "Latest Offer")
      - type: (must be exactly one of: "this_week", "next_week", "ongoing")
      - link: (the full URL to the deal, e.g., "https://www.ozbargain.com.au/node/123456")

      Website HTML:
      ${textContent}`;

      let apiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
      if (apiKey === 'MY_GEMINI_API_KEY' || apiKey === 'your_api_key_here') {
        apiKey = process.env.VITE_GEMINI_API_KEY !== 'MY_GEMINI_API_KEY' ? process.env.VITE_GEMINI_API_KEY : undefined;
      }
      
      console.log("Using API Key:", apiKey ? apiKey.substring(0, 10) + "..." : "undefined");
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not set in the environment.");
      }
      const ai = new GoogleGenAI({ apiKey });
      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                store: { type: Type.STRING },
                offer: { type: Type.STRING },
                dates: { type: Type.STRING },
                type: { type: Type.STRING, enum: ["this_week", "next_week", "ongoing"] },
                link: { type: Type.STRING }
              },
              required: ["title", "store", "offer", "dates", "type", "link"]
            }
          }
        }
      });

      if (result.text) {
        const deals = JSON.parse(result.text);
        console.log("Parsed deals length:", deals?.length);
        if (deals && deals.length > 0) {
          dbService.updateGiftCardDeals(deals);
          console.log(`Successfully synced ${deals.length} deals.`);
        } else {
          console.log("No deals found in Gemini response.");
        }
      } else {
        console.log("Gemini response text is empty.");
      }
    } catch (error) {
      console.error("Failed to sync gift card deals:", error);
      throw error;
    }
  };

  // Schedule cron job (Mondays and Thursdays at 2:00 AM)
  cron.schedule("0 2 * * 1,4", syncGiftCardDeals);

  // Run sync on startup if DB is empty
  if (dbService.getGiftCardDeals().deals.length === 0) {
    syncGiftCardDeals();
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
