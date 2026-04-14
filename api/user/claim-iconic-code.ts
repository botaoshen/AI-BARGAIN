import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: 'Supabase credentials missing' });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

    // 1. Verify User is OG
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
    const isOG = authUser?.user?.user_metadata?.is_og;

    if (!isOG) {
      return res.status(403).json({ error: "Only OG users can claim daily Iconic codes." });
    }

    // 2. Check if user already claimed today
    const today = new Date().toISOString().split('T')[0];
    const startOfDay = `${today}T00:00:00.000Z`;
    const endOfDay = `${today}T23:59:59.999Z`;

    const { data: existingClaim } = await supabaseAdmin
      .from('iconic_codes')
      .select('*')
      .eq('claimed_by', userId)
      .gte('claimed_at', startOfDay)
      .lte('claimed_at', endOfDay)
      .maybeSingle();

    if (existingClaim) {
      return res.status(200).json({ 
        success: true, 
        alreadyClaimed: true, 
        code: existingClaim.code,
        message: "You have already claimed your code for today!" 
      });
    }

    // 3. Find an available code
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
      message: "Successfully claimed your daily Iconic code!" 
    });

  } catch (error: any) {
    console.error("Error in /api/user/claim-iconic-code:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
