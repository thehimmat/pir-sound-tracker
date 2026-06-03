import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Use service role key so we can read/write subscriptions regardless of RLS,
// but the table itself has no PII so this is safe.
function getServiceClient() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const { endpoint, p256dh, auth } = req.body ?? {};

  if (!endpoint || typeof endpoint !== 'string') {
    res.status(400).json({ error: 'endpoint required' });
    return;
  }

  const db = getServiceClient();

  if (req.method === 'POST') {
    if (!p256dh || !auth) {
      res.status(400).json({ error: 'p256dh and auth required' });
      return;
    }
    const { error } = await db
      .from('push_subscriptions')
      .upsert({ endpoint, p256dh, auth }, { onConflict: 'endpoint' });
    if (error) {
      console.error('[subscriptions] insert error:', error.message);
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(201).json({ ok: true });
    return;
  }

  if (req.method === 'DELETE') {
    const { error } = await db
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint);
    if (error) {
      console.error('[subscriptions] delete error:', error.message);
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
