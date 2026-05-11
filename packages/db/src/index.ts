import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Reading, DailySummary, DayBlock, ReadingStatus } from '@pir/types';

export type { Reading, DailySummary, DayBlock, ReadingStatus };

let _client: SupabaseClient | null = null;

export function getClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY env vars are required');
  _client = createClient(url, key);
  return _client;
}

export async function insertReading(
  ts: number,
  raw_db: number | null,
  status: ReadingStatus,
): Promise<void> {
  const { error } = await getClient()
    .from('readings')
    .insert({ ts, raw_db, status });
  if (error) throw error;
}

export async function getReadingsSince(fromTs: number): Promise<Reading[]> {
  // Fetch newest-first so the 2000-row cap keeps the most recent data, then reverse.
  const { data, error } = await getClient()
    .from('readings')
    .select('*')
    .gte('ts', fromTs)
    .order('ts', { ascending: false })
    .limit(2000);
  if (error) throw error;
  return ((data ?? []) as Reading[]).reverse();
}

export async function getReadingsForDay(dateStr: string): Promise<Reading[]> {
  const start = new Date(dateStr + 'T00:00:00').getTime();
  const end   = start + 86_400_000;
  const { data, error } = await getClient()
    .from('readings')
    .select('*')
    .gte('ts', start)
    .lt('ts', end)
    .order('ts', { ascending: true })
    .limit(20000);
  if (error) throw error;
  return (data ?? []) as Reading[];
}

export async function getDayBlocks(dateStr: string): Promise<DayBlock[]> {
  const start = new Date(dateStr + 'T00:00:00').getTime();
  const end   = start + 86_400_000;
  const { data, error } = await getClient()
    .rpc('get_day_blocks', { start_ts: start, end_ts: end });
  if (error) throw error;
  return (data ?? []) as DayBlock[];
}

export async function getReadingsWindow(fromTs: number, toTs: number): Promise<Reading[]> {
  const { data, error } = await getClient()
    .from('readings')
    .select('*')
    .gte('ts', fromTs)
    .lt('ts', toTs)
    .order('ts', { ascending: true })
    .limit(700);
  if (error) throw error;
  return (data ?? []) as Reading[];
}

export async function getDailySummary(dateStr: string): Promise<DailySummary> {
  const { data, error } = await getClient()
    .rpc('get_daily_summary', { date_str: dateStr });
  if (error) throw error;
  const row = (data as Array<{ high_db: number | null; violation_count: number; reading_count: number }>)[0]
    ?? { high_db: null, violation_count: 0, reading_count: 0 };
  return { date: dateStr, ...row };
}

export async function getAllDailySummaries(): Promise<DailySummary[]> {
  const { data, error } = await getClient().rpc('get_all_daily_summaries');
  if (error) throw error;
  return (data ?? []) as DailySummary[];
}
