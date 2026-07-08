-- Time-aware violation counts.
-- Mirrors getActiveLimit() in packages/types/src/index.ts: variance event
-- dates use that event's limit; Mondays and any time outside 9:00 AM-10:00 PM
-- Pacific are 90 dBA; otherwise 103 dBA.
--
-- Applied to Supabase via MCP apply_migration; this file is the
-- version-controlled copy.

-- 1. Variance events. Keep in sync with VARIANCE_EVENTS in
--    packages/types/src/index.ts and apps/web/src/utils/varianceEvents.ts.
create table if not exists public.variance_events (
  event_date date primary key,
  limit_db   numeric not null,
  name       text not null
);

alter table public.variance_events enable row level security;

-- Public read (the same data is shown on the About page); no write policies,
-- so anon/authenticated writes stay blocked.
create policy "variance_events_read_all"
  on public.variance_events for select
  to anon, authenticated
  using (true);

insert into public.variance_events (event_date, limit_db, name) values
  ('2026-07-10', 112, 'Rose Cup Races'),
  ('2026-07-11', 112, 'Rose Cup Races'),
  ('2026-07-12', 112, 'Rose Cup Races'),
  ('2026-08-13', 115, 'NTT IndyCar Series'),
  ('2026-08-14', 115, 'NTT IndyCar Series'),
  ('2026-08-15', 115, 'NTT IndyCar Series'),
  ('2026-08-16', 115, 'NTT IndyCar Series'),
  ('2026-09-04', 110, 'Sovren / ABFM'),
  ('2026-09-05', 110, 'Sovren / ABFM'),
  ('2026-09-06', 110, 'Sovren / ABFM')
on conflict (event_date) do update
  set limit_db = excluded.limit_db,
      name     = excluded.name;

-- 2. Limit in effect at a Unix-ms timestamp (track-local rules).
--    extract(dow): 0 = Sunday, 1 = Monday.
create or replace function public.active_limit_db(ts_ms bigint)
returns numeric
language sql
stable
set search_path to 'public'
as $$
  select coalesce(
    (select ve.limit_db
       from variance_events ve
      where ve.event_date =
        (to_timestamp(ts_ms / 1000.0) at time zone 'America/Los_Angeles')::date),
    case
      when extract(dow  from to_timestamp(ts_ms / 1000.0) at time zone 'America/Los_Angeles') = 1 then 90
      when extract(hour from to_timestamp(ts_ms / 1000.0) at time zone 'America/Los_Angeles') not between 9 and 21 then 90
      else 103
    end
  );
$$;

-- 3. Incremental trigger: count a violation against the limit in effect at
--    the reading's own timestamp instead of a flat 103.
create or replace function public.update_daily_summary()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_date text;
begin
  v_date := to_char(
    to_timestamp(new.ts / 1000.0) at time zone 'America/Los_Angeles',
    'YYYY-MM-DD'
  );

  insert into daily_summaries
    (date_pt, high_db, violation_count, reading_count, error_count, updated_at)
  values (
    v_date,
    case when new.status = 'ok' then new.raw_db else null end,
    case when new.status = 'ok' and new.raw_db >= active_limit_db(new.ts) then 1 else 0 end,
    case when new.status = 'ok' then 1 else 0 end,
    case when new.status <> 'ok' then 1 else 0 end,
    now()
  )
  on conflict (date_pt) do update set
    high_db = case
      when new.status = 'ok' and (
        daily_summaries.high_db is null or new.raw_db > daily_summaries.high_db
      ) then new.raw_db
      else daily_summaries.high_db
    end,
    violation_count = daily_summaries.violation_count +
      case when new.status = 'ok' and new.raw_db >= active_limit_db(new.ts) then 1 else 0 end,
    reading_count   = daily_summaries.reading_count +
      case when new.status = 'ok' then 1 else 0 end,
    error_count     = daily_summaries.error_count +
      case when new.status <> 'ok' then 1 else 0 end,
    updated_at = now();

  return new;
end;
$$;

-- 4. Live per-day summary (used for today's row): same rule.
create or replace function public.get_daily_summary(date_str text)
returns table(high_db double precision, violation_count bigint, reading_count bigint, error_count bigint)
language sql
stable
set search_path to 'public'
as $$
  select
    max(raw_db) filter (where status = 'ok')                                     as high_db,
    count(*)    filter (where status = 'ok' and raw_db >= active_limit_db(ts))  as violation_count,
    count(*)    filter (where status = 'ok')                                    as reading_count,
    count(*)    filter (where status <> 'ok')                                   as error_count
  from readings
  where to_char(to_timestamp(ts / 1000.0) at time zone 'America/Los_Angeles', 'YYYY-MM-DD') = date_str
$$;

-- 5. Backfill: recompute historical violation counts under the new rule.
--    (get_all_daily_summaries reads this table and needs no change.)
update daily_summaries ds
set violation_count = sub.new_count,
    updated_at      = now()
from (
  select
    to_char(to_timestamp(ts / 1000.0) at time zone 'America/Los_Angeles', 'YYYY-MM-DD') as date_pt,
    count(*) filter (where status = 'ok' and raw_db >= active_limit_db(ts))              as new_count
  from readings
  group by 1
) sub
where ds.date_pt = sub.date_pt
  and ds.violation_count <> sub.new_count;
