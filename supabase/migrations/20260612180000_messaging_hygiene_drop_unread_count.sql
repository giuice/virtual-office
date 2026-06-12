-- Phase 3.5 (messaging audit 2026-06-10) — DB hygiene.
--
-- 1) conversations.unread_count (JSONB per-participant counter map) has had
--    no writers since Phase 2.2: unread counts are server-computed per viewer
--    via the get_unread_counts(uuid[]) RPC on conversation_members.last_read_at.
--    The column is dead weight and was also a privacy leak (every participant
--    received everyone's counts, M-10). Drop it.
--
-- 2) L-09 — the 20251009 phase-3 features migration added message_pins /
--    message_stars to the supabase_realtime publication; the tables were
--    renamed to pinned_messages / starred_messages in the 20251120 refactor
--    (publication membership follows the rename). No client subscribes to
--    pin/star changes today, so publishing them is pure WAL overhead —
--    remove whatever variant is present.
--
-- Re-runnable: column drop is IF EXISTS; publication drops are guarded.

-- ============================================================================
-- 1) Drop dead unread_count JSONB column
-- ============================================================================
alter table public.conversations drop column if exists unread_count;

-- ============================================================================
-- 2) Remove stale pin/star tables from the realtime publication
-- ============================================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'message_pins',
    'message_stars',
    'pinned_messages',
    'starred_messages'
  ] loop
    if exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime drop table only public.%I', t);
    end if;
  end loop;
end $$;
