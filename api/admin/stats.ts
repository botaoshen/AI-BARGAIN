import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { adminEmail } = req.body;
    if (adminEmail !== 'botaoshen@gmail.com') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    const supabaseAdmin = createClient(supabaseUrl!, supabaseKey!);

    const { data: profiles, error } = await supabaseAdmin
      .from('profiles')
      .select('*');
    
    if (error) throw error;

    // Fetch auth users to get is_og from user_metadata
    const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
    const authMap = new Map<string, boolean>(
      (authUsers?.users?.map(u => [u.id, u.user_metadata?.is_og || false]) || []) as [string, boolean][]
    );

    const enrichedProfiles = profiles.map(p => ({
      ...p,
      is_og: authMap.get(p.id) || false
    }));

    const totalUsers = enrichedProfiles.length;
    const proUsers = enrichedProfiles.filter(p => p.tier === 'pro').length;
    const freeUsers = enrichedProfiles.filter(p => p.tier === 'free').length;

    res.status(200).json({ totalUsers, proUsers, freeUsers, users: enrichedProfiles });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
