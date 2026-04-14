import statsHandler from '../src/api/admin/stats.ts';
import addCreditsHandler from '../src/api/admin/add-credits.ts';
import toggleOgHandler from '../src/api/admin/toggle-og.ts';

export default async function handler(req: any, res: any) {
  const path = req.url?.split('?')[0] || '';
  if (path.includes('/stats')) return statsHandler(req, res);
  if (path.includes('/add-credits')) return addCreditsHandler(req, res);
  if (path.includes('/toggle-og')) return toggleOgHandler(req, res);
  return res.status(404).json({ error: 'Not found' });
}
