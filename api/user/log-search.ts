import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    // If it's a guest user (starts with guest- or is a random string), just return success
    // The frontend will handle localStorage fallback for guests.
    if (userId.startsWith('guest-') || !userId.includes('-')) {
      return res.status(200).json({ success: true, newCount: 1, extraSearches: 0 });
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: 'Supabase credentials missing' });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

    const { data: profile, error: fetchError } = await supabaseAdmin
      .from('profiles')
      .select('tier, search_credits')
      .eq('id', userId)
      .single();

    if (profile && !fetchError) {
      if (profile.tier !== 'admin' && profile.search_credits <= 0) {
        return res.status(403).json({ error: "Monthly limit reached" });
      }
      
      if (profile.tier !== 'admin') {
        const newCredits = Math.max(0, profile.search_credits - 1);
        await supabaseAdmin
          .from("profiles")
          .update({ search_credits: newCredits })
          .eq("id", userId);
          
        return res.status(200).json({ 
          success: true, 
          newCount: newCredits > 0 ? 0 : 1, 
          extraSearches: newCredits 
        });
      }
      
      return res.status(200).json({ success: true, newCount: 0, extraSearches: profile.search_credits });
    }

    res.status(200).json({ success: true, newCount: 1, extraSearches: 0 });
  } catch (error: any) {
    console.error("Error in /api/user/log-search:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
