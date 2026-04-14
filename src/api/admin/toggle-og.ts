import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { adminEmail, userId, isOG } = req.body;
    if (adminEmail !== 'botaoshen@gmail.com') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    const supabaseAdmin = createClient(supabaseUrl!, supabaseKey!);

    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: { is_og: isOG }
    });
    
    if (error) throw error;

    res.status(200).json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
