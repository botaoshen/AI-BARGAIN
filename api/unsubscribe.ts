import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  if (request.method === 'POST') {
    const { email, storeName } = request.body;
    return response.status(200).json({ success: true });
  }

  return response.status(405).json({ error: "Method not allowed" });
}
