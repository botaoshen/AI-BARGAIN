import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

async function run() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const supabaseAdmin = createClient(supabaseUrl!, supabaseKey!);

  const { data: users, error } = await supabaseAdmin.auth.admin.listUsers();
  console.log("Users:", users.users.length);
  if (users.users.length > 0) {
    console.log("First user metadata:", users.users[0].user_metadata);
  }
}
run();
