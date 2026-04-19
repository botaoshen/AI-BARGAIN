import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { adminEmail, codes, brand, type } = req.body;

    if (adminEmail !== 'botaoshen@gmail.com') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (!codes || !Array.isArray(codes) || codes.length === 0) {
      return res.status(400).json({ error: 'Invalid codes array' });
    }

    const tableName = brand === 'Iconic' ? 'iconic_codes' : 'farfetch_codes';

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    const supabaseAdmin = createClient(supabaseUrl!, supabaseKey!);

    // Get the current max ID to bypass sequence desync issues caused by CSV imports
    const { data: maxIdData } = await supabaseAdmin
      .from(tableName)
      .select('id')
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    let nextId = (maxIdData?.id || 0) + 1;

    // Filter out codes that already exist in case of duplicate uploads
    const rawCodes = codes.map(c => c.trim()).filter(c => c.length > 0);
    const uniqueIncomingCodes = [...new Set(rawCodes)]; // remove duplicates from input

    if (uniqueIncomingCodes.length === 0) {
      return res.status(400).json({ error: 'No valid codes found' });
    }

    const { data: existingCodes } = await supabaseAdmin
      .from(tableName)
      .select('code')
      .in('code', uniqueIncomingCodes);

    const existingCodeSet = new Set(existingCodes?.map(e => e.code) || []);

    // Map codes to insert objects
    const toInsert = uniqueIncomingCodes
      .filter(code => !existingCodeSet.has(code))
      .map(code => ({
        id: nextId++,
        code: code,
        created_at: new Date().toISOString()
      }));

    if (toInsert.length === 0) {
      return res.status(200).json({ success: true, count: 0, message: 'All codes were already in the database.' });
    }

    const { error } = await supabaseAdmin
      .from(tableName)
      .insert(toInsert);

    if (error) {
      console.error("Supabase insert error details:", error);
      throw new Error(error.message || JSON.stringify(error));
    }

    res.status(200).json({ success: true, count: toInsert.length });
  } catch (error: any) {
    console.error("Bulk add error:", error);
    res.status(500).json({ error: error.message || JSON.stringify(error) });
  }
}
