-- Phase 2.4 (messaging audit 2026-06-10, M-06 + realtime-miss root cause).
--
-- Runtime evidence (2026-06-12, node probe with @supabase/supabase-js):
-- a service_role subscriber on postgres_changes for messages /
-- message_read_receipts / message_reactions / conversations reaches
-- SUBSCRIBED but receives ZERO events — the tables are not in the
-- supabase_realtime publication. Every postgres_changes subscription in the
-- app has been a silent no-op (the channel still reports SUBSCRIBED).
--
-- Also: message_read_receipts has RLS enabled but no member-visible SELECT
-- policy (probe: a member cannot read receipts written by the other member
-- of their own conversation). Realtime applies SELECT policies per
-- subscriber (WALRUS), so without this policy receipt INSERTs would never
-- be delivered to the sender and the ✓✓ indicator could not flip live.
--
-- Re-runnable: publication adds are guarded; the policy is drop-and-create.

-- ============================================================================
-- 1) supabase_realtime publication — messaging tables
-- ============================================================================
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach t in array array[
    'messages',
    'message_read_receipts',
    'message_reactions',
    'conversations'
  ] loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table only public.%I', t);
    end if;
  end loop;
end $$;

-- ============================================================================
-- 2) message_read_receipts — member-visible SELECT policy
--    Any conversation member may read all receipts of that conversation
--    (the sender needs other members' receipts for the ✓✓ indicator).
-- ============================================================================
drop policy if exists "read_receipts_in_own_conversations" on public.message_read_receipts;
create policy "read_receipts_in_own_conversations" on public.message_read_receipts
  for select using (
    private.is_conversation_member(message_read_receipts.conversation_id)
  );
