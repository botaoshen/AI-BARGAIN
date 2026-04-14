import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

async function run() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const supabaseAdmin = createClient(supabaseUrl!, supabaseKey!);

  const { data, error } = await supabaseAdmin.from('profiles').select('*').limit(1);
  if (data && data.length > 0) {
    console.log("Columns:", Object.keys(data[0]));
  }
}
run();
