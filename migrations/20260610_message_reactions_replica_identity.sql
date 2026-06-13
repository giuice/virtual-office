-- 20260610_message_reactions_replica_identity.sql
-- Audit B-03: reaction REMOVAL never syncs to other clients.
--
-- With the default REPLICA IDENTITY (primary key), Realtime DELETE events on
-- message_reactions deliver payload.old = { id } only. The client handler
-- (useMessageSubscription) needs old.message_id / user_id / emoji to remove
-- the reaction from the cache, so deletes silently no-op on every other client
-- until a refetch.
--
-- REPLICA IDENTITY FULL makes DELETE events carry the whole old row. Rows are
-- tiny (uuid, uuid, uuid, emoji text, timestamp), so the extra WAL cost is
-- negligible. Idempotent: re-running is a no-op.

ALTER TABLE public.message_reactions REPLICA IDENTITY FULL;

-- Verification (run after applying):
--   SELECT relreplident FROM pg_class WHERE relname = 'message_reactions';
--   -- expected: 'f' (full). Default before this migration: 'd'.
