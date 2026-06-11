-- Phase 2.3 (messaging audit 2026-06-10, S-05): RLS membership source moves
-- from conversations.participants[] to conversation_members.
--
-- conversation_members is kept in sync with participants[] by the
-- trigger_sync_conversation_members trigger (20260610210000), so this is a
-- semantic no-op today; it makes conversation_members the single membership
-- authority so participants[] can be dropped in Phase 3.
--
-- Exception kept on participants[]: the conversations INSERT policy. Member
-- rows are created by an AFTER INSERT trigger, so at WITH CHECK time the
-- membership rows do not exist yet — the check must read NEW.participants.
--
-- Also tightens X-02 while touching messages RLS: update_own_messages gains a
-- WITH CHECK so a sender cannot rewrite a message into a conversation they are
-- not a member of (full old-vs-new column comparison is not expressible in RLS).
--
-- Re-runnable: every policy is dropped and recreated; the helper is
-- CREATE OR REPLACE.

-- ============================================================================
-- 1) Membership helper. SECURITY DEFINER so it reads conversation_members
--    regardless of that table's own RLS (and stays usable inside realtime WAL
--    RLS evaluation). private schema is not exposed via PostgREST.
-- ============================================================================
create or replace function private.is_conversation_member(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.user_id = private.current_app_user_id()
  )
$$;

comment on function private.is_conversation_member is
  'True when the current authenticated app user is a member of the conversation (conversation_members).';

revoke all on function private.is_conversation_member(uuid) from public;
grant execute on function private.is_conversation_member(uuid) to authenticated, service_role;

-- ============================================================================
-- 2) conversations
-- ============================================================================
drop policy if exists "read_own_conversations" on public.conversations;
create policy "read_own_conversations" on public.conversations
  for select using (
    private.is_conversation_member(conversations.id)
  );

drop policy if exists "update_own_conversations" on public.conversations;
create policy "update_own_conversations" on public.conversations
  for update using (
    private.is_conversation_member(conversations.id)
  );

-- Stays on NEW.participants (see header): membership rows are created AFTER
-- insert by trigger_sync_conversation_members.
drop policy if exists "create_conversations_as_participant" on public.conversations;
create policy "create_conversations_as_participant" on public.conversations
  for insert with check (
    (select private.current_app_user_id()) = any (conversations.participants)
  );

-- ============================================================================
-- 3) messages
-- ============================================================================
drop policy if exists "read_messages_in_own_conversations" on public.messages;
create policy "read_messages_in_own_conversations" on public.messages
  for select using (
    private.is_conversation_member(messages.conversation_id)
  );

drop policy if exists "send_message_as_self" on public.messages;
create policy "send_message_as_self" on public.messages
  for insert with check (
    messages.sender_id = (select private.current_app_user_id())
    and private.is_conversation_member(messages.conversation_id)
  );

-- X-02: same USING as before, plus WITH CHECK pinning sender_id to self and
-- the target conversation to one the sender is a member of.
drop policy if exists "update_own_messages" on public.messages;
create policy "update_own_messages" on public.messages
  for update using (
    messages.sender_id = (select private.current_app_user_id())
  ) with check (
    messages.sender_id = (select private.current_app_user_id())
    and private.is_conversation_member(messages.conversation_id)
  );

-- ============================================================================
-- 4) message_attachments
-- ============================================================================
drop policy if exists "read_attachments_in_own_conversations" on public.message_attachments;
create policy "read_attachments_in_own_conversations" on public.message_attachments
  for select using (
    exists (
      select 1
      from public.messages m
      where m.id = message_attachments.message_id
        and private.is_conversation_member(m.conversation_id)
    )
  );

-- ============================================================================
-- 5) message_reactions
-- ============================================================================
drop policy if exists "read_reactions_in_own_conversations" on public.message_reactions;
create policy "read_reactions_in_own_conversations" on public.message_reactions
  for select using (
    exists (
      select 1
      from public.messages m
      where m.id = message_reactions.message_id
        and private.is_conversation_member(m.conversation_id)
    )
  );

drop policy if exists "add_own_reactions" on public.message_reactions;
create policy "add_own_reactions" on public.message_reactions
  for insert with check (
    message_reactions.user_id = (select private.current_app_user_id())
    and exists (
      select 1
      from public.messages m
      where m.id = message_reactions.message_id
        and private.is_conversation_member(m.conversation_id)
    )
  );

-- ============================================================================
-- 6) pinned_messages (shared pins — any member can view/pin/unpin)
-- ============================================================================
drop policy if exists "Participants can view pinned messages" on public.pinned_messages;
create policy "Participants can view pinned messages" on public.pinned_messages
  for select using (
    private.is_conversation_member(pinned_messages.conversation_id)
  );

drop policy if exists "Participants can pin messages" on public.pinned_messages;
create policy "Participants can pin messages" on public.pinned_messages
  for insert with check (
    pinned_messages.pinned_by = (select private.current_app_user_id())
    and private.is_conversation_member(pinned_messages.conversation_id)
  );

drop policy if exists "Participants can unpin messages" on public.pinned_messages;
create policy "Participants can unpin messages" on public.pinned_messages
  for delete using (
    private.is_conversation_member(pinned_messages.conversation_id)
  );

-- ============================================================================
-- 7) starred_messages (private stars — only the INSERT policy checked
--    participants[]; owner-scoped SELECT/DELETE policies are untouched)
-- ============================================================================
drop policy if exists "Users can star messages" on public.starred_messages;
create policy "Users can star messages" on public.starred_messages
  for insert with check (
    starred_messages.user_id = (select private.current_app_user_id())
    and private.is_conversation_member(starred_messages.conversation_id)
  );
