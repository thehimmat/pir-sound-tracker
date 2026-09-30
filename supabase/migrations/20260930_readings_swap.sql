-- One-time swap of `readings` for a slim table holding only un-archived rows.
--
-- Deleting archived rows from the old table would not return disk space
-- (Postgres keeps the pages), and VACUUM FULL would lock writes for minutes.
-- Instead:
--   1. readings_swap_prepare(split) builds readings_new with the rows in
--      [archived_before, split) while the poller keeps writing to readings.
--   2. readings_swap_cutover(split) locks readings against writes, copies the
--      rows written since split, swaps the table names and recreates the
--      index, row-level security, policy, grants and daily-summary trigger.
--      The lock is held only for that small delta and the renames.
--   3. Once inserts are confirmed landing, `drop table readings_old;` frees
--      the space (see 20260930_readings_drop_old.sql).
--
-- The new table drops the unused `id` column. Nothing reads it, and PostgREST
-- inserts only send ts, raw_db and status.
--
-- Pass a split a few minutes in the past so late fire-and-forget inserts
-- from before the split are already in readings when prepare copies them.
--
-- Version-controlled copy; applied to Supabase via MCP apply_migration.

create or replace function public.readings_swap_prepare(p_split bigint)
returns bigint
language plpgsql
set search_path to 'public'
as $$
declare
  v_from bigint;
  v_rows bigint;
begin
  select archived_before into v_from from readings_archive_state where id;

  drop table if exists public.readings_new;
  create table public.readings_new (
    ts     bigint not null,
    raw_db real,
    status text   not null
  );

  insert into public.readings_new (ts, raw_db, status)
  select ts, raw_db, status
    from public.readings
   where ts >= v_from and ts < p_split
   order by ts;
  get diagnostics v_rows = row_count;

  create index readings_new_ts_idx on public.readings_new (ts);
  return v_rows;
end;
$$;

create or replace function public.readings_swap_cutover(p_split bigint)
returns bigint
language plpgsql
set search_path to 'public'
as $$
declare
  v_rows bigint;
begin
  if to_regclass('public.readings_new') is null then
    raise exception 'readings_new does not exist; run readings_swap_prepare() first';
  end if;

  -- Blocks inserts (they wait, then resolve `readings` to the new table once
  -- this transaction commits); reads carry on.
  lock table public.readings in exclusive mode;

  insert into public.readings_new (ts, raw_db, status)
  select ts, raw_db, status from public.readings where ts >= p_split;
  get diagnostics v_rows = row_count;

  alter table public.readings     rename to readings_old;
  alter index public.idx_readings_ts rename to idx_readings_old_ts;
  alter table public.readings_new rename to readings;
  alter index public.readings_new_ts_idx rename to idx_readings_ts;

  alter table public.readings enable row level security;
  create policy "public read" on public.readings for select to public using (true);
  grant all on public.readings to anon, authenticated, service_role;

  -- Created last, so the rows copied above do not count twice in daily_summaries.
  create trigger readings_daily_summary_trg
    after insert on public.readings
    for each row execute function public.update_daily_summary();

  return v_rows;
end;
$$;

revoke all on function public.readings_swap_prepare(bigint) from public, anon, authenticated;
revoke all on function public.readings_swap_cutover(bigint) from public, anon, authenticated;
