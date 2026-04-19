import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    // Validate UUID format to prevent Supabase error
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const isUuid = uuidRegex.test(userId);

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: 'Supabase credentials missing' });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

    // 1. Get user profile and metadata to determine limits
    let isOG = false;
    let userTier = 'free';
    
    if (isUuid) {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
      isOG = !!authUser?.user?.user_metadata?.is_og;

      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('tier')
        .eq('id', userId)
        .single();
      
      if (profile) {
        userTier = profile.tier;
      }
    }

    const isProOrAdmin = userTier === 'pro' || userTier === 'admin';

    if (!isOG && !isProOrAdmin) {
      return res.status(403).json({ error: "Only PRO or OG users can claim free Iconic codes." });
    }

    const maxClaimsPerMonth = isProOrAdmin ? 4 : 2;

    // 2. Check how many codes claimed this month
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();

    const { data: claimsThisMonth, error: claimsError } = await supabaseAdmin
      .from('iconic_codes')
      .select('*')
      .eq('claimed_by', userId)
      .is('purchase_session_id', null) // Only count free claims, not purchased ones
      .gte('claimed_at', firstDayOfMonth)
      .lte('claimed_at', lastDayOfMonth);

    if (claimsError) {
      console.error("Failed to fetch claims:", claimsError);
      return res.status(500).json({ error: "Failed to check claim limits." });
    }

    const numClaims = claimsThisMonth?.length || 0;

    // If user asks for a code, but they've reached their limit, we can return the last code they claimed this month if we want to show it, or just show an error.
    // The previous logic would return `alreadyClaimed: true` and show their *daily* code. 
    // Now, if they've reached the limit, we can return `alreadyClaimed` with the most recently claimed code, or just an error message.
    if (numClaims >= maxClaimsPerMonth) {
      // Return the most recently claimed code so the UI doesn't break if it expects a code on alreadyClaimed
      const lastClaimed = claimsThisMonth && claimsThisMonth.length > 0
        ? claimsThisMonth.sort((a, b) => new Date(b.claimed_at).getTime() - new Date(a.claimed_at).getTime())[0]
        : null;

      return res.status(200).json({ 
        success: true, 
        alreadyClaimed: true, 
        code: lastClaimed?.code,
        message: `You have reached your monthly limit of ${maxClaimsPerMonth} free Iconic codes!` 
      });
    }

    // 3. Find an available free code
    const { data: availableCode, error: findError } = await supabaseAdmin
      .from('iconic_codes')
      .select('*')
      .is('claimed_by', null)
      .limit(1)
      .maybeSingle();

    if (!availableCode) {
      return res.status(404).json({ error: "No available Iconic codes in the library. Please check back later!" });
    }

    // 4. Claim the code
    const { data: updatedCode, error: updateError } = await supabaseAdmin
      .from('iconic_codes')
      .update({ 
        claimed_by: userId, 
        claimed_at: new Date().toISOString() 
      })
      .eq('id', availableCode.id)
      .select()
      .single();

    if (updateError) throw updateError;

    res.status(200).json({ 
      success: true, 
      code: updatedCode.code,
      message: `Successfully claimed your free Iconic code! (${numClaims + 1}/${maxClaimsPerMonth} this month)` 
    });

  } catch (error: any) {
    console.error("Error in /api/user/claim-iconic-code:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
