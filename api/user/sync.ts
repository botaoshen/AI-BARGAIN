import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, email } = req.body;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: 'Supabase credentials missing' });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

    // Validate if userId is a UUID (logged in user) or random string (guest)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const isUuid = uuidRegex.test(userId);

    // Check if user profile exists
    const { data: profile, error: fetchError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    let isOG = false;
    if (isUuid) {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
      isOG = !!authUser?.user?.user_metadata?.is_og;
    }

    if (!isOG) {
      isOG = email === 'nswitch1101@gmail.com';
    }

    let userTier = email === 'botaoshen@gmail.com' ? 'admin' : 'free';
    let searchCredits = 5;

    if (!profile && !fetchError) {
      // Create profile
      await supabaseAdmin.from('profiles').insert({
        id: userId,
        email: email,
        tier: userTier,
        search_credits: searchCredits
      });
    } else if (profile) {
      userTier = email === 'botaoshen@gmail.com' ? 'admin' : profile.tier;
      searchCredits = profile.search_credits;
      
      // Update email if it changed
      if (email && profile.email !== email) {
        await supabaseAdmin.from('profiles').update({ email }).eq('id', userId);
      }
    }

    // For frontend compatibility, map search_credits to dailyCount
    // The frontend expects dailyCount >= 1 to block free users.
    // So if searchCredits <= 0, dailyCount = 1 (blocked). If > 0, dailyCount = 0 (allowed).
    const dailyCount = searchCredits > 0 ? 0 : 1;

    res.status(200).json({ 
      user: { id: userId, email, tier: userTier, isOG }, 
      dailyCount: dailyCount, 
      extraSearches: searchCredits 
    });
  } catch (error: any) {
    console.error("Error in /api/user/sync:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
