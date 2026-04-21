import { dbService } from "../src/services/db.ts";

export default async function handler(req: any, res: any) {
  if (req.method === 'GET') {
    try {
      const trending = dbService.getTrendingSearches();
      return res.status(200).json(trending);
    } catch (error: any) {
      console.error("Error fetching trending searches:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  if (req.method === 'POST') {
    try {
      const { query, userId } = req.body;
      if (!query) return res.status(400).json({ error: "Query is required" });
      
      // Log search query for trending stats
      dbService.logSearch(userId || 'anonymous', query);
      
      return res.status(200).json({ success: true });
    } catch (error: any) {
      // Slient fail for logging to avoid breaking UX
      console.error("Error logging search query:", error);
      return res.status(200).json({ success: true });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
