import syncHandler from '../src/api/user/sync.ts';
import initHandler from '../src/api/user/init.ts';
import logSearchHandler from '../src/api/user/log-search.ts';

export default async function handler(req: any, res: any) {
  const path = req.url?.split('?')[0] || '';
  if (path.includes('/sync')) return syncHandler(req, res);
  if (path.includes('/init')) return initHandler(req, res);
  if (path.includes('/log-search')) return logSearchHandler(req, res);
  return res.status(404).json({ error: 'Not found' });
}
