import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAllDailySummaries } from '@pir/db';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  res.json(await getAllDailySummaries());
}
