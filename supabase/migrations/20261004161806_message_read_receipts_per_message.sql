-- Phase 4 T5 (spec-interview/phase-4-messaging-timeline): per-message read
-- receipts and an unread counter that follows them.
--
-- BR-001/FR-004: "read" means the message was visibly rendered for the
-- recipient, so the client reports the visible message ids and the server
-- records receipts for exactly those (never for the caller's own messages,
-- BR-002). BR-005/FR-006: the unread counter follows those receipts.
--
-- BR-013 (backward compatible with the published app, which still calls
-- PATCH /api/conversations/read -> mark_conversation_read and reads
-- get_unread_counts):
--   * mark_conversation_read is untouched (still advances last_read_at and
--     writes receipts for every non-sender message).
--   * get_unread_counts keeps its signature, return shape, and ACL. Unread is
--     now "from others, newer than the viewer's last_read_at, and without the
--     viewer's receipt". last_read_at stays the historical floor: messages read
--     before per-message receipts existed (older than last_read_at, no receipt)
--     remain read, so no backfill is needed; mark-all still yields 0. The new
--     per-message path never advances last_read_at.
--
-- Additive only: one new service_role-only RPC plus a CREATE OR REPLACE of
-- get_unread_counts with an identical signature. Re-runnable.

-- ============================================================================
-- 1) RPC: record receipts for the given visible message ids.
--    service_role only (same pattern as mark_conversation_read and
--    check_rate_limit): it takes the target user id as a parameter, so it must
--    never be callable by anon/authenticated. The route authorizes first via
--    requireConversationParticipant; the membership check below is defense in
--    depth so the function can never write receipts for a non-member.
-- ============================================================================
create or replace function public.mark_messages_read(
  p_conversation_id uuid,
  p_user_id uuid,
  p_message_ids uuid[]
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recorded integer;
begin
  if p_conversation_id is null or p_user_id is null then
    raise exception 'mark_messages_read: conversation and user are required'
      using errcode = '22004';
  end if;

  if p_message_ids is null or pg_catalog.cardinality(p_message_ids) = 0 then
    return 0;
  end if;

  -- Bounded input: the route caps the batch at 100 ids as well.
  if pg_catalog.cardinality(p_message_ids) > 100 then
    raise exception 'mark_messages_read: at most 100 message ids per call'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.user_id = p_user_id
  ) then
    raise exception 'mark_messages_read: user is not a member of the conversation'
      using errcode = '42501';
  end if;

  -- Ids outside the conversation are ignored; the caller's own messages never
  -- get a receipt (system messages with a null sender may). Repeats are
  -- idempotent on the unique (message_id, user_id).
  insert into public.message_read_receipts (message_id, conversation_id, user_id)
  select m.id, m.conversation_id, p_user_id
  from public.messages m
  where m.conversation_id = p_conversation_id
    and m.id = any (p_message_ids)
    and m.sender_id is distinct from p_user_id
  on conflict (message_id, user_id) do nothing;

  get diagnostics v_recorded = row_count;
  return v_recorded;
end $$;

comment on function public.mark_messages_read(uuid, uuid, uuid[]) is
  'Phase 4 T5: records read receipts for visible message ids of a conversation the user is a member of; never for the user''s own messages; returns the number of new receipts. service_role only.';

revoke all on function public.mark_messages_read(uuid, uuid, uuid[]) from public;
revoke all on function public.mark_messages_read(uuid, uuid, uuid[]) from anon, authenticated;
grant execute on function public.mark_messages_read(uuid, uuid, uuid[]) to service_role;

-- ============================================================================
-- 2) get_unread_counts: unread follows receipts above the historical floor.
--    Same signature, return type, and parameter names as 20260610210000, so
--    CREATE OR REPLACE keeps the existing ACL. The anti-join uses the unique
--    index message_read_receipts_unique_user_message (message_id, user_id).
-- ============================================================================
create or replace function public.get_unread_counts(p_conversation_ids uuid[])
returns table (conversation_id uuid, unread_count bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select cm.conversation_id, count(m.id)::bigint
  from public.conversation_members cm
  left join public.messages m
    on m.conversation_id = cm.conversation_id
   and m."timestamp" > coalesce(cm.last_read_at, '-infinity'::timestamptz)
   and m.sender_id is distinct from cm.user_id
   and not exists (
     select 1
     from public.message_read_receipts r
     where r.message_id = m.id
       and r.user_id = cm.user_id
   )
  where cm.user_id = private.current_app_user_id()
    and cm.conversation_id = any (p_conversation_ids)
  group by cm.conversation_id
$$;
