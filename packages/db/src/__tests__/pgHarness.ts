import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Shared PGlite harness: an in-process Postgres that starts from the
// production shape of `readings` (Sep 2026) and applies versioned migrations.

const MIGRATIONS_DIR = resolve(__dirname, '../../../../supabase/migrations');

// 2026-09-01 00:00:00 UTC, a whole minute.
export const T0 = 1_788_220_800_000;
export const MIN = 60_000;

export type Row = { ts: number; raw_db: number | null; status: string };
export type Db = {
  exec(sql: string): Promise<unknown>;
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
};

// Production objects that predate the versioned migrations. The real
// update_daily_summary() writes daily_summaries; this stub just counts calls
// so tests can catch a trigger that is missing or fires twice.
const BASE_SCHEMA = `
  create role anon; create role authenticated; create role service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;

  create table public.readings (
    id     bigserial primary key,
    ts     bigint not null,
    raw_db real,
    status text not null
  );
  create index idx_readings_ts on public.readings (ts);
  alter table public.readings enable row level security;
  create policy "public read" on public.readings for select to public using (true);

  create table public.summary_calls (n int not null);
  insert into public.summary_calls values (0);
  create function public.update_daily_summary() returns trigger language plpgsql as $$
    begin update public.summary_calls set n = n + 1; return new; end
  $$;
  create trigger readings_daily_summary_trg
    after insert on public.readings
    for each row execute function public.update_daily_summary();
`;

export async function freshDb(migrations: string[]): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite() as unknown as Db;
  await db.exec(BASE_SCHEMA);
  for (const file of migrations) {
    await db.exec(readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8'));
  }
  return db;
}

export async function insert(db: Db, rows: Row[]): Promise<void> {
  for (const r of rows) {
    await db.query('insert into readings (ts, raw_db, status) values ($1, $2, $3)', [r.ts, r.raw_db, r.status]);
  }
}

export async function between(db: Db, from: number, to: number | null, minDb: number | null = null): Promise<Row[]> {
  const { rows } = await db.query<{ ts: string; raw_db: number | null; status: string }>(
    'select ts, raw_db, status from readings_between($1, $2, $3)', [from, to, minDb]);
  return rows.map(r => ({ ts: Number(r.ts), raw_db: r.raw_db === null ? null : Number(r.raw_db), status: r.status }));
}

export async function archive(db: Db, cutoff: number, del = false): Promise<number> {
  const { rows } = await db.query<{ n: number }>('select archive_readings($1, $2) as n', [cutoff, del]);
  return rows[0].n;
}

export async function count(db: Db, sql: string): Promise<number> {
  const { rows } = await db.query<{ n: number }>(sql);
  return Number(rows[0].n);
}

/** Round raw_db to tenths so float4 noise doesn't break deep equality. */
export const approx = (rows: Row[]) =>
  rows.map(r => ({ ...r, raw_db: r.raw_db === null ? null : Math.round(r.raw_db * 10) / 10 }));
