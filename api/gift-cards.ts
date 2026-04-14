import { dbService } from '../src/services/db.ts';

export default async function handler(req: any, res: any) {
  if (req.method === 'GET') {
    try {
      const deals = dbService.getGiftCardDeals();
      return res.status(200).json(deals);
    } catch (error) {
      return res.status(500).json({ error: "Internal server error" });
    }
  }
  
  if (req.method === 'POST') {
    // Sync logic if needed, but usually triggered by admin or cron
    return res.status(405).json({ error: "Method not allowed" });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
