import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { channel } = req.query;
    if (!channel) return res.status(400).json({ error: 'Channel is required' });

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) { 
      return res.status(500).json({ error: 'Supabase credentials missing' }); 
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabaseAdmin
      .from('chat_messages')
      .select('*')
      .eq('channel', channel)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      if (error.code === '42P01') { // undefined_table
        return res.status(200).json({ error: 'TABLE_MISSING' });
      }
      throw error;
    }

    const mappedData = data.map(row => ({
      id: row.id,
      channel: row.channel,
      userId: row.user_id,
      userEmail: row.user_email || 'Guest',
      text: row.text,
      isOG: row.is_og,
      tier: row.tier,
      timestamp: row.created_at
    }));

    return res.status(200).json({ messages: mappedData.reverse() });
  } catch (error: any) {
    console.error('Chat history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
