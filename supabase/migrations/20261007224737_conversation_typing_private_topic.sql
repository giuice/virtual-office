-- Phase 5 T5 / FR-019, BR-009, AC-019, AC-035
-- (spec-interview/phase-5-messaging-resilience): members-only PRIVATE Realtime
-- topic for a conversation's typing signals.
--
-- Topic name contract (src/lib/messaging/typing-topic.ts):
--   conversation:<conversation id, canonical lowercase UUID>:typing
-- joined with `config: { private: true }`. Any other spelling (upper case,
-- braces, suffixes, the legacy public typing name conversation:<id>) is not
-- authorized. A PUBLIC channel with the same name is a different Realtime topic:
-- members on the private topic never receive what is sent there, and it never
-- receives what members send (proved by
-- __tests__/messaging-db/conversation-typing-topic.test.ts).
--
-- Authorization (realtime.messages RLS, evaluated by the Realtime server when a
-- client joins a private channel, on its first broadcast send, and again when
-- the client pushes a refreshed access token):
--   * phase5_conversation_typing_broadcast_receive (SELECT = join/receive) and
--     phase5_conversation_typing_broadcast_send (INSERT = broadcast send), both
--     TO authenticated only, extension 'broadcast' only, the row's topic equal
--     to realtime.topic(), private.can_use_conversation_typing_topic(topic):
--     the topic must have the exact contract form and the caller must be a
--     CURRENT member — private.is_conversation_member(conversation id), i.e.
--     users.supabase_uid = auth.uid()::text -> users.id -> a
--     public.conversation_members row (T28: memberships are created only by
--     authorized server paths; removal deletes the row and records a
--     revocation).
--   * Both policies also require private.is_presence_auth_session_unfenced(),
--     the exact-auth-session fence every existing private topic applies (the
--     Knock and company presence policies): the Presence logout transition
--     records the signed-out session (session_id claim) in
--     public.revoked_presence_auth_sessions, and that session can then no
--     longer join or send on any typing topic, nor keep a join across a token
--     refresh (re-authorization). Only that logout writes the fence, so an
--     active session is never refused by it. A JWT without a session_id claim
--     or without a users row is refused.
--   * No policy grants the 'presence' extension on this topic: presence
--     read/track there is refused for everyone (typing uses broadcast only).
--   * anon has no policy on realtime.messages at all; service_role bypasses RLS
--     (server only).
--   * Existing private topics are untouched: the Phase 4 Knock policy, the
--     Phase 6 company presence policies and the Phase 8 media policies match
--     only 'company:<id>:knock', 'company:<id>:presence' and
--     'company:<id>:space:<id>:media:v2' (checked against the LOCAL catalog
--     before writing this file; the online catalog is validated by the T23
--     preflight, see below); none of their predicates can match a
--     'conversation:...' topic, and the new predicates cannot match theirs, so
--     the OR of permissive policies authorizes no new principal on either side.
--     No existing policy is dropped, altered or reordered.
--
-- Residual risk (SPEC D3, D6; BR-009): Realtime caches a channel's read/write
-- authorization for the life of the join. Measured locally
-- (__tests__/messaging-db/conversation-typing-topic.test.ts): a member removed
-- while subscribed keeps receiving AND sending on its existing join (cached
-- authorization) until the client pushes a refreshed access token, which makes
-- the server re-check these policies and close the join. Closure at token
-- expiry without a refresh is Realtime's documented behavior and was not
-- exercised by the tests. The application leaves the topic on its own removal
-- signal (T15); a tampered client is bounded by the access-token lifetime.
--
-- private.can_use_conversation_typing_topic(text) is SECURITY INVOKER (it
-- needs no privilege of its own; the membership read is done by the existing
-- SECURITY DEFINER private.is_conversation_member), search_path '' with
-- qualified names, EXECUTE for authenticated only (Supabase default privileges
-- would otherwise grant it more widely). Policies are evaluated once per join /
-- first send / token refresh, not per delivered message; the membership lookup
-- uses the unique index (conversation_id, user_id).
--
-- Database impact: realtime.messages gains two policies; no table, column,
-- row or grant changes. The CREATE POLICY statements lock realtime.messages
-- briefly; lock_timeout makes the migration fail fast (and be re-run) instead
-- of queueing behind the Realtime server's authorization inserts.
-- Rollout order: this migration first, then any build that joins the private
-- typing topic (T15). Builds before T15 keep using the public
-- 'conversation:<id>' channel, which this migration does not change.
--
-- Rollback (order, SPEC BR-014): FIRST roll the application back to a build
-- that does not join the private typing topic (any build before T15), THEN run
-- this SQL as-is. While no T15+ build is deployed against the target the app
-- step is a no-op. No data is lost (no rows are written by this migration).
--   begin;
--   set local lock_timeout = '5s';
--   drop policy if exists phase5_conversation_typing_broadcast_send on realtime.messages;
--   drop policy if exists phase5_conversation_typing_broadcast_receive on realtime.messages;
--   drop function if exists private.can_use_conversation_typing_topic(text);
--   delete from supabase_migrations.schema_migrations where version = '20261007224737';
--   commit;

begin;

set local lock_timeout = '5s';

create or replace function private.can_use_conversation_typing_topic(p_topic text)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_parts text[];
begin
  if p_topic is null then
    return false;
  end if;
  -- Exact contract form only: lowercase hex UUID (the canonical uuid::text
  -- spelling), no prefix, no suffix.
  v_parts := pg_catalog.regexp_match(
    p_topic,
    '^conversation:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):typing$'
  );
  if v_parts is null then
    return false;
  end if;
  return coalesce(private.is_conversation_member(v_parts[1]::uuid), false);
end;
$$;

comment on function private.can_use_conversation_typing_topic(text) is
  'Phase 5 T5: true only for the exact private typing topic conversation:<lowercase uuid>:typing of a conversation the caller (auth.uid() -> users.supabase_uid -> users.id) is a current member of.';

revoke all on function private.can_use_conversation_typing_topic(text) from public, anon, authenticated, service_role;
grant execute on function private.can_use_conversation_typing_topic(text) to authenticated;

drop policy if exists phase5_conversation_typing_broadcast_receive on realtime.messages;
create policy phase5_conversation_typing_broadcast_receive
  on realtime.messages
  as permissive
  for select
  to authenticated
  using (
    extension = 'broadcast'
    and topic = (select realtime.topic())
    and private.can_use_conversation_typing_topic(topic)
    and private.is_presence_auth_session_unfenced()
  );

drop policy if exists phase5_conversation_typing_broadcast_send on realtime.messages;
create policy phase5_conversation_typing_broadcast_send
  on realtime.messages
  as permissive
  for insert
  to authenticated
  with check (
    extension = 'broadcast'
    and topic = (select realtime.topic())
    and private.can_use_conversation_typing_topic(topic)
    and private.is_presence_auth_session_unfenced()
  );

-- Name-presence check inside the transaction (aborts the migration on
-- mismatch): the two new policies exist for authenticated, and the seven
-- pre-existing policies exist BY NAME. It does NOT detect extra policies or
-- changed predicates on realtime.messages: the complete realtime.messages
-- policy/predicate validation of the target is a T23 preflight step, done
-- before this file is applied online.
do $$
declare
  v_new integer;
  v_existing integer;
begin
  select count(*) into v_new
    from pg_catalog.pg_policies
   where schemaname = 'realtime'
     and tablename = 'messages'
     and policyname in ('phase5_conversation_typing_broadcast_receive',
                        'phase5_conversation_typing_broadcast_send')
     and roles = '{authenticated}'::name[];
  select count(*) into v_existing
    from pg_catalog.pg_policies
   where schemaname = 'realtime'
     and tablename = 'messages'
     and policyname in ('phase4_knock_broadcast_receive',
                        'phase6_company_presence_channel_broadcast_receive',
                        'phase6_company_presence_receive',
                        'phase6_company_presence_track',
                        'phase8_media_broadcast_receive',
                        'phase8_media_presence_receive',
                        'phase8_media_presence_track');
  if v_new <> 2 or v_existing <> 7 then
    raise exception 'PHASE5_TYPING_POLICY_READBACK_FAILED new=% existing=%', v_new, v_existing;
  end if;
end;
$$;

commit;
