import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
  const { action } = req.query;
  const method = req.method;

  if (method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { adminEmail } = req.body;
  if (adminEmail !== 'botaoshen@gmail.com') {
    return res.status(403).json({ error: "Unauthorized" });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase credentials missing' });
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

  try {
    switch (action) {
      case 'stats': {
        const { data: profiles } = await supabaseAdmin.from('profiles').select('*');
        const totalUsers = profiles?.length || 0;
        const proUsers = profiles?.filter(p => p.tier === 'pro').length || 0;
        const totalCredits = profiles?.reduce((acc, p) => acc + (p.search_credits || 0), 0) || 0;
        
        return res.status(200).json({
          totalUsers,
          proUsers,
          totalCredits,
          recentUsers: profiles?.slice(-10).reverse() || []
        });
      }

      case 'add-credits': {
        const { targetEmail, creditsToAdd } = req.body;
        const { data: profile } = await supabaseAdmin.from('profiles').select('id, search_credits').eq('email', targetEmail).single();
        if (!profile) return res.status(404).json({ error: "User not found" });

        const newCredits = (profile.search_credits || 0) + Number(creditsToAdd);
        await supabaseAdmin.from('profiles').update({ search_credits: newCredits }).eq('id', profile.id);
        
        return res.status(200).json({ success: true, newCredits });
      }

      case 'toggle-og': {
        const { userId, isOG } = req.body;
        const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
          user_metadata: { is_og: isOG }
        });
        if (error) throw error;
        return res.status(200).json({ success: true });
      }

      default:
        return res.status(400).json({ error: "Invalid action" });
    }
  } catch (error: any) {
    console.error(`Error in /api/admin action ${action}:`, error);
    res.status(500).json({ error: "Internal server error" });
  }
}
