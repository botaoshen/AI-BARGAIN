import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  if (request.method === 'GET') {
    const { email } = request.query;
    if (!email) return response.status(400).json({ error: "Email is required" });
    
    // Mocking subscriptions for Vercel
    return response.status(200).json([]);
  }

  return response.status(405).json({ error: "Method not allowed" });
}
