import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getReadingsWindow } from '@pir/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const from = parseInt(req.query['from'] as string, 10);
  const to   = parseInt(req.query['to']   as string, 10);
  if (isNaN(from) || isNaN(to) || to <= from) {
    res.status(400).json({ error: 'from and to must be valid ms timestamps with to > from' });
    return;
  }
  res.json(await getReadingsWindow(from, to));
}
