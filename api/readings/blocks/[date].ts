import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDayBlocks } from '@pir/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const date = req.query['date'] as string;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    return;
  }
  const from = parseInt(req.query['from'] as string, 10);
  const to   = parseInt(req.query['to']   as string, 10);
  if (isNaN(from) || isNaN(to)) {
    res.status(400).json({ error: 'from and to (epoch ms) are required' });
    return;
  }
  res.json(await getDayBlocks(from, to));
}
