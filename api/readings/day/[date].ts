import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getReadingsForDay } from '@pir/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const date = req.query['date'] as string;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    return;
  }
  res.json(await getReadingsForDay(date));
}
