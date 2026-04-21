import localGiftCards from '../../src/data/gift-cards.json';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Without a global database connection on Vercel Edge/Serverless, we return the local JSON file.
  res.status(200).json(localGiftCards);
}

