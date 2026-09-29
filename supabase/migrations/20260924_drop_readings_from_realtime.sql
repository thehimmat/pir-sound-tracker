-- Stop streaming `readings` inserts through Supabase Realtime.
--
-- The Live view now receives readings over the poller's own WebSocket
-- (apps/poller/src/wsServer.ts, served at /ws on the Fly app), so nothing
-- subscribes to postgres_changes on this table any more. Leaving it in the
-- publication would keep Realtime's WAL polling running (the second-largest
-- DB load after the inserts) and keep counting a billable message per insert
-- per connected client.
--
-- Apply this AFTER the web app that uses the WebSocket is deployed, otherwise
-- older browser sessions still subscribed to Realtime stop receiving updates.
--
-- Version-controlled copy; applied to Supabase via MCP apply_migration.

do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'readings'
  ) then
    alter publication supabase_realtime drop table public.readings;
  end if;
end
$$;
