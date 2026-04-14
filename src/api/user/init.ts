import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    // For guest users, we just return a free tier.
    // We don't store guest users in Supabase to save space.
    res.status(200).json({ 
      user: { id: userId, tier: 'free' }, 
      dailyCount: 0, 
      extraSearches: 0 
    });
  } catch (error: any) {
    console.error("Error in /api/user/init:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
