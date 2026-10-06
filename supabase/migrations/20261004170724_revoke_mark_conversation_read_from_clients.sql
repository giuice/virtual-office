-- Phase 4 T24 / AC-035 (spec-interview/phase-4-messaging-timeline): anonymous
-- and signed-in clients can no longer call mark_conversation_read.
--
-- mark_conversation_read(p_conversation_id, p_user_id) is SECURITY DEFINER and
-- trusts its p_user_id argument, so any caller that can EXECUTE it can advance
-- another user's read cursor and write receipts on their behalf. Migration
-- 20260610210000 revoked it from public and authenticated only; Supabase's
-- default privileges for functions created by postgres in schema public
-- (pg_default_acl: anon, authenticated, service_role = X) had already granted
-- anon EXECUTE at CREATE time, so the anon key could still call it.
--
-- Backward compatible with the published app: the only caller is
-- SupabaseConversationRepository.markConversationRead, which runs on the
-- service-role client built by requireConversationParticipant in
-- PATCH /api/conversations/read. service_role keeps EXECUTE.
--
-- REVOKE/GRANT are idempotent: re-running this file is a no-op.
--
-- Rollback restores the exact pre-T24 ACL ({postgres, anon, service_role}),
-- which REOPENS the anon hole. Prefer a forward fix; use only to unblock an
-- emergency where a non-service-role caller turns out to depend on it:
--   grant execute on function public.mark_conversation_read(uuid, uuid) to anon;

begin;

revoke all on function public.mark_conversation_read(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mark_conversation_read(uuid, uuid) to service_role;

commit;
