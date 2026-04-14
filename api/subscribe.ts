import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  if (request.method === 'POST') {
    const { email, storeName } = request.body;
    
    if (!email || !storeName) {
      return response.status(400).json({ error: "Email and Store Name are required" });
    }

    // NOTE: In a real Vercel deployment, you would use a database like Vercel Postgres or Supabase.
    // SQLite (better-sqlite3) will NOT work on Vercel because the filesystem is read-only and ephemeral.
    
    console.log(`Mock subscription for ${email} to ${storeName}`);
    
    return response.status(200).json({ 
      success: true, 
      message: `Subscribed to ${storeName} (Mocked for Vercel Demo)` 
    });
  }

  return response.status(405).json({ error: "Method not allowed" });
}
