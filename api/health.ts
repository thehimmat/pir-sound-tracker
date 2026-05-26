import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getClient } from '@pir/db';

const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * GET /api/health
 *
 * Returns 200 if the poller has written a row to the DB within the last hour,
 * 503 otherwise. UptimeRobot points here instead of the Fly machine directly
 * so brief machine restarts (connection timeouts) don't trigger alert emails.
 */
export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const since = Date.now() - ONE_HOUR_MS;
  const { data, error } = await getClient()
    .from('readings')
    .select('ts')
    .gte('ts', since)
    .order('ts', { ascending: false })
    .limit(1);

  if (error) {
    res.status(503).json({ status: 'db_error', detail: error.message });
    return;
  }

  if (!data || data.length === 0) {
    res.status(503).json({ status: 'stale', lastRowSince: '>1h ago' });
    return;
  }

  const agoMs = Date.now() - data[0].ts;
  res.status(200).json({ status: 'ok', lastRowAgoMs: agoMs });
}
