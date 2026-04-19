import { dbService } from "../../src/services/db.ts";

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const deals = dbService.getGiftCardDeals();
    res.status(200).json(deals);
  } catch (error: any) {
    console.error("Error fetching gift cards:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
}
