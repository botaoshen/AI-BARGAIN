import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

async function run() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const supabaseAdmin = createClient(supabaseUrl!, supabaseKey!);

  const { data: users, error } = await supabaseAdmin.from('profiles').select('*').eq('email', 'nswitch1101@gmail.com');
  console.log("Users:", users);
  console.log("Error:", error);
}
run();
