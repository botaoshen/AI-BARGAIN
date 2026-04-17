import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, email, storeName, targetDiscount, additionalInfo } = req.body;
    
    if (!userId || !storeName) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: 'Supabase credentials missing' });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

    // Verify user is Pro/Admin
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('tier')
      .eq('id', userId)
      .single();

    if (!profile || (profile.tier !== 'pro' && profile.tier !== 'admin')) {
      return res.status(403).json({ error: "Only Pro users can request custom gift card discounts." });
    }

    // Insert request
    const { error } = await supabaseAdmin
      .from('gc_requests')
      .insert({
        user_id: userId,
        email: email,
        store_name: storeName,
        target_discount: targetDiscount,
        additional_info: additionalInfo,
        status: 'pending',
        created_at: new Date().toISOString()
      });

    if (error) throw error;

    res.status(200).json({ success: true, message: "Request received! We will notify you via email when we find a match." });

  } catch (error: any) {
    console.error("Error in /api/user/request-gc:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
