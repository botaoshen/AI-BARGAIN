export default async function handler(req: any, res: any) {
  const { action } = req.query;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, storeName } = req.body;
  if (!email || !storeName) return res.status(400).json({ error: "Missing data" });

  try {
    if (action === 'subscribe') {
      console.log(`Mock subscription for ${email} to ${storeName}`);
      return res.status(200).json({ success: true, message: `Subscribed to ${storeName}` });
    } else if (action === 'unsubscribe') {
      console.log(`Mock unsubscription for ${email} from ${storeName}`);
      return res.status(200).json({ success: true });
    }
    return res.status(400).json({ error: "Invalid action" });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
}
