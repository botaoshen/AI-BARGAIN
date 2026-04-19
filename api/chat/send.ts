import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { channel, message } = req.body;
    if (!channel || !message) return res.status(400).json({ error: 'Invalid payload' });

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) { 
      return res.status(500).json({ error: 'Supabase credentials missing' }); 
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabaseAdmin
      .from('chat_messages')
      .insert([{
        channel,
        user_id: message.userId,
        user_email: message.userEmail,
        text: message.text,
        is_og: message.isOG,
        tier: message.tier
      }])
      .select()
      .single();

    if (error) {
      if (error.code === '42P01') {
        return res.status(404).json({ error: 'TABLE_MISSING' });
      }
      throw error;
    }

    const mappedMessage = {
      id: data.id,
      channel: data.channel,
      userId: data.user_id,
      userEmail: data.user_email || 'Guest',
      text: data.text,
      isOG: data.is_og,
      tier: data.tier,
      timestamp: data.created_at
    };

    return res.status(200).json({ message: mappedMessage });
  } catch (error: any) {
    console.error('Chat send error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
