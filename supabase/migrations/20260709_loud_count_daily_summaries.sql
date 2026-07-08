-- Add the "loud" classification (within the warning buffer of the active
-- limit) to daily summaries, alongside the existing over-limit count.
-- Mirrors classifyReading()/getWarningBuffer() in packages/types/src/index.ts:
-- buffer is 3 dB, or 5 dB during quiet hours (10:00 PM-8:00 AM Pacific).
--
-- Applied to Supabase via MCP apply_migration; this file is the
-- version-controlled copy.

alter table public.daily_summaries
  add column if not exists loud_count bigint not null default 0;

-- Warning buffer in dB at a Unix-ms timestamp.
create or replace function public.warning_buffer_db(ts_ms bigint)
returns numeric
language sql
stable
set search_path to 'public'
as $$
  select case
    when extract(hour from to_timestamp(ts_ms / 1000.0) at time zone 'America/Los_Angeles') >= 22
      or extract(hour from to_timestamp(ts_ms / 1000.0) at time zone 'America/Los_Angeles') < 8
    then 5
    else 3
  end;
$$;

-- Trigger: also count loud readings (below the limit but within the buffer).
create or replace function public.update_daily_summary()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_date  text;
  v_limit numeric;
begin
  v_date := to_char(
    to_timestamp(new.ts / 1000.0) at time zone 'America/Los_Angeles',
    'YYYY-MM-DD'
  );
  v_limit := active_limit_db(new.ts);

  insert into daily_summaries
    (date_pt, high_db, violation_count, loud_count, reading_count, error_count, updated_at)
  values (
    v_date,
    case when new.status = 'ok' then new.raw_db else null end,
    case when new.status = 'ok' and new.raw_db >= v_limit then 1 else 0 end,
    case when new.status = 'ok' and new.raw_db < v_limit
          and new.raw_db >= v_limit - warning_buffer_db(new.ts) then 1 else 0 end,
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
      case when new.status = 'ok' and new.raw_db >= v_limit then 1 else 0 end,
    loud_count = daily_summaries.loud_count +
      case when new.status = 'ok' and new.raw_db < v_limit
            and new.raw_db >= v_limit - warning_buffer_db(new.ts) then 1 else 0 end,
    reading_count   = daily_summaries.reading_count +
      case when new.status = 'ok' then 1 else 0 end,
    error_count     = daily_summaries.error_count +
      case when new.status <> 'ok' then 1 else 0 end,
    updated_at = now();

  return new;
end;
$$;

-- Return types change, so drop and recreate the two read functions.
drop function if exists public.get_daily_summary(text);
create function public.get_daily_summary(date_str text)
returns table(high_db double precision, violation_count bigint, loud_count bigint, reading_count bigint, error_count bigint)
language sql
stable
set search_path to 'public'
as $$
  select
    max(raw_db) filter (where status = 'ok')                                     as high_db,
    count(*)    filter (where status = 'ok' and raw_db >= active_limit_db(ts))  as violation_count,
    count(*)    filter (where status = 'ok' and raw_db < active_limit_db(ts)
                          and raw_db >= active_limit_db(ts) - warning_buffer_db(ts)) as loud_count,
    count(*)    filter (where status = 'ok')                                    as reading_count,
    count(*)    filter (where status <> 'ok')                                   as error_count
  from readings
  where to_char(to_timestamp(ts / 1000.0) at time zone 'America/Los_Angeles', 'YYYY-MM-DD') = date_str
$$;

drop function if exists public.get_all_daily_summaries();
create function public.get_all_daily_summaries()
returns table(date text, high_db double precision, violation_count bigint, loud_count bigint, reading_count bigint, error_count bigint)
language sql
stable
set search_path to 'public'
as $$
  select date_pt, high_db, violation_count, loud_count, reading_count, error_count
  from daily_summaries
  order by date_pt desc;
$$;

-- Backfill loud counts for all historical days (and re-derive violation
-- counts in the same scan so both columns come from identical logic).
update daily_summaries ds
set loud_count      = sub.loud,
    violation_count = sub.over,
    updated_at      = now()
from (
  select
    to_char(to_timestamp(ts / 1000.0) at time zone 'America/Los_Angeles', 'YYYY-MM-DD') as date_pt,
    count(*) filter (where status = 'ok' and raw_db >= active_limit_db(ts))              as over,
    count(*) filter (where status = 'ok' and raw_db < active_limit_db(ts)
                       and raw_db >= active_limit_db(ts) - warning_buffer_db(ts))        as loud
  from readings
  group by 1
) sub
where ds.date_pt = sub.date_pt;
