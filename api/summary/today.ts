import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDailySummary } from '@pir/db';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const today = new Date().toLocaleDateString('sv');
  res.json(await getDailySummary(today));
}
