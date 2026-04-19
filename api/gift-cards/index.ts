export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Without a global database connection on Vercel Edge/Serverless, we return empty structure.
  // The client will automatically fall back to fetching via the `/api/gift-cards/sync` endpoint.
  res.status(200).json({ deals: [], lastUpdated: null });
}

