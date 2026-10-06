-- Phase 4 T7 / BR-003, FR-003, AC-003, AC-035
-- (spec-interview/phase-4-messaging-timeline): reader identities and read
-- times on message_read_receipts are visible only to the message's sender
-- (and each reader sees their own receipts); clients can no longer insert
-- receipts directly.
--
-- SELECT: before this migration two permissive SELECT policies applied:
--   * "read_receipts_in_own_conversations" (20260612130141) let ANY
--     conversation member read EVERY receipt of the conversation, so a
--     non-sender member could list who read someone else's message and when.
--   * "Users can view their own read receipts" (baseline) already allowed
--     exactly the target set (own receipts OR receipts on messages I sent),
--     but evaluated auth.uid() and a users lookup per row.
--   Both are replaced by one equivalent-to-the-baseline policy for
--   authenticated, with the app user id resolved once per statement through
--   private.current_app_user_id() (users.supabase_uid = auth.uid()::text).
--
-- INSERT: "Users can insert their own read receipts" only bound user_id to the
--   caller, so a signed-in user could insert receipts for messages of
--   conversations they are not in, for their own messages, or with a forged
--   conversation_id. Nothing inserts receipts with a user-scoped client:
--   writers are the service_role-only RPCs mark_conversation_read and
--   mark_messages_read (SECURITY DEFINER) behind PATCH /api/conversations/read.
--   The policy is dropped; with RLS enabled and no INSERT policy, anon and
--   authenticated inserts are denied. UPDATE/DELETE already had no policy.
--
-- Backward compatible with the published app (BR-013):
--   * SupabaseMessageRepository.findByConversation (user-scoped client via
--     GET /api/messages/get) selects message_id for the loaded page to flip
--     the ✓✓ READ status, which message-item.tsx renders only on the
--     viewer's OWN messages: receipts on own messages stay visible.
--   * Realtime postgres_changes INSERT on message_read_receipts applies these
--     SELECT policies per subscriber: the sender still receives receipt events
--     for their own messages; other members stop receiving events for
--     messages they did not send (their UI shows no status on those).
--   * get_unread_counts / mark_* RPCs are SECURITY DEFINER: unaffected.
--
-- Transactional and re-runnable (drop if exists + create).
--
-- Rollback (restores the exact pre-T7 policies, including the leaks above):
--   begin;
--   drop policy if exists "message_read_receipts_select_reader_or_sender" on public.message_read_receipts;
--   drop policy if exists "read_receipts_in_own_conversations" on public.message_read_receipts;
--   create policy "read_receipts_in_own_conversations" on public.message_read_receipts
--     for select using (private.is_conversation_member(message_read_receipts.conversation_id));
--   drop policy if exists "Users can view their own read receipts" on public.message_read_receipts;
--   create policy "Users can view their own read receipts" on public.message_read_receipts
--     for select using (
--       ((auth.uid())::text = (select users.supabase_uid from public.users where users.id = message_read_receipts.user_id))
--       or ((auth.uid())::text = (select u.supabase_uid from public.messages m join public.users u on m.sender_id = u.id
--                                 where m.id = message_read_receipts.message_id)));
--   drop policy if exists "Users can insert their own read receipts" on public.message_read_receipts;
--   create policy "Users can insert their own read receipts" on public.message_read_receipts
--     for insert with check (
--       (auth.uid())::text = (select users.supabase_uid from public.users where users.id = message_read_receipts.user_id));
--   commit;

begin;

drop policy if exists "read_receipts_in_own_conversations" on public.message_read_receipts;
drop policy if exists "Users can view their own read receipts" on public.message_read_receipts;
drop policy if exists "Users can insert their own read receipts" on public.message_read_receipts;
drop policy if exists "message_read_receipts_select_reader_or_sender" on public.message_read_receipts;

create policy "message_read_receipts_select_reader_or_sender" on public.message_read_receipts
  for select
  to authenticated
  using (
    message_read_receipts.user_id = (select private.current_app_user_id())
    or exists (
      select 1
      from public.messages as m
      where m.id = message_read_receipts.message_id
        and m.sender_id = (select private.current_app_user_id())
    )
  );

commit;
