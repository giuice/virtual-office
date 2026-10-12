-- Phase 5 T1 / FR-029, FR-030, AC-030, AC-031
-- (spec-interview/phase-5-messaging-resilience): Phase 4 database follow-ups.
--
-- 1) mark_conversation_read(p_conversation_id, p_user_id) refuses non-members.
--    It is SECURITY DEFINER and trusts p_user_id. Since 20261004170724 only
--    service_role (and the owner) may EXECUTE it, but its body UPSERTED the
--    membership row: a call for a user outside the conversation silently made
--    them a member (conversation_members drives RLS on messages) and wrote read
--    receipts on their behalf. The body now only UPDATEs an existing membership
--    row and raises 42501 when there is none, so nothing is written for a
--    non-member whatever role executes it (postgres/owner included). The UPDATE
--    is the membership check itself: it holds the row lock until commit, so a
--    concurrent membership removal cannot slip between check and receipts.
--    Null arguments raise 22004 instead of failing on a NOT NULL constraint.
--    search_path is now '' (every reference is schema-qualified, as in
--    mark_messages_read).
--
-- 2) get_unread_counts(uuid[]) is no longer executable by anon. Migration
--    20260610210000 revoked it from public and granted authenticated, but
--    Supabase's default privileges for functions created by postgres in public
--    (pg_default_acl: anon, authenticated, service_role = X) had already given
--    anon EXECUTE. anon has no auth.uid(), so it only ever got an empty set;
--    the grant is removed so the anon key cannot reach this SECURITY DEFINER
--    function at all.
--
-- Backward compatible with the hosted pre-Phase-4 build and the Phase 4 build
-- (SPEC section 10):
--   * signatures, parameter names, return types, SECURITY DEFINER, and the
--     write semantics for members (last_read_at = updated_at = now(), receipts
--     for every message from others) are unchanged;
--   * the only mark_conversation_read caller is
--     SupabaseConversationRepository.markConversationRead on the service-role
--     client in PATCH /api/conversations/read, which already 403s non-members
--     via requireConversationParticipant (conversation_members, same check on
--     main), so it never reaches the removed INSERT branch;
--   * the only get_unread_counts caller is SupabaseConversationRepository
--     .findByUser on the user-scoped client in GET /api/conversations/get,
--     which runs only after requireAuthUser, i.e. as authenticated.
--     authenticated and service_role keep EXECUTE.
--
-- Locking: CREATE OR REPLACE FUNCTION and GRANT/REVOKE only touch catalog rows
-- (brief locks; in-flight calls finish on the old body). lock_timeout makes the
-- migration fail fast instead of queueing; re-run it when that happens.
-- Transactional and re-runnable (CREATE OR REPLACE, idempotent GRANT/REVOKE).
--
-- Rollback restores the pre-migration body as written in 20260610210000
-- (logically identical to the pre-migration catalog body; only line endings
-- may differ), its absent comment, and the pre-migration ACLs. It REOPENS the
-- non-member upsert and the anon EXECUTE on get_unread_counts, so prefer a
-- forward fix. Order (SPEC BR-014): roll the application back first, then run
-- this SQL. The application step is a no-op while no Phase 5 build is
-- deployed against the target.
--   begin;
--   create or replace function public.mark_conversation_read(p_conversation_id uuid, p_user_id uuid)
--   returns void
--   language plpgsql
--   security definer
--   set search_path = public, pg_temp
--   as $fn$
--   begin
--     insert into public.conversation_members (conversation_id, user_id, last_read_at)
--     values (p_conversation_id, p_user_id, now())
--     on conflict (conversation_id, user_id)
--       do update set last_read_at = now(), updated_at = now();
--
--     insert into public.message_read_receipts (message_id, conversation_id, user_id)
--     select m.id, m.conversation_id, p_user_id
--     from public.messages m
--     where m.conversation_id = p_conversation_id
--       and m.sender_id is not null
--       and m.sender_id <> p_user_id
--     on conflict (message_id, user_id) do nothing;
--   end $fn$;
--   comment on function public.mark_conversation_read(uuid, uuid) is null;
--   revoke all on function public.mark_conversation_read(uuid, uuid) from public, anon, authenticated;
--   grant execute on function public.mark_conversation_read(uuid, uuid) to service_role;
--   grant execute on function public.get_unread_counts(uuid[]) to anon;
--   delete from supabase_migrations.schema_migrations where version = '20261007031057';
--   commit;

begin;

set local lock_timeout = '5s';

-- ============================================================================
-- 1) mark_conversation_read: members only, for every executing role.
-- ============================================================================
create or replace function public.mark_conversation_read(p_conversation_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_conversation_id is null or p_user_id is null then
    raise exception 'mark_conversation_read: conversation and user are required'
      using errcode = '22004';
  end if;

  update public.conversation_members cm
     set last_read_at = pg_catalog.now(),
         updated_at = pg_catalog.now()
   where cm.conversation_id = p_conversation_id
     and cm.user_id = p_user_id;

  if not found then
    raise exception 'mark_conversation_read: user is not a member of the conversation'
      using errcode = '42501';
  end if;

  insert into public.message_read_receipts (message_id, conversation_id, user_id)
  select m.id, m.conversation_id, p_user_id
  from public.messages m
  where m.conversation_id = p_conversation_id
    and m.sender_id is not null
    and m.sender_id <> p_user_id
  on conflict (message_id, user_id) do nothing;
end $$;

comment on function public.mark_conversation_read(uuid, uuid) is
  'Legacy mark-all: advances last_read_at and records receipts for every message from others in a conversation the user is a member of; raises 42501 for non-members (Phase 5 T1). service_role only.';

-- CREATE OR REPLACE keeps the ACL; re-assert it anyway (20261004170724).
revoke all on function public.mark_conversation_read(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mark_conversation_read(uuid, uuid) to service_role;

-- ============================================================================
-- 2) get_unread_counts: authenticated and service_role only.
-- ============================================================================
revoke all on function public.get_unread_counts(uuid[]) from public, anon;
grant execute on function public.get_unread_counts(uuid[]) to authenticated, service_role;

commit;
