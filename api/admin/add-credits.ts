import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { adminEmail, targetEmail, creditsToAdd } = req.body;
    if (adminEmail !== 'botaoshen@gmail.com') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    const supabaseAdmin = createClient(supabaseUrl!, supabaseKey!);

    const { data: profile, error: fetchError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('email', targetEmail)
      .single();
      
    if (fetchError || !profile) return res.status(404).json({ error: 'User not found' });

    const newCredits = (profile.search_credits || 0) + creditsToAdd;
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ search_credits: newCredits })
      .eq('email', targetEmail);
    
    if (updateError) throw updateError;

    res.status(200).json({ success: true, newCredits });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
