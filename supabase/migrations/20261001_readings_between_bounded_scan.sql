-- Bound the archive scan in readings_between() on both ends.
--
-- readings_between() is not inlined (its SET search_path prevents that), so
-- Postgres plans its body once without knowing the argument values. In that
-- generic plan the archive index was bounded only by the window's start; the
-- window's end and the archive cutoff came from the joined `bounds` row and
-- were applied as a join filter after unnesting. A 5-minute window on
-- 2026-06-15 therefore unpacked every minute from June 15 to the cutoff
-- (145k minutes, 4M slots, ~108 MB of temp files) and took 2-3 s, growing
-- with history.
--
-- Fix: compute the upper bound as a scalar (an InitPlan) so it becomes part of
-- the index condition, and split the min_db filter so the minute-level
-- max_tenths check runs on the archive scan, before a quiet minute is
-- unpacked. Output is unchanged.
--
-- Version-controlled copy; applied to Supabase via MCP apply_migration.

create or replace function public.readings_between(p_from bigint, p_to bigint default null, p_min_db real default null)
returns table (ts bigint, raw_db real, status text)
language sql
stable
set search_path to 'public'
as $$
  select x.ts, x.raw_db, x.status
    from (
      select a.minute_ts + (u.i - 1) * 1000 as ts,
             readings_slot_db(u.slot)       as raw_db,
             readings_slot_status(u.slot)   as status
        from readings_archive a
       cross join lateral unnest(a.slots) with ordinality as u(slot, i)
       where a.minute_ts >= p_from - 59999
         and a.minute_ts <  least(coalesce(p_to, 9223372036854775807),
                                  (select s.archived_before from readings_archive_state s where s.id))
         and (p_min_db is null or a.max_tenths >= p_min_db * 10)
         and u.slot is not null
         and (p_min_db is null or u.slot >= p_min_db * 10)
         and a.minute_ts + (u.i - 1) * 1000 >= p_from
         and a.minute_ts + (u.i - 1) * 1000 <  coalesce(p_to, 9223372036854775807)

      union all

      select r.ts, r.raw_db, r.status
        from readings r
       where r.ts >= greatest(p_from, (select s.archived_before from readings_archive_state s where s.id))
         and r.ts <  coalesce(p_to, 9223372036854775807)
         and (p_min_db is null or (r.status = 'ok' and r.raw_db >= p_min_db))
    ) x
   order by x.ts;
$$;
