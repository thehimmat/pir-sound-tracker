import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { getActiveLimit, RESTRICTED_LIMIT_DB } from '@pir/types';

const SITE_URL = 'https://pir-sound-tracker.vercel.app';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface ViolationEvent {
  ts: number;
  raw_db: number;
  limitDb: number;
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const url  = process.env.SUPABASE_URL!;
  const key  = process.env.SUPABASE_ANON_KEY!;
  const db   = createClient(url, key);
  const since = Date.now() - THIRTY_DAYS_MS;

  // Fetch only readings loud enough to possibly violate (the lowest active
  // limit is 90 dBA). Without this filter the 50k row cap covered barely a
  // day of the 30-day window (~40k readings/day), so recent violations
  // never appeared in the feed.
  const { data, error } = await db
    .from('readings')
    .select('ts, raw_db')
    .eq('status', 'ok')
    .gte('ts', since)
    .gte('raw_db', RESTRICTED_LIMIT_DB)
    .order('ts', { ascending: true })
    .limit(50000);

  if (error) {
    res.status(500).send(`Error: ${error.message}`);
    return;
  }

  // Group violating readings into events: a new event starts when more than
  // EVENT_GAP_MS has passed since the previous violating reading. (Below-limit
  // readings aren't fetched, so grouping is by time gap rather than by
  // watching the value cross the limit.)
  const EVENT_GAP_MS = 5 * 60_000;
  const rows = (data ?? []) as { ts: number; raw_db: number }[];
  const events: ViolationEvent[] = [];
  let lastViolationTs: number | null = null;

  for (const row of rows) {
    const limitDb = getActiveLimit(row.ts);
    if (row.raw_db < limitDb) continue; // loud but not over the active limit
    if (lastViolationTs === null || row.ts - lastViolationTs > EVENT_GAP_MS) {
      events.push({ ts: row.ts, raw_db: row.raw_db, limitDb });
    }
    lastViolationTs = row.ts;
  }

  // Newest first, cap at 50 items
  const items = events.reverse().slice(0, 50);

  const itemsXml = items.map(e => {
    const date    = new Date(e.ts).toUTCString();
    const title   = escapeXml(`Violation: ${e.raw_db} dB (limit ${e.limitDb} dB)`);
    const desc    = escapeXml(
      `Noise level at PIR reached ${e.raw_db} dB, exceeding the ${e.limitDb} dB operational limit. ` +
      `You can file a noise complaint at https://www.portland.gov/oni/noise-complaints`
    );
    const guid    = escapeXml(`${SITE_URL}/violation/${e.ts}`);
    return `    <item>
      <title>${title}</title>
      <description>${desc}</description>
      <link>${escapeXml(SITE_URL)}</link>
      <guid isPermaLink="false">${guid}</guid>
      <pubDate>${date}</pubDate>
    </item>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>PIR Noise Violations</title>
    <link>${escapeXml(SITE_URL)}</link>
    <description>Alerts when Portland International Raceway exceeds its operational noise limit.</description>
    <language>en-us</language>
    <atom:link href="${escapeXml(SITE_URL + '/api/feed.xml')}" rel="self" type="application/rss+xml"/>
    <ttl>5</ttl>
${itemsXml}
  </channel>
</rss>`;

  res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.status(200).send(xml);
}
