-- Nightly rotation: pack raw readings older than 7 days into readings_archive
-- and delete them from `readings`, so the raw table stays at about a week of
-- rows. Deleted space is reused by autovacuum, so the table stops growing.
--
-- 10:15 UTC is 3:15 AM Pacific in summer (2:15 AM in winter), when the track
-- is quiet. Each run packs about one day, which takes a few seconds.
--
-- Version-controlled copy; applied to Supabase via MCP apply_migration.

create extension if not exists pg_cron;

select cron.schedule(
  'archive-readings-nightly',
  '15 10 * * *',
  $$select public.archive_readings((extract(epoch from now() - interval '7 days') * 1000)::bigint, true)$$
);
