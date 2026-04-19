import "dotenv/config";
import express from "express";

console.log(`[${new Date().toISOString()}] Server process starting...`);

import { createServer as createViteServer } from "vite";
import cron from "node-cron";
import { GoogleGenAI, Type } from "@google/genai";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { dbService } from "./src/services/db.ts";
import { Server as SocketIOServer } from "socket.io";

console.log(`[${new Date().toISOString()}] Core modules imported.`);

// Import Vercel API handlers
import createCheckoutSessionHandler from "./api/create-checkout-session.ts";
import createPortalSessionHandler from "./api/create-portal-session.ts";
import verifyCheckoutHandler from "./api/verify-checkout.ts";
import webhookHandler from "./api/webhook.ts";
import userSyncHandler from "./api/user/sync.ts";
import userInitHandler from "./api/user/init.ts";
import userLogSearchHandler from "./api/user/log-search.ts";
import adminStatsHandler from "./api/admin/stats.ts";
import adminAddCreditsHandler from "./api/admin/add-credits.ts";
import adminToggleOgHandler from "./api/admin/toggle-og.ts";
import adminBulkAddCodesHandler from "./api/admin/bulk-add-codes.ts";
import claimIconicCodeHandler from "./api/user/claim-iconic-code.ts";
import requestGCHandler from "./api/user/request-gc.ts";

let stripeClient: Stripe | null = null;
function getStripe() {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is missing");
    stripeClient = new Stripe(key, { apiVersion: "2026-03-25.dahlia" as any });
  }
  return stripeClient;
}

async function startServer() {
  console.log(`[${new Date().toISOString()}] Starting server initialization...`);
  const app = express();
  const PORT = 3000;

  // Stripe webhook needs raw body
  console.log(`[${new Date().toISOString()}] Setting up routes...`);

  app.use(express.json());

  // API Routes using Vercel handlers
  app.post("/api/create-checkout-session", createCheckoutSessionHandler);
  app.post("/api/create-portal-session", createPortalSessionHandler);
  app.post("/api/verify-checkout", verifyCheckoutHandler);
  app.post("/api/user/sync", userSyncHandler);
  app.post("/api/user/init", userInitHandler);
  app.post("/api/user/log-search", userLogSearchHandler);
  app.post("/api/admin/stats", adminStatsHandler);
  app.post("/api/admin/add-credits", adminAddCreditsHandler);
  app.post("/api/admin/toggle-og", adminToggleOgHandler);
  app.post("/api/admin/bulk-add-codes", adminBulkAddCodesHandler);
  app.post("/api/user/claim-iconic-code", claimIconicCodeHandler);
  app.post("/api/user/request-gc", requestGCHandler);

  // Legacy endpoints (if still needed by frontend)
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

  app.post("/api/unsubscribe", (req, res) => {
    const { email, storeName } = req.body;
    dbService.unsubscribe(email, storeName);
    res.json({ success: true });
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

  app.post("/api/voucher/create", (req, res) => {
    try {
      const { code, searches } = req.body;
      dbService.createVoucher(code, searches);
      res.json({ success: true, message: `Voucher ${code} created for ${searches} searches` });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/gift-cards", (req, res) => {
    try {
      const deals = dbService.getGiftCardDeals();
      res.json(deals);
    } catch (error) {
      console.error("Error fetching gift cards:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

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
  cron.schedule("0 9 * * *", async () => {
    console.log("Running daily bargain check...");
    const allSubs = dbService.getAllSubscriptions();
    const stores = [...new Set(allSubs.map(s => s.store_name))];
    for (const store of stores) {
      console.log(`Checking deals for ${store}...`);
    }
  });

  // OG Monthly Credit Reset (20th of the month at midnight)
  // "不可累计" means reset to 50, not add 50.
  cron.schedule("0 0 20 * *", async () => {
    console.log(`[${new Date().toISOString()}] Running monthly OG credit reset...`);
    try {
      const supabaseUrl = process.env.VITE_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
      
      if (!supabaseUrl || !supabaseKey) {
        console.error("Supabase credentials missing for monthly reset");
        return;
      }

      const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

      // We list all users to check metadata. 
      // For very large user bases, this should be paginated or synced to a queryable column.
      let { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers();
      
      if (error) {
        console.error("Failed to list users for OG reset:", error);
        return;
      }

      let resetCount = 0;
      for (const user of users) {
        const isOG = user.user_metadata?.is_og || user.email === 'nswitch1101@gmail.com';
        
        if (isOG) {
          // Reset to 50 (non-cumulative)
          const { error: updateError } = await supabaseAdmin
            .from('profiles')
            .update({ search_credits: 50 })
            .eq('id', user.id);
          
          if (updateError) {
            console.error(`Failed to reset credits for user ${user.email}:`, updateError);
          } else {
            resetCount++;
          }
        }
      }
      console.log(`[${new Date().toISOString()}] Monthly OG credit reset complete. Reset ${resetCount} users.`);
    } catch (err) {
      console.error("Unexpected error in monthly OG reset:", err);
    }
  });

  const syncGiftCardDeals = async () => {
    try {
      console.log("Starting gift card deals sync from ozbargain.com.au...");
      const response = await fetch("https://www.ozbargain.com.au/tag/gift-card");
      const html = await response.text();

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
      
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not set in the environment.");
      }
      const ai = new GoogleGenAI({ apiKey });
      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
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
        if (deals && deals.length > 0) {
          dbService.updateGiftCardDeals(deals);
        }
      }
    } catch (error: any) {
      if (error?.message?.includes("suspended") || error?.message?.includes("PERMISSION_DENIED")) {
        console.error("CRITICAL: Your Gemini API Key has been suspended by Google. Please update your GEMINI_API_KEY in the Settings menu.");
      } else {
        console.error("Failed to sync gift card deals:", error);
      }
      // We don't throw here to avoid crashing the background cron or startup
    }
  };

  cron.schedule("0 2 * * 1,4", () => {
    syncGiftCardDeals().catch(error => {
      console.error("Scheduled syncGiftCardDeals failed:", error);
    });
  });

  if (process.env.NODE_ENV !== "production") {
    console.log(`[${new Date().toISOString()}] Initializing Vite middleware (this may take a few seconds)...`);
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: { port: 0 } },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log(`[${new Date().toISOString()}] Vite middleware ready.`);
  } else {
    app.use(express.static("dist"));
  }

  const httpServer = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    
    // Initial sync after server is up - delayed to let the platform recognize the server is ready
    setTimeout(() => {
      console.log("Checking if initial gift card sync is needed...");
      if (dbService.getGiftCardDeals().deals.length === 0) {
        console.log("Database empty, starting initial gift card deals sync...");
        syncGiftCardDeals().catch(error => {
          console.error("Initial syncGiftCardDeals failed:", error);
        });
      } else {
        console.log("Database already contains deals, skipping initial sync.");
      }
    }, 5000);
  });

  // Socket.io initialization
  const io = new SocketIOServer(httpServer, {
    cors: { origin: "*" }
  });

  const chatHistory: Record<string, any[]> = {
    og: [],
    pro: []
  };

  io.on("connection", (socket) => {
    socket.on("join_channel", (channel) => {
      socket.join(channel);
      socket.emit("chat_history", chatHistory[channel] || []);
    });

    socket.on("send_message", ({ channel, message }) => {
      if (chatHistory[channel]) {
        const msg = { ...message, timestamp: new Date().toISOString() };
        chatHistory[channel].push(msg);
        if (chatHistory[channel].length > 100) {
          chatHistory[channel].shift(); // Keep only last 100 messages
        }
        io.to(channel).emit("new_message", msg);
      }
    });
  });
}

startServer();
