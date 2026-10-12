-- Phase 5 T3 / FR-008, AC-009, AC-035
-- (spec-interview/phase-5-messaging-resilience): message send budgets. The
-- INSERTION QUOTA is charged by the winning insertion, in the insertion's own
-- transaction, and no client write path bypasses it.
--
-- Budgets (numbers in src/lib/auth/rate-limit.ts; all per users.id, fail-closed):
--   * 'message:create-request' (request budget) and 'message:fence' (fence
--     budget): charged by the routes through public.check_rate_limit
--     (20260612190000; unchanged for every action except 'message:create',
--     see below), each call its own committed transaction, before any
--     insertion — so a rolled-back insertion never refunds them.
--   * 'message:create' (insertion quota): charged HERE, by
--     private.charge_message_insertion_quota, called by
--     public.create_message_attempt only after its INSERT won and passed the
--     commit-time fence check, as the last step before the function returns
--     (and PostgREST commits). Every create of this build goes through
--     create_message_attempt: keyed text, attachments, and (new in T3) unkeyed
--     text (null key and generation), so a failed INSERT (e.g. a reply target
--     deleted after the route validated it) is never charged.
--       - Replays, lost same-key races and every refusal (fenced,
--         MESSAGE_DELETED, validation, foreign key) never charge it.
--       - Quota exhausted → RATE_LIMITED; charge impossible (function missing
--         or revoked, counter table error, lock timeout, deadlock) →
--         RATE_LIMIT_UNAVAILABLE. Both roll the whole insertion back (no
--         message, no attachment link, uploads stay pending, attempt state and
--         the counter increment unchanged); the route answers 429 (fail-closed,
--         D4). A statement_timeout (query_canceled, which an EXCEPTION WHEN
--         OTHERS block cannot catch) also rolls everything back; the route
--         answers 500 and nothing is stored.
--       - Window rollover (review T3 r1 finding 2). check_rate_limit takes its
--         window from the transaction start (now()) and deletes older windows,
--         so a delayed insertion that started in window W0 could recreate W0's
--         deleted counter after a W1 insertion and commit beyond the quota.
--         private.charge_message_insertion_quota instead (a) serializes each
--         user's insertion-quota charges on a transaction-scoped advisory lock
--         (pg_advisory_xact_lock(hashtextextended('virtual_office.message_insertion_quota:'
--         || user id, 0)), held until commit; a hash collision only adds
--         waiting), (b) reads the window from clock_timestamp() AFTER taking
--         that lock, so serialized charges see non-decreasing windows, and (c)
--         only then deletes the user's older 'message:create' windows: no
--         in-flight insertion can still charge a window older than one already
--         charged. Concurrent insertions therefore never commit more messages
--         than the quota per window, across a rollover too.
--     The limit and window come from the caller (p_insert_quota_limit,
--     p_insert_quota_window_seconds; both NULL = no charge). The counter
--     ('message:create' in private.rate_limit_counters) is the one a Phase 4
--     server charges with public.check_rate_limit at its route, so both builds
--     share one quota during the rollout. That retained limiter is redefined
--     here (review T3 r2 finding 1) so a 'message:create' charge delegates to
--     private.charge_message_insertion_quota — same lock, same clock-read
--     window, same cleanup — and a Phase 4 charge delayed across a rollover can
--     no longer recreate a deleted older window; every other action keeps the
--     original body. All insertion-quota writers are under one serialization.
--     Only for 'message:create' with invalid input (limit or window NULL or
--     below 1) does it now raise INSERT_QUOTA_INVALID (22023) where the
--     original returned false or failed; every caller passes 30 per 60 s.
--   * On a winning insertion create_message_attempt also returns the created
--     row as 'message' (to_jsonb of the INSERT ... RETURNING row; review T3 r2
--     finding 2), built inside the insertion's transaction: if it cannot be
--     built, the insertion rolls back. The create route answers an unkeyed
--     send from that row without another database read after commit (a
--     failing post-commit read would answer 500 for a stored message and
--     invite a duplicating keyless retry). The Phase 4 wrapper strips it.
--
-- Who charges the insertion quota where (no double charge, no gap):
--   * POST /api/messages/create of this build: every create → this function
--     with the quota (charged on a winning insert only).
--   * public.create_message_with_attachments (Phase 4 signature, called only by
--     a Phase 4 server) and raw keyed service-role inserts
--     (messages_keyed_insert_fence trigger) → no charge here: the Phase 4
--     route already charged 'message:create'.
--   * Clients (anon, authenticated) can no longer INSERT into public.messages
--     at all (review T3 r1 finding 1): the "send_message_as_self" INSERT policy
--     is dropped and INSERT is revoked from anon and authenticated, so a member
--     cannot bulk-insert through the Data API after exhausting the route
--     budgets. No shipped build inserts messages with a client role: every
--     browser build creates through the service-role create route; the only
--     user-scoped insert in history (knock respond route, commit 681fbe2,
--     2026-02-09) became a service-role insert in 2acd511 (2026-02-23) and was
--     removed in b135d3d (2026-07-11, on main). Clients keep their UPDATE
--     (edit own message) and DELETE policies. Note: a later blanket GRANT on
--     public.messages would restore the privilege, but with no INSERT policy
--     RLS still denies every client insert.
--
-- Membership refusal marker (review T3 r1 finding 4): create_message_attempt
-- and fence_message_attempt now raise exactly 'NOT_PARTICIPANT' (SQLSTATE
-- 42501) when the sender is not a member. Callers of this build map ONLY that
-- marker to 403 NOT_PARTICIPANT; any other 42501 (a revoked EXECUTE or table
-- grant) is an infrastructure failure → 500 (recoverable). Phase 4 servers map
-- any 42501 to NOT_PARTICIPANT, which the marker keeps working.
--
-- Signature change: public.create_message_attempt gains two REQUIRED trailing
-- parameters (p_insert_quota_limit integer, p_insert_quota_window_seconds
-- integer); the T2 nine-parameter function is dropped (only the unreleased T2
-- build calls it). All other T2 guarantees are unchanged.
--
-- Security: every function is search_path '', EXECUTE revoked from public,
-- anon and authenticated (Supabase default privileges grant it on new
-- functions) and granted to service_role only. create_message_attempt and
-- fence_message_attempt stay SECURITY INVOKER.
-- private.charge_message_insertion_quota is SECURITY DEFINER (owner postgres,
-- in the non-exposed private schema, same model as check_rate_limit): it is
-- the only writer of the 'message:create' counter in this build and
-- private.rate_limit_counters grants nothing to service_role; it takes the
-- user id from its service-role caller (create_message_attempt), which the
-- route authorized.
--
-- Locking: DROP POLICY takes ACCESS EXCLUSIVE on public.messages until COMMIT
-- (bounded by lock_timeout: the migration fails fast instead of queueing
-- message traffic; re-run it). Function and grant changes only touch catalog
-- rows. Transactional and re-runnable (drop if exists / create or replace /
-- idempotent revoke and grant).
--
-- Rollback (review T3 r1 finding 5). Order: FIRST roll the application back to
-- a Phase 4-compatible build (main / the published build: it calls neither the
-- nine- nor the eleven-parameter create_message_attempt nor
-- fence_message_attempt), THEN run this SQL as-is. The T2 build may be
-- redeployed only after the SQL ran (it needs the nine-parameter function this
-- SQL restores). While no Phase 5 build is deployed against the target the app
-- step is a no-op. Counters already charged stay in private.rate_limit_counters
-- and expire with their window; clients regain their direct unkeyed INSERT.
--   begin;
--   set local lock_timeout = '5s';
--   drop function if exists public.create_message_attempt(uuid, uuid, text, text, uuid, uuid, bigint, jsonb, uuid[], integer, integer);
--   -- Original limiter (20260612190000), verbatim:
--   create or replace function public.check_rate_limit(
--     p_user_id uuid,
--     p_action text,
--     p_limit integer,
--     p_window_seconds integer
--   ) returns boolean
--   language plpgsql
--   security definer
--   set search_path = ''
--   as $$
--   declare
--     v_window_start timestamptz;
--     v_count integer;
--   begin
--     v_window_start := to_timestamp(
--       floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
--     );
--
--     insert into private.rate_limit_counters as c (user_id, action, window_start, count)
--     values (p_user_id, p_action, v_window_start, 1)
--     on conflict (user_id, action, window_start)
--     do update set count = c.count + 1
--     returning count into v_count;
--
--     -- Opportunistic cleanup of this user's expired windows (PK-indexed, cheap).
--     delete from private.rate_limit_counters
--     where user_id = p_user_id
--       and action = p_action
--       and window_start < v_window_start;
--
--     return v_count <= p_limit;
--   end;
--   $$;
--
--   revoke all on function public.check_rate_limit(uuid, text, integer, integer) from public;
--   revoke all on function public.check_rate_limit(uuid, text, integer, integer) from anon, authenticated;
--   grant execute on function public.check_rate_limit(uuid, text, integer, integer) to service_role;
--   drop function if exists private.charge_message_insertion_quota(uuid, integer, integer);
--   create policy "send_message_as_self" on public.messages
--     for insert
--     with check (
--       (sender_id = (select private.current_app_user_id()))
--       and private.is_conversation_member(conversation_id)
--       and content <> ''
--       and client_message_id is null
--     );
--   grant insert on table public.messages to anon, authenticated;
--   -- Phase 5 T2 bodies (20261007095045), verbatim:
--   create or replace function public.create_message_attempt(
--     p_conversation_id uuid,
--     p_sender_id uuid,
--     p_content text,
--     p_type text,
--     p_reply_to_id uuid,
--     p_client_message_id uuid,
--     p_attempt_generation bigint,
--     p_composition jsonb,
--     p_upload_ids uuid[]
--   )
--   returns jsonb
--   language plpgsql
--   security invoker
--   set search_path = ''
--   as $$
--   declare
--     v_count integer;
--     v_locked integer;
--     v_voice integer;
--     v_message_id uuid;
--     v_new_id uuid := pg_catalog.gen_random_uuid();
--     v_generation bigint;
--     v_committed_at timestamptz;
--   begin
--     if p_conversation_id is null or p_sender_id is null or p_content is null or p_type is null then
--       raise exception 'create_message_attempt: conversation, sender, content and type are required'
--         using errcode = '22004';
--     end if;
--     if p_attempt_generation is not null and (p_client_message_id is null or p_attempt_generation < 1) then
--       raise exception 'ATTEMPT_GENERATION_INVALID' using errcode = '22023';
--     end if;
--     if p_composition is not null and (p_client_message_id is null or pg_catalog.jsonb_typeof(p_composition) <> 'object') then
--       raise exception 'create_message_attempt: a composition needs a client key and must be an object'
--         using errcode = '22023';
--     end if;
--
--     v_count := coalesce(pg_catalog.cardinality(p_upload_ids), 0);
--     -- Same bound as the route's attachment policy (5 per message).
--     if v_count > 5 then
--       raise exception 'ATTACHMENT_COUNT_INVALID' using errcode = '22023';
--     end if;
--     if v_count > 0 then
--       if (select pg_catalog.count(distinct u) from pg_catalog.unnest(p_upload_ids) as u) <> v_count then
--         raise exception 'ATTACHMENT_DUPLICATE' using errcode = '22023';
--       end if;
--       -- Attachment messages are typed image or file (the only types allowed to
--       -- carry empty content).
--       if p_type not in ('image', 'file') then
--         raise exception 'create_message_attempt: type must be image or file'
--           using errcode = '22023';
--       end if;
--     end if;
--
--     -- Defense in depth: the route already required membership.
--     if not exists (
--       select 1
--       from public.conversation_members cm
--       where cm.conversation_id = p_conversation_id
--         and cm.user_id = p_sender_id
--     ) then
--       raise exception 'create_message_attempt: sender is not a member of the conversation'
--         using errcode = '42501';
--     end if;
--
--     -- Replay of a key whose create already committed: answer with the stored
--     -- message and link nothing (its uploads were consumed by the first create).
--     -- Checked before the reply target: an unchanged replay is compared against
--     -- the original composition, not re-validated (FR-024), so a reply target
--     -- deleted since does not turn it into a refusal.
--     if p_client_message_id is not null then
--       select m.id into v_message_id
--       from public.messages m
--       where m.sender_id = p_sender_id
--         and m.conversation_id = p_conversation_id
--         and m.client_message_id = p_client_message_id;
--       if v_message_id is not null then
--         return private.message_attempt_replay(
--           p_sender_id, p_conversation_id, p_client_message_id, p_attempt_generation, v_message_id);
--       end if;
--     end if;
--
--     -- A reply target must be a message of the same conversation.
--     if p_reply_to_id is not null and not exists (
--       select 1
--       from public.messages r
--       where r.id = p_reply_to_id
--         and r.conversation_id = p_conversation_id
--     ) then
--       raise exception 'INVALID_REPLY_TARGET' using errcode = '22023';
--     end if;
--
--     if v_count > 0 then
--       -- Lock the caller's pending uploads for this conversation (id order avoids
--       -- deadlocks between overlapping sets). A concurrent cancel or link of the
--       -- same upload waits here; once it commits the row is gone.
--       select pg_catalog.count(*), pg_catalog.count(*) filter (where locked.duration is not null)
--       into v_locked, v_voice
--       from (
--         select u.id, u.duration
--         from public.message_attachment_uploads u
--         where u.id = any (p_upload_ids)
--           and u.uploader_id = p_sender_id
--           and u.conversation_id = p_conversation_id
--         order by u.id
--         for update
--       ) as locked;
--
--       if v_locked <> v_count then
--         -- A concurrent create with the same key may have consumed them.
--         if p_client_message_id is not null then
--           select m.id into v_message_id
--           from public.messages m
--           where m.sender_id = p_sender_id
--             and m.conversation_id = p_conversation_id
--             and m.client_message_id = p_client_message_id;
--           if v_message_id is not null then
--             return private.message_attempt_replay(
--               p_sender_id, p_conversation_id, p_client_message_id, p_attempt_generation, v_message_id);
--           end if;
--         end if;
--         -- Unknown, foreign, other-conversation, cancelled, or already linked.
--         raise exception 'ATTACHMENT_UPLOAD_NOT_FOUND' using errcode = '22023';
--       end if;
--
--       -- Phase 4 T15: a voice note is the only attachment of its message, which
--       -- is typed file.
--       if v_voice > 0 and v_count > 1 then
--         raise exception 'VOICE_NOTE_NOT_ALONE' using errcode = '22023';
--       end if;
--       if v_voice > 0 and p_type <> 'file' then
--         raise exception 'create_message_attempt: a voice note message must be typed file'
--           using errcode = '22023';
--       end if;
--     end if;
--
--     -- This INSERT is checked below (commit-time fence check); the
--     -- messages_keyed_insert_fence trigger recognizes it by its pre-generated id
--     -- and leaves it to this function. Any other keyed insert is checked by the
--     -- trigger itself.
--     perform pg_catalog.set_config('virtual_office.create_message_attempt_id', v_new_id::text, true);
--     insert into public.messages (id, conversation_id, sender_id, content, type, status, reply_to_id, client_message_id)
--     values (
--       v_new_id,
--       p_conversation_id,
--       p_sender_id,
--       p_content,
--       p_type::public.message_type,
--       'sent'::public.message_status,
--       p_reply_to_id,
--       p_client_message_id
--     )
--     on conflict (sender_id, conversation_id, client_message_id) where client_message_id is not null
--     do nothing
--     returning id into v_message_id;
--     perform pg_catalog.set_config('virtual_office.create_message_attempt_id', '', true);
--
--     if v_message_id is null then
--       -- Lost the race on the same key: the winner's message is committed.
--       select m.id into v_message_id
--       from public.messages m
--       where m.sender_id = p_sender_id
--         and m.conversation_id = p_conversation_id
--         and m.client_message_id = p_client_message_id;
--       return private.message_attempt_replay(
--         p_sender_id, p_conversation_id, p_client_message_id, p_attempt_generation, v_message_id);
--     end if;
--
--     if v_count > 0 then
--       insert into public.message_attachments (id, message_id, name, type, size, url, duration, waveform_data)
--       select u.id, v_message_id, u.name, u.type, u.size, u.storage_path, u.duration, u.waveform_data
--       from public.message_attachment_uploads u
--       where u.id = any (p_upload_ids);
--
--       delete from public.message_attachment_uploads u
--       where u.id = any (p_upload_ids);
--     end if;
--
--     -- Commit-time fence check (see header): lock the key row only now, after
--     -- the INSERT, and hold it until commit.
--     if p_client_message_id is not null then
--       insert into private.message_send_attempts (sender_id, conversation_id, client_message_id)
--       values (p_sender_id, p_conversation_id, p_client_message_id)
--       on conflict (sender_id, conversation_id, client_message_id) do nothing;
--
--       select a.fence_generation, a.committed_at into v_generation, v_committed_at
--       from private.message_send_attempts a
--       where a.sender_id = p_sender_id
--         and a.conversation_id = p_conversation_id
--         and a.client_message_id = p_client_message_id
--       for update;
--
--       if v_generation is not null and (p_attempt_generation is null or p_attempt_generation < v_generation) then
--         raise exception 'ATTEMPT_SUPERSEDED' using errcode = 'P0001';
--       end if;
--       -- Our INSERT succeeded, so no message holds the key now: a commit
--       -- recorded earlier means that message was deleted.
--       if p_attempt_generation is not null and v_committed_at is not null then
--         raise exception 'MESSAGE_DELETED' using errcode = 'P0001';
--       end if;
--
--       update private.message_send_attempts a
--       set fence_generation = case
--             when p_attempt_generation is null then a.fence_generation
--             else greatest(coalesce(a.fence_generation, 0), p_attempt_generation)
--           end,
--           committed_at = pg_catalog.now(),
--           message_id = v_message_id,
--           composition = p_composition,
--           updated_at = pg_catalog.now()
--       where a.sender_id = p_sender_id
--         and a.conversation_id = p_conversation_id
--         and a.client_message_id = p_client_message_id;
--     end if;
--
--     return pg_catalog.jsonb_build_object('message_id', v_message_id, 'created', true, 'composition', p_composition);
--   end
--   $$;
--
--   comment on function public.create_message_attempt(uuid, uuid, text, text, uuid, uuid, bigint, jsonb, uuid[]) is
--     'Phase 5 T2: creates a keyed text message, or a message with 1-5 pending uploads of its sender (Phase 4 T12/T15 rules), committing only when the attempt generation is current for (sender, conversation, key) at commit time (a generation-less keyed create only when no fence state exists). Returns {message_id, created, composition}; created=false is a replay. Raises ATTEMPT_SUPERSEDED when fenced and MESSAGE_DELETED when a generation-carrying create would recreate a deleted message. Service role only; callers authorize the sender and validate the attachment policy first.';
--
--   revoke all on function public.create_message_attempt(uuid, uuid, text, text, uuid, uuid, bigint, jsonb, uuid[])
--     from public, anon, authenticated;
--   grant execute on function public.create_message_attempt(uuid, uuid, text, text, uuid, uuid, bigint, jsonb, uuid[])
--     to service_role;
--
--   -- ============================================================================
--   -- Phase 4 signature, kept for older builds: same contract, now fenced (D4).
--   -- ============================================================================
--   create or replace function public.create_message_with_attachments(
--     p_conversation_id uuid,
--     p_sender_id uuid,
--     p_content text,
--     p_type text,
--     p_reply_to_id uuid,
--     p_client_message_id uuid,
--     p_upload_ids uuid[]
--   )
--   returns jsonb
--   language plpgsql
--   security invoker
--   set search_path = ''
--   as $$
--   begin
--     if p_conversation_id is null or p_sender_id is null or p_content is null or p_type is null then
--       raise exception 'create_message_with_attachments: conversation, sender, content and type are required'
--         using errcode = '22004';
--     end if;
--     if coalesce(pg_catalog.cardinality(p_upload_ids), 0) < 1 then
--       raise exception 'ATTACHMENT_COUNT_INVALID' using errcode = '22023';
--     end if;
--
--     return public.create_message_attempt(
--       p_conversation_id, p_sender_id, p_content, p_type, p_reply_to_id,
--       p_client_message_id, null, null, p_upload_ids
--     ) - 'composition';
--   end
--   $$;
--
--   comment on function public.create_message_with_attachments(uuid, uuid, text, text, uuid, uuid, uuid[]) is
--     'Phase 4 T12/T15 signature (kept for older builds): delegates to create_message_attempt without an attempt generation (Phase 5 T2, D4). Returns {message_id, created}. Service role only.';
--
--   revoke all on function public.create_message_with_attachments(uuid, uuid, text, text, uuid, uuid, uuid[])
--     from public, anon, authenticated;
--   grant execute on function public.create_message_with_attachments(uuid, uuid, text, text, uuid, uuid, uuid[])
--     to service_role;
--   create or replace function public.fence_message_attempt(
--     p_sender_id uuid,
--     p_conversation_id uuid,
--     p_client_message_id uuid,
--     p_attempt_generation bigint
--   )
--   returns jsonb
--   language plpgsql
--   security invoker
--   set search_path = ''
--   as $$
--   declare
--     v_generation bigint;
--     v_committed_at timestamptz;
--     v_message_id uuid;
--   begin
--     if p_sender_id is null or p_conversation_id is null or p_client_message_id is null or p_attempt_generation is null then
--       raise exception 'fence_message_attempt: sender, conversation, key and generation are required'
--         using errcode = '22004';
--     end if;
--     if p_attempt_generation < 1 then
--       raise exception 'ATTEMPT_GENERATION_INVALID' using errcode = '22023';
--     end if;
--
--     -- Defense in depth: the route already required membership.
--     if not exists (
--       select 1
--       from public.conversation_members cm
--       where cm.conversation_id = p_conversation_id
--         and cm.user_id = p_sender_id
--     ) then
--       raise exception 'fence_message_attempt: sender is not a member of the conversation'
--         using errcode = '42501';
--     end if;
--
--     insert into private.message_send_attempts (sender_id, conversation_id, client_message_id)
--     values (p_sender_id, p_conversation_id, p_client_message_id)
--     on conflict (sender_id, conversation_id, client_message_id) do nothing;
--
--     select a.fence_generation, a.committed_at into v_generation, v_committed_at
--     from private.message_send_attempts a
--     where a.sender_id = p_sender_id
--       and a.conversation_id = p_conversation_id
--       and a.client_message_id = p_client_message_id
--     for update;
--
--     if v_generation is not null and p_attempt_generation < v_generation then
--       return pg_catalog.jsonb_build_object('outcome', 'superseded', 'current_generation', v_generation);
--     end if;
--
--     if v_generation is null or p_attempt_generation > v_generation then
--       update private.message_send_attempts a
--       set fence_generation = p_attempt_generation,
--           updated_at = pg_catalog.now()
--       where a.sender_id = p_sender_id
--         and a.conversation_id = p_conversation_id
--         and a.client_message_id = p_client_message_id;
--     end if;
--
--     -- A new statement (new snapshot) after the row lock: a create that held the
--     -- lock has committed by now and its message is visible.
--     select m.id into v_message_id
--     from public.messages m
--     where m.sender_id = p_sender_id
--       and m.conversation_id = p_conversation_id
--       and m.client_message_id = p_client_message_id;
--
--     if v_message_id is not null then
--       -- Delivery record, still under the key lock: a message the row does not
--       -- track yet (written before this migration) is recorded now, so its later
--       -- deletion is never reported as not stored.
--       update private.message_send_attempts a
--       set message_id = v_message_id,
--           committed_at = coalesce(a.committed_at, pg_catalog.now()),
--           composition = case when a.message_id = v_message_id then a.composition end,
--           updated_at = pg_catalog.now()
--       where a.sender_id = p_sender_id
--         and a.conversation_id = p_conversation_id
--         and a.client_message_id = p_client_message_id
--         and (a.message_id is distinct from v_message_id or a.committed_at is null);
--     end if;
--
--     if v_message_id is not null or v_committed_at is not null then
--       -- message_id is null when the committed message was deleted since.
--       return pg_catalog.jsonb_build_object('outcome', 'stored', 'message_id', v_message_id);
--     end if;
--     return pg_catalog.jsonb_build_object('outcome', 'not_stored');
--   end
--   $$;
--
--   comment on function public.fence_message_attempt(uuid, uuid, uuid, bigint) is
--     'Phase 5 T2: fence/lookup of the sender''s own client key. Returns {outcome: superseded|stored|not_stored, message_id (null when the stored message was deleted)}; never creates a message; makes every lower generation of the key unable to commit. Service role only; callers authorize the sender first.';
--
--   revoke all on function public.fence_message_attempt(uuid, uuid, uuid, bigint)
--     from public, anon, authenticated;
--   grant execute on function public.fence_message_attempt(uuid, uuid, uuid, bigint)
--     to service_role;
--   delete from supabase_migrations.schema_migrations where version = '20261007114454';
--   commit;

begin;

set local lock_timeout = '5s';

-- ============================================================================
-- No client write path around the budgets: clients cannot insert messages.
-- ============================================================================
drop policy if exists "send_message_as_self" on public.messages;
revoke insert on table public.messages from anon, authenticated;

-- ============================================================================
-- Insertion-quota charge, serialized per user across windows (see header).
-- ============================================================================
create or replace function private.charge_message_insertion_quota(
  p_user_id uuid,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window_start timestamptz;
  v_count integer;
begin
  if p_user_id is null or p_limit is null or p_window_seconds is null or p_limit < 1 or p_window_seconds < 1 then
    raise exception 'INSERT_QUOTA_INVALID' using errcode = '22023';
  end if;

  -- Held until commit: this user's insertion-quota charges run one at a time.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('virtual_office.message_insertion_quota:' || p_user_id::text, 0)
  );

  -- The window is read after the lock from the wall clock (not the
  -- transaction start), so serialized charges see non-decreasing windows.
  v_window_start := pg_catalog.to_timestamp(
    (pg_catalog.floor(extract(epoch from pg_catalog.clock_timestamp()) / p_window_seconds) * p_window_seconds)::double precision
  );

  insert into private.rate_limit_counters as c (user_id, action, window_start, count)
  values (p_user_id, 'message:create', v_window_start, 1)
  on conflict (user_id, action, window_start)
  do update set count = c.count + 1
  returning count into v_count;

  -- Older windows can no longer be charged by this user's insertions (every
  -- later charge is serialized behind this one and reads a later clock).
  delete from private.rate_limit_counters c
  where c.user_id = p_user_id
    and c.action = 'message:create'
    and c.window_start < v_window_start;

  return v_count <= p_limit;
end
$$;

comment on function private.charge_message_insertion_quota(uuid, integer, integer) is
  'Phase 5 T3: charges one message insertion to the user''s ''message:create'' counter (p_limit per p_window_seconds) in the CALLER''S transaction; serialized per user until commit (advisory lock) with the window read from clock_timestamp() after the lock. Returns false when the quota is exhausted (the caller must roll back). Called by public.create_message_attempt; service_role only.';

revoke all on function private.charge_message_insertion_quota(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function private.charge_message_insertion_quota(uuid, integer, integer)
  to service_role;

-- ============================================================================
-- The retained limiter (Phase 4 servers' route-level 'message:create' charge)
-- joins the same serialization; every other action is unchanged.
-- ============================================================================
create or replace function public.check_rate_limit(
  p_user_id uuid,
  p_action text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window_start timestamptz;
  v_count integer;
begin
  -- Phase 5 T3: insertion-quota charges are serialized per user with the
  -- window read after the lock (private.charge_message_insertion_quota), so a
  -- delayed charge can never recreate an older, already cleaned-up window.
  if p_action = 'message:create' then
    return private.charge_message_insertion_quota(p_user_id, p_limit, p_window_seconds);
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into private.rate_limit_counters as c (user_id, action, window_start, count)
  values (p_user_id, p_action, v_window_start, 1)
  on conflict (user_id, action, window_start)
  do update set count = c.count + 1
  returning count into v_count;

  -- Opportunistic cleanup of this user's expired windows (PK-indexed, cheap).
  delete from private.rate_limit_counters
  where user_id = p_user_id
    and action = p_action
    and window_start < v_window_start;

  return v_count <= p_limit;
end;
$$;

revoke all on function public.check_rate_limit(uuid, text, integer, integer) from public;
revoke all on function public.check_rate_limit(uuid, text, integer, integer) from anon, authenticated;
grant execute on function public.check_rate_limit(uuid, text, integer, integer) to service_role;

-- ============================================================================
-- Fence / lookup: T2 body, with the explicit membership refusal marker.
-- ============================================================================
create or replace function public.fence_message_attempt(
  p_sender_id uuid,
  p_conversation_id uuid,
  p_client_message_id uuid,
  p_attempt_generation bigint
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_generation bigint;
  v_committed_at timestamptz;
  v_message_id uuid;
begin
  if p_sender_id is null or p_conversation_id is null or p_client_message_id is null or p_attempt_generation is null then
    raise exception 'fence_message_attempt: sender, conversation, key and generation are required'
      using errcode = '22004';
  end if;
  if p_attempt_generation < 1 then
    raise exception 'ATTEMPT_GENERATION_INVALID' using errcode = '22023';
  end if;

  -- Defense in depth: the route already required membership.
  if not exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.user_id = p_sender_id
  ) then
    -- Explicit marker (Phase 5 T3): callers map only this to NOT_PARTICIPANT.
    raise exception 'NOT_PARTICIPANT' using errcode = '42501';
  end if;

  insert into private.message_send_attempts (sender_id, conversation_id, client_message_id)
  values (p_sender_id, p_conversation_id, p_client_message_id)
  on conflict (sender_id, conversation_id, client_message_id) do nothing;

  select a.fence_generation, a.committed_at into v_generation, v_committed_at
  from private.message_send_attempts a
  where a.sender_id = p_sender_id
    and a.conversation_id = p_conversation_id
    and a.client_message_id = p_client_message_id
  for update;

  if v_generation is not null and p_attempt_generation < v_generation then
    return pg_catalog.jsonb_build_object('outcome', 'superseded', 'current_generation', v_generation);
  end if;

  if v_generation is null or p_attempt_generation > v_generation then
    update private.message_send_attempts a
    set fence_generation = p_attempt_generation,
        updated_at = pg_catalog.now()
    where a.sender_id = p_sender_id
      and a.conversation_id = p_conversation_id
      and a.client_message_id = p_client_message_id;
  end if;

  -- A new statement (new snapshot) after the row lock: a create that held the
  -- lock has committed by now and its message is visible.
  select m.id into v_message_id
  from public.messages m
  where m.sender_id = p_sender_id
    and m.conversation_id = p_conversation_id
    and m.client_message_id = p_client_message_id;

  if v_message_id is not null then
    -- Delivery record, still under the key lock: a message the row does not
    -- track yet (written before this migration) is recorded now, so its later
    -- deletion is never reported as not stored.
    update private.message_send_attempts a
    set message_id = v_message_id,
        committed_at = coalesce(a.committed_at, pg_catalog.now()),
        composition = case when a.message_id = v_message_id then a.composition end,
        updated_at = pg_catalog.now()
    where a.sender_id = p_sender_id
      and a.conversation_id = p_conversation_id
      and a.client_message_id = p_client_message_id
      and (a.message_id is distinct from v_message_id or a.committed_at is null);
  end if;

  if v_message_id is not null or v_committed_at is not null then
    -- message_id is null when the committed message was deleted since.
    return pg_catalog.jsonb_build_object('outcome', 'stored', 'message_id', v_message_id);
  end if;
  return pg_catalog.jsonb_build_object('outcome', 'not_stored');
end
$$;

comment on function public.fence_message_attempt(uuid, uuid, uuid, bigint) is
  'Phase 5 T2/T3: fence/lookup of the sender''s own client key. Returns {outcome: superseded|stored|not_stored, message_id (null when the stored message was deleted)}; never creates a message; makes every lower generation of the key unable to commit. Raises NOT_PARTICIPANT (42501) when the sender is not a member. Service role only; callers authorize the sender first.';

revoke all on function public.fence_message_attempt(uuid, uuid, uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.fence_message_attempt(uuid, uuid, uuid, bigint)
  to service_role;


-- ============================================================================
-- Fenced create (keyed text, unkeyed text, attachments) with the insertion
-- quota charged by the winning insertion.
-- ============================================================================
drop function if exists public.create_message_attempt(uuid, uuid, text, text, uuid, uuid, bigint, jsonb, uuid[]);

create or replace function public.create_message_attempt(
  p_conversation_id uuid,
  p_sender_id uuid,
  p_content text,
  p_type text,
  p_reply_to_id uuid,
  p_client_message_id uuid,
  p_attempt_generation bigint,
  p_composition jsonb,
  p_upload_ids uuid[],
  p_insert_quota_limit integer,
  p_insert_quota_window_seconds integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
  v_locked integer;
  v_voice integer;
  v_message_id uuid;
  v_new_id uuid := pg_catalog.gen_random_uuid();
  v_generation bigint;
  v_committed_at timestamptz;
  v_quota_allowed boolean;
  v_row public.messages%rowtype;
begin
  if p_conversation_id is null or p_sender_id is null or p_content is null or p_type is null then
    raise exception 'create_message_attempt: conversation, sender, content and type are required'
      using errcode = '22004';
  end if;
  if p_attempt_generation is not null and (p_client_message_id is null or p_attempt_generation < 1) then
    raise exception 'ATTEMPT_GENERATION_INVALID' using errcode = '22023';
  end if;
  if p_composition is not null and (p_client_message_id is null or pg_catalog.jsonb_typeof(p_composition) <> 'object') then
    raise exception 'create_message_attempt: a composition needs a client key and must be an object'
      using errcode = '22023';
  end if;
  -- Phase 5 T3: both NULL (no charge: callers that charged elsewhere) or both
  -- positive.
  if (p_insert_quota_limit is null) <> (p_insert_quota_window_seconds is null)
     or p_insert_quota_limit < 1
     or p_insert_quota_window_seconds < 1 then
    raise exception 'INSERT_QUOTA_INVALID' using errcode = '22023';
  end if;

  v_count := coalesce(pg_catalog.cardinality(p_upload_ids), 0);
  -- Same bound as the route's attachment policy (5 per message).
  if v_count > 5 then
    raise exception 'ATTACHMENT_COUNT_INVALID' using errcode = '22023';
  end if;
  if v_count > 0 then
    if (select pg_catalog.count(distinct u) from pg_catalog.unnest(p_upload_ids) as u) <> v_count then
      raise exception 'ATTACHMENT_DUPLICATE' using errcode = '22023';
    end if;
    -- Attachment messages are typed image or file (the only types allowed to
    -- carry empty content).
    if p_type not in ('image', 'file') then
      raise exception 'create_message_attempt: type must be image or file'
        using errcode = '22023';
    end if;
  end if;

  -- Defense in depth: the route already required membership.
  if not exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.user_id = p_sender_id
  ) then
    -- Explicit marker (Phase 5 T3): callers map only this to NOT_PARTICIPANT.
    raise exception 'NOT_PARTICIPANT' using errcode = '42501';
  end if;

  -- Replay of a key whose create already committed: answer with the stored
  -- message and link nothing (its uploads were consumed by the first create).
  -- Checked before the reply target: an unchanged replay is compared against
  -- the original composition, not re-validated (FR-024), so a reply target
  -- deleted since does not turn it into a refusal. Not an insertion: the
  -- insertion quota is not charged (Phase 5 T3, D1).
  if p_client_message_id is not null then
    select m.id into v_message_id
    from public.messages m
    where m.sender_id = p_sender_id
      and m.conversation_id = p_conversation_id
      and m.client_message_id = p_client_message_id;
    if v_message_id is not null then
      return private.message_attempt_replay(
        p_sender_id, p_conversation_id, p_client_message_id, p_attempt_generation, v_message_id);
    end if;
  end if;

  -- A reply target must be a message of the same conversation.
  if p_reply_to_id is not null and not exists (
    select 1
    from public.messages r
    where r.id = p_reply_to_id
      and r.conversation_id = p_conversation_id
  ) then
    raise exception 'INVALID_REPLY_TARGET' using errcode = '22023';
  end if;

  if v_count > 0 then
    -- Lock the caller's pending uploads for this conversation (id order avoids
    -- deadlocks between overlapping sets). A concurrent cancel or link of the
    -- same upload waits here; once it commits the row is gone.
    select pg_catalog.count(*), pg_catalog.count(*) filter (where locked.duration is not null)
    into v_locked, v_voice
    from (
      select u.id, u.duration
      from public.message_attachment_uploads u
      where u.id = any (p_upload_ids)
        and u.uploader_id = p_sender_id
        and u.conversation_id = p_conversation_id
      order by u.id
      for update
    ) as locked;

    if v_locked <> v_count then
      -- A concurrent create with the same key may have consumed them.
      if p_client_message_id is not null then
        select m.id into v_message_id
        from public.messages m
        where m.sender_id = p_sender_id
          and m.conversation_id = p_conversation_id
          and m.client_message_id = p_client_message_id;
        if v_message_id is not null then
          return private.message_attempt_replay(
            p_sender_id, p_conversation_id, p_client_message_id, p_attempt_generation, v_message_id);
        end if;
      end if;
      -- Unknown, foreign, other-conversation, cancelled, or already linked.
      raise exception 'ATTACHMENT_UPLOAD_NOT_FOUND' using errcode = '22023';
    end if;

    -- Phase 4 T15: a voice note is the only attachment of its message, which
    -- is typed file.
    if v_voice > 0 and v_count > 1 then
      raise exception 'VOICE_NOTE_NOT_ALONE' using errcode = '22023';
    end if;
    if v_voice > 0 and p_type <> 'file' then
      raise exception 'create_message_attempt: a voice note message must be typed file'
        using errcode = '22023';
    end if;
  end if;

  -- This INSERT is checked below (commit-time fence check); the
  -- messages_keyed_insert_fence trigger recognizes it by its pre-generated id
  -- and leaves it to this function. Any other keyed insert is checked by the
  -- trigger itself.
  perform pg_catalog.set_config('virtual_office.create_message_attempt_id', v_new_id::text, true);
  insert into public.messages (id, conversation_id, sender_id, content, type, status, reply_to_id, client_message_id)
  values (
    v_new_id,
    p_conversation_id,
    p_sender_id,
    p_content,
    p_type::public.message_type,
    'sent'::public.message_status,
    p_reply_to_id,
    p_client_message_id
  )
  on conflict (sender_id, conversation_id, client_message_id) where client_message_id is not null
  do nothing
  returning * into v_row;
  perform pg_catalog.set_config('virtual_office.create_message_attempt_id', '', true);
  -- Phase 5 T3: the inserted row (all fields null after a lost same-key race)
  -- is returned to the caller from this transaction.
  v_message_id := v_row.id;

  if v_message_id is null then
    -- Lost the race on the same key: the winner's message is committed. Not
    -- an insertion: the insertion quota is not charged.
    select m.id into v_message_id
    from public.messages m
    where m.sender_id = p_sender_id
      and m.conversation_id = p_conversation_id
      and m.client_message_id = p_client_message_id;
    return private.message_attempt_replay(
      p_sender_id, p_conversation_id, p_client_message_id, p_attempt_generation, v_message_id);
  end if;

  if v_count > 0 then
    insert into public.message_attachments (id, message_id, name, type, size, url, duration, waveform_data)
    select u.id, v_message_id, u.name, u.type, u.size, u.storage_path, u.duration, u.waveform_data
    from public.message_attachment_uploads u
    where u.id = any (p_upload_ids);

    delete from public.message_attachment_uploads u
    where u.id = any (p_upload_ids);
  end if;

  -- Commit-time fence check (see the T2 migration header): lock the key row
  -- only now, after the INSERT, and hold it until commit.
  if p_client_message_id is not null then
    insert into private.message_send_attempts (sender_id, conversation_id, client_message_id)
    values (p_sender_id, p_conversation_id, p_client_message_id)
    on conflict (sender_id, conversation_id, client_message_id) do nothing;

    select a.fence_generation, a.committed_at into v_generation, v_committed_at
    from private.message_send_attempts a
    where a.sender_id = p_sender_id
      and a.conversation_id = p_conversation_id
      and a.client_message_id = p_client_message_id
    for update;

    if v_generation is not null and (p_attempt_generation is null or p_attempt_generation < v_generation) then
      raise exception 'ATTEMPT_SUPERSEDED' using errcode = 'P0001';
    end if;
    -- Our INSERT succeeded, so no message holds the key now: a commit
    -- recorded earlier means that message was deleted.
    if p_attempt_generation is not null and v_committed_at is not null then
      raise exception 'MESSAGE_DELETED' using errcode = 'P0001';
    end if;

    update private.message_send_attempts a
    set fence_generation = case
          when p_attempt_generation is null then a.fence_generation
          else greatest(coalesce(a.fence_generation, 0), p_attempt_generation)
        end,
        committed_at = pg_catalog.now(),
        message_id = v_message_id,
        composition = p_composition,
        updated_at = pg_catalog.now()
    where a.sender_id = p_sender_id
      and a.conversation_id = p_conversation_id
      and a.client_message_id = p_client_message_id;
  end if;

  -- Phase 5 T3 (FR-008, D1): the insertion quota, charged by this winning
  -- insertion in its own transaction, as the last step before commit.
  -- private.charge_message_insertion_quota serializes this sender's charges
  -- until commit and reads the window after that lock, so the count is exact
  -- at a quota boundary and across a window rollover. Refused or uncheckable →
  -- raise: the whole insertion (and this counter increment) rolls back and
  -- nothing is stored.
  if p_insert_quota_limit is not null then
    begin
      v_quota_allowed := private.charge_message_insertion_quota(
        p_sender_id, p_insert_quota_limit, p_insert_quota_window_seconds);
    exception when others then
      raise exception 'RATE_LIMIT_UNAVAILABLE'
        using errcode = 'P0001', detail = pg_catalog.format('%s: %s', sqlstate, sqlerrm);
    end;
    if v_quota_allowed is distinct from true then
      raise exception 'RATE_LIMITED' using errcode = 'P0001';
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'message_id', v_message_id,
    'created', true,
    'composition', p_composition,
    'message', pg_catalog.to_jsonb(v_row)
  );
end
$$;

comment on function public.create_message_attempt(uuid, uuid, text, text, uuid, uuid, bigint, jsonb, uuid[], integer, integer) is
  'Phase 5 T2/T3: creates a text message (keyed or not), or a message with 1-5 pending uploads of its sender (Phase 4 T12/T15 rules), committing only when the attempt generation is current for (sender, conversation, key) at commit time (a generation-less keyed create only when no fence state exists). A winning insertion charges the sender''s ''message:create'' insertion quota (p_insert_quota_limit per p_insert_quota_window_seconds; both NULL = no charge) in the same transaction: RATE_LIMITED (quota exhausted) or RATE_LIMIT_UNAVAILABLE (charge failed) roll it back. Returns {message_id, created, composition, message}; message is the created row (created=true only); created=false is a replay (never charged). Raises NOT_PARTICIPANT (42501) for a non-member sender, ATTEMPT_SUPERSEDED when fenced and MESSAGE_DELETED when a generation-carrying create would recreate a deleted message. Service role only; callers authorize the sender and validate the attachment policy first.';

revoke all on function public.create_message_attempt(uuid, uuid, text, text, uuid, uuid, bigint, jsonb, uuid[], integer, integer)
  from public, anon, authenticated;
grant execute on function public.create_message_attempt(uuid, uuid, text, text, uuid, uuid, bigint, jsonb, uuid[], integer, integer)
  to service_role;

-- ============================================================================
-- Phase 4 signature (older server builds): same contract, no quota charge here
-- (those servers charge 'message:create' at their route for every create).
-- ============================================================================
create or replace function public.create_message_with_attachments(
  p_conversation_id uuid,
  p_sender_id uuid,
  p_content text,
  p_type text,
  p_reply_to_id uuid,
  p_client_message_id uuid,
  p_upload_ids uuid[]
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_conversation_id is null or p_sender_id is null or p_content is null or p_type is null then
    raise exception 'create_message_with_attachments: conversation, sender, content and type are required'
      using errcode = '22004';
  end if;
  if coalesce(pg_catalog.cardinality(p_upload_ids), 0) < 1 then
    raise exception 'ATTACHMENT_COUNT_INVALID' using errcode = '22023';
  end if;

  return public.create_message_attempt(
    p_conversation_id, p_sender_id, p_content, p_type, p_reply_to_id,
    p_client_message_id, null, null, p_upload_ids, null, null
  ) - 'composition' - 'message';
end
$$;

comment on function public.create_message_with_attachments(uuid, uuid, text, text, uuid, uuid, uuid[]) is
  'Phase 4 T12/T15 signature (kept for older builds): delegates to create_message_attempt without an attempt generation (Phase 5 T2, D4) and without an insertion-quota charge (Phase 5 T3: the calling Phase 4 route charges it). Returns {message_id, created}. Service role only.';

revoke all on function public.create_message_with_attachments(uuid, uuid, text, text, uuid, uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.create_message_with_attachments(uuid, uuid, text, text, uuid, uuid, uuid[])
  to service_role;

commit;
