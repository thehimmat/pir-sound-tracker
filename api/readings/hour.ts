import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getReadingsSince } from '@pir/db';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const since = Date.now() - 10 * 60 * 1000;
  res.json(await getReadingsSince(since));
}
