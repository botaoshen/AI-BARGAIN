import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase credentials missing' });
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

  if (req.method === 'GET') {
    try {
      // Fetch latest 1000 searches to aggregate trending topics
      // In a high-traffic app, you'd use a Postgres View or RPC for this.
      const { data, error } = await supabaseAdmin
        .from('global_search_logs')
        .select('query')
        .order('created_at', { ascending: false })
        .limit(1000);

      if (error) {
        // If table doesn't exist yet, return empty list gracefully
        if (error.code === 'PGRST116' || error.message.includes('not found')) {
          return res.status(200).json([]);
        }
        throw error;
      }

      // Aggregate counts in memory
      const counts: Record<string, number> = {};
      data?.forEach(item => {
        const q = item.query?.toLowerCase().trim();
        if (q) counts[q] = (counts[q] || 0) + 1;
      });

      const trending = Object.entries(counts)
        .map(([query, count]) => ({ query, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      return res.status(200).json(trending);
    } catch (error: any) {
      console.error("Error fetching trending searches:", error);
      return res.status(200).json([]);
    }
  }

  if (req.method === 'POST') {
    try {
      const { query, userId } = req.body;
      if (!query) return res.status(400).json({ error: "Query is required" });
      
      const { error } = await supabaseAdmin
        .from('global_search_logs')
        .insert([{ 
          query: query.toLowerCase().trim(), 
          user_id: userId || 'anonymous' 
        }]);

      if (error) throw error;
      
      return res.status(200).json({ success: true });
    } catch (error: any) {
      console.error("Error logging global search query:", error);
      // Silent fail to ensure user experience isn't broken
      return res.status(200).json({ success: true });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
