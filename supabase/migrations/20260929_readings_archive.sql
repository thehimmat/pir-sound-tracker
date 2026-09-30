-- Packed per-second archive of `readings`.
--
-- Every second of history is kept, but readings older than the rolling raw
-- window move into one row per minute holding 60 per-second slots. That is
-- ~200 bytes per minute (~105 MB/year at a full 1 Hz) instead of ~94 bytes
-- per reading (~3 GB/year at 1 Hz).
--
-- readings_between() returns per-second rows in the same shape as the raw
-- table from both sources, so the API and charts do not care where a second
-- is stored.
--
-- Rollout:
--   1. This migration is additive. archived_before starts at 0, so
--      readings_between() serves everything from the raw table and behaviour
--      is unchanged.
--   2. archive_readings(cutoff) packs [archived_before, cutoff) and advances
--      archived_before. Backfill calls it without delete, so raw rows stay as
--      a backup; readings_between() ignores raw rows before the cutoff.
--   3. A later step deletes archived raw rows and reclaims the space.
--   Rollback at any point before deletion:
--      update readings_archive_state set archived_before = 0;
--
-- Version-controlled copy; applied to Supabase via MCP apply_migration.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.readings_archive (
  minute_ts  bigint primary key,   -- Unix ms at the start of a UTC minute
  slots      smallint[] not null,  -- 60 slots, index 1 = second 0; see readings_slot_encode()
  max_tenths smallint,             -- loudest ok reading in the minute (tenths of a dB), null if none
  constraint readings_archive_minute_aligned check (minute_ts % 60000 = 0),
  constraint readings_archive_60_slots       check (array_length(slots, 1) = 60)
);

alter table public.readings_archive enable row level security;
drop policy if exists "readings_archive_read_all" on public.readings_archive;
create policy "readings_archive_read_all"
  on public.readings_archive for select
  to anon, authenticated
  using (true);

-- Single-row table: raw rows before archived_before are served from the archive.
create table if not exists public.readings_archive_state (
  id              boolean primary key default true check (id),
  archived_before bigint  not null default 0
);
insert into public.readings_archive_state (id) values (true) on conflict (id) do nothing;

alter table public.readings_archive_state enable row level security;
drop policy if exists "readings_archive_state_read_all" on public.readings_archive_state;
create policy "readings_archive_state_read_all"
  on public.readings_archive_state for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Slot encoding
--   null      no poll that second
--   >= 0      ok reading, tenths of a dB (71.2 dB -> 712)
--   -1 error, -2 blank, -3 stale, -4 ocr_fail
-- Ordering matters: max() over a second's rows prefers ok over any failure,
-- and the loudest ok reading among several.
-- ---------------------------------------------------------------------------

create or replace function public.readings_slot_encode(p_raw_db real, p_status text)
returns smallint
language sql
immutable parallel safe
set search_path to 'public'
as $$
  select (case p_status
    when 'ok'       then round(p_raw_db::numeric * 10)
    when 'error'    then -1
    when 'blank'    then -2
    when 'stale'    then -3
    when 'ocr_fail' then -4
  end)::smallint;
$$;

create or replace function public.readings_slot_status(p_slot smallint)
returns text
language sql
immutable parallel safe
set search_path to 'public'
as $$
  select case
    when p_slot >= 0  then 'ok'
    when p_slot = -1  then 'error'
    when p_slot = -2  then 'blank'
    when p_slot = -3  then 'stale'
    when p_slot = -4  then 'ocr_fail'
  end;
$$;

create or replace function public.readings_slot_db(p_slot smallint)
returns real
language sql
immutable parallel safe
set search_path to 'public'
as $$
  select case when p_slot >= 0 then (p_slot / 10.0)::real end;
$$;

-- ---------------------------------------------------------------------------
-- archive_readings(cutoff, delete)
-- Packs raw readings in [archived_before, cutoff rounded down to a minute)
-- into readings_archive and advances archived_before. Returns the number of
-- minutes written. Never moves the cutoff backwards.
-- ---------------------------------------------------------------------------

create or replace function public.archive_readings(p_cutoff_ts bigint, p_delete boolean default false)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_from  bigint;
  v_to    bigint := p_cutoff_ts - (p_cutoff_ts % 60000);
  v_count integer;
begin
  select archived_before into v_from
    from readings_archive_state
   where id
     for update;

  if v_to <= v_from then
    return 0;
  end if;

  with best as (
    select r.ts - r.ts % 60000                    as minute_ts,
           ((r.ts % 60000) / 1000)::int           as sec,
           max(readings_slot_encode(r.raw_db, r.status)) as slot
      from readings r
     where r.ts >= v_from and r.ts < v_to
     group by 1, 2
  ),
  packed as (
    select m.minute_ts,
           array_agg(b.slot order by g.sec) as slots,
           max(b.slot) filter (where b.slot >= 0) as max_tenths
      from (select distinct minute_ts from best) m
     cross join generate_series(0, 59) as g(sec)
      left join best b on b.minute_ts = m.minute_ts and b.sec = g.sec
     group by m.minute_ts
  )
  insert into readings_archive (minute_ts, slots, max_tenths)
  select minute_ts, slots, max_tenths from packed;

  get diagnostics v_count = row_count;

  if p_delete then
    delete from readings where ts >= v_from and ts < v_to;
  end if;

  update readings_archive_state set archived_before = v_to where id;
  return v_count;
end;
$$;

-- Writes and deletes: never callable through the public API.
revoke all on function public.archive_readings(bigint, boolean) from public, anon, authenticated;
grant execute on function public.archive_readings(bigint, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- readings_between(from, to, min_db)
-- Per-second readings in [from, to) from the archive and the raw table.
-- to = null means open-ended. min_db, when set, returns only ok readings at
-- or above it (used by the violation feed).
-- Archived rows have second-aligned timestamps; raw rows keep milliseconds.
-- ---------------------------------------------------------------------------

create or replace function public.readings_between(p_from bigint, p_to bigint default null, p_min_db real default null)
returns table (ts bigint, raw_db real, status text)
language sql
stable
set search_path to 'public'
as $$
  with bounds as (
    select s.archived_before,
           coalesce(p_to, 9223372036854775807) as upper_ts
      from readings_archive_state s
     where s.id
  )
  select x.ts, x.raw_db, x.status
    from (
      select a.minute_ts + (u.i - 1) * 1000 as ts,
             readings_slot_db(u.slot)       as raw_db,
             readings_slot_status(u.slot)   as status
        from bounds b
        join readings_archive a
          on a.minute_ts >= p_from - 59999
         and a.minute_ts <  least(b.upper_ts, b.archived_before)
       cross join lateral unnest(a.slots) with ordinality as u(slot, i)
       where u.slot is not null
         and a.minute_ts + (u.i - 1) * 1000 >= p_from
         and a.minute_ts + (u.i - 1) * 1000 <  b.upper_ts
         and (p_min_db is null or (a.max_tenths >= p_min_db * 10 and u.slot >= p_min_db * 10))

      union all

      select r.ts, r.raw_db, r.status
        from bounds b
        join readings r
          on r.ts >= greatest(p_from, b.archived_before)
         and r.ts <  b.upper_ts
       where p_min_db is null or (r.status = 'ok' and r.raw_db >= p_min_db)
    ) x
   order by x.ts;
$$;

-- ---------------------------------------------------------------------------
-- get_day_blocks: same output as before, now over readings_between() so
-- archived days still chart. Ties for the dominant status break by name so
-- the result is deterministic.
-- ---------------------------------------------------------------------------

create or replace function public.get_day_blocks(start_ts bigint, end_ts bigint)
returns table (bucket_start bigint, high_db numeric, reading_count bigint, dominant_status text)
language sql
stable
set search_path to 'public'
as $$
  with rows_in_range as (
    select ts, raw_db, status from readings_between(start_ts, end_ts)
  ),
  all_buckets as (
    select (floor(ts / 600000.0) * 600000)::bigint                            as bucket_start,
           max(case when status = 'ok' and raw_db is not null then raw_db end) as high_db,
           count(*)                                                            as reading_count
      from rows_in_range
     group by 1
  ),
  error_counts as (
    select (floor(ts / 600000.0) * 600000)::bigint as bucket_start,
           status,
           count(*)                                as cnt
      from rows_in_range
     where status <> 'ok'
     group by 1, 2
  ),
  ranked as (
    select bucket_start, status,
           row_number() over (partition by bucket_start order by cnt desc, status) as rn
      from error_counts
  )
  select b.bucket_start,
         b.high_db::numeric,
         b.reading_count,
         r.status::text as dominant_status
    from all_buckets b
    left join ranked r on r.bucket_start = b.bucket_start and r.rn = 1
   order by b.bucket_start;
$$;
