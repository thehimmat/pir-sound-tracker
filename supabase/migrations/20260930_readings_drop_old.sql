-- Final step of the readings swap (see 20260930_readings_swap.sql): drop the
-- old table once inserts are confirmed landing in the new one. Every row it
-- holds is either in readings_archive (verified per second, per status and by
-- value checksum on 2026-09-30) or was copied into the new readings table.
--
-- Version-controlled copy; applied to Supabase via MCP apply_migration.

drop table if exists public.readings_old;
drop function if exists public.readings_swap_prepare(bigint);
drop function if exists public.readings_swap_cutover(bigint);
