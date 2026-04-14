import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

async function run() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const supabaseAdmin = createClient(supabaseUrl!, supabaseKey!);

  const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
  console.log(authUsers.users.map(u => ({ email: u.email, metadata: u.user_metadata })));
}
run();
