import express from "express";
import { createServer as createViteServer } from "vite";
import { dbService } from "./src/services/db.ts";
import cron from "node-cron";
import nodemailer from "nodemailer";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
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

  app.get("/api/stats", (req, res) => {
    const count = dbService.getSavingsCount();
    console.log(`[Stats] Current savings count: ${count}`);
    res.json({ count });
  });

  app.post("/api/stats/increment", (req, res) => {
    dbService.incrementSavingsCount();
    console.log(`[Stats] Incremented savings count`);
    res.json({ success: true });
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
