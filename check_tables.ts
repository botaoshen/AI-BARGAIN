import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl!, supabaseKey!);

async function checkTables() {
  const { data, error } = await supabase.from('subscriptions').select('*').limit(1);
  console.log('Subscriptions table check:', { data, error });
}

checkTables();
