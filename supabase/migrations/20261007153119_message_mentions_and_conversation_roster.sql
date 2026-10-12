-- Phase 5 T4 / FR-023 (roster), FR-024, BR-010, AC-024, AC-046, AC-035
-- (spec-interview/phase-5-messaging-resilience): server-validated atomic
-- @mentions and the current-member roster.
--
-- Mentions (FR-024, BR-010):
--   * public.message_mentions (message_id, mentioned_user_id = users.id) holds
--     the application users a message mentions. The application's only write
--     path is public.create_message_attempt (no route or repository inserts
--     mentions any other way), inside the transaction of the message's
--     first creation (every message insert of this build runs there since T3:
--     keyed text, unkeyed text, attachments/voice, and the Phase 4 wrapper),
--     right after the INSERT and the attachment links and before the
--     commit-time fence check and the insertion-quota charge: if the mention
--     insert fails, or the attempt is fenced or over quota afterwards, the
--     whole create rolls back (no message, no attachment link, no mention, no
--     quota charge).
--   * The requested ids travel in the stored ORIGINAL composition
--     (p_composition -> 'mentionIds', route-normalized: lowercase, distinct,
--     sorted, at most 50 UUIDs). A mention row is created only for ids that are
--     conversation_members of the conversation at that moment and are not the
--     sender; every other requested id (non-member, outsider, unknown, the
--     sender) creates nothing but stays in the stored composition, so a replay
--     is compared against what was requested (the route answers 409
--     CLIENT_MESSAGE_ID_REUSED when the requested mention set differs, and 200
--     with the stored message for an unchanged replay — membership is not
--     re-validated on replay, so a recipient removed since does not turn an
--     unchanged replay into a refusal, and no mention is added or removed).
--     Replays and lost same-key races never write mentions.
--   * Absent vs empty (decision recorded for T4): a composition without a
--     'mentionIds' key (every composition stored before this migration, and
--     every request without mentions) means "no mention requested", exactly
--     like an empty array. Phase 4 replays of pre-T4 keyed messages therefore
--     still answer 200; a replay that now requests mentions for such a message
--     answers 409. Without a composition (keyed messages created before T2, or
--     by a raw insert) a replay matches only when it requests no mention.
--   * Mentions require a client key (the route refuses mentionIds without
--     clientMessageId), so unkeyed creates (hosted pre-Phase-4 client) and the
--     Phase 4 wrapper (null composition) never write mentions.
--   * create_message_attempt keeps its T3 signature; its result gains
--     'mentioned_user_ids' (sorted ids actually stored) on a winning
--     insertion. public.create_message_with_attachments (Phase 4 signature)
--     now builds its {message_id, created} result explicitly, so no new key of
--     the inner result ever reaches a Phase 4 server (same output as before).
--   * Read: RLS SELECT for authenticated conversation members only (same rule
--     as message_attachments / message_reactions: the mention's message is in
--     a conversation the caller belongs to). anon holds no privilege;
--     authenticated holds SELECT only, and there is no INSERT/UPDATE/DELETE
--     policy, so no client can write, change or delete a mention. service_role
--     holds SELECT and INSERT because create_message_attempt is SECURITY
--     INVOKER and runs as service_role (called by the create route after it
--     authorized the sender). Trusted boundary (same as public.messages and
--     message_attachments): service_role bypasses RLS and could also insert a
--     mention row directly; the membership and not-the-sender rules are
--     enforced inside create_message_attempt, not by a table constraint, so
--     only server code that goes through that function may write mentions
--     (service_role never reaches a client). No UPDATE or DELETE is granted to
--     any API role.
--     Deleting a message or a user cascades to its mentions (referential
--     actions run as the table owner). The table is NOT added to the Realtime
--     publication (Realtime payloads unchanged).
--   * Bulk read: public.list_message_mentions(message_ids uuid[]) returns ONE
--     jsonb object {message_id: [mentioned user ids, sorted]} for up to 1000
--     message ids (MESSAGE_IDS_INVALID otherwise). One scalar value cannot be
--     cut by PostgREST's max-rows (a row-returning read of a 100-message page
--     with more than 1000 mentions would be silently truncated; review T4 r1
--     finding 1). SECURITY INVOKER: under an authenticated session the mention
--     RLS above applies (only conversations the caller belongs to); EXECUTE
--     for authenticated and service_role.
--
-- Roster (FR-023): public.list_conversation_members(conversation_id) returns,
-- to a caller that is itself a current member, ONE jsonb array of
-- {user_id, display_name, avatar_url} (ordered by display name, then user id)
-- for every CURRENT member of the conversation (public.conversation_members,
-- so a removed member is excluded). It is a single value, so PostgREST's
-- max-rows cannot drop members (review T4 r1 finding 2). Anyone else
-- (non-member, missing conversation, no app user) gets NOT_PARTICIPANT (42501). SECURITY
-- DEFINER (conversation_members RLS is own-row only), search_path '', caller
-- resolved with private.current_app_user_id() (users.supabase_uid =
-- auth.uid()::text). EXECUTE: authenticated only.
--
-- Security: every function is search_path '' with schema-qualified
-- references; EXECUTE revoked from public, anon and authenticated (Supabase
-- default privileges grant it on new functions) and granted explicitly
-- (create_message_attempt / wrapper: service_role; roster: authenticated;
-- list_message_mentions: authenticated, service_role).
-- Table privileges on public.message_mentions are revoked from every API role
-- and granted explicitly (default privileges grant all on new public tables).
--
-- Backward compatible (SPEC section 10): no change to public.messages, its
-- policies, triggers or Realtime payloads; no change to any function
-- signature; unkeyed creates and generation-less (Phase 4) keyed creates,
-- replays (200) and 409s behave as before; the wrapper's result is unchanged.
--
-- Locking: CREATE TABLE with foreign keys takes SHARE ROW EXCLUSIVE on
-- public.messages and public.users until COMMIT (message writes wait for the
-- rest of this short transaction: no scan, no backfill); function and grant
-- changes only touch catalog rows. lock_timeout bounds each lock wait (re-run
-- on timeout). Transactional and re-runnable (if not exists / drop policy if
-- exists / create or replace / idempotent revoke and grant).
--
-- Rollback (order, SPEC BR-014): FIRST roll the application back to a build
-- that neither reads public.message_mentions nor calls
-- list_conversation_members (the T3 build or any earlier one), THEN run this
-- SQL as-is. While no Phase 5 build is deployed against the target the app
-- step is a no-op. Stored mention rows are DELETED with the table
-- (irreversible); stored compositions keep their 'mentionIds' key, which the
-- T3 build ignores when comparing replays.
--   begin;
--   set local lock_timeout = '5s';
--   drop function if exists public.list_conversation_members(uuid);
--   drop function if exists public.list_message_mentions(uuid[]);
--   drop table if exists public.message_mentions;
--   -- Phase 5 T3 bodies (20261007114454), verbatim:
--   create or replace function public.create_message_attempt(
--     p_conversation_id uuid,
--     p_sender_id uuid,
--     p_content text,
--     p_type text,
--     p_reply_to_id uuid,
--     p_client_message_id uuid,
--     p_attempt_generation bigint,
--     p_composition jsonb,
--     p_upload_ids uuid[],
--     p_insert_quota_limit integer,
--     p_insert_quota_window_seconds integer
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
--     v_quota_allowed boolean;
--     v_row public.messages%rowtype;
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
--     -- Phase 5 T3: both NULL (no charge: callers that charged elsewhere) or both
--     -- positive.
--     if (p_insert_quota_limit is null) <> (p_insert_quota_window_seconds is null)
--        or p_insert_quota_limit < 1
--        or p_insert_quota_window_seconds < 1 then
--       raise exception 'INSERT_QUOTA_INVALID' using errcode = '22023';
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
--       -- Explicit marker (Phase 5 T3): callers map only this to NOT_PARTICIPANT.
--       raise exception 'NOT_PARTICIPANT' using errcode = '42501';
--     end if;
--
--     -- Replay of a key whose create already committed: answer with the stored
--     -- message and link nothing (its uploads were consumed by the first create).
--     -- Checked before the reply target: an unchanged replay is compared against
--     -- the original composition, not re-validated (FR-024), so a reply target
--     -- deleted since does not turn it into a refusal. Not an insertion: the
--     -- insertion quota is not charged (Phase 5 T3, D1).
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
--     returning * into v_row;
--     perform pg_catalog.set_config('virtual_office.create_message_attempt_id', '', true);
--     -- Phase 5 T3: the inserted row (all fields null after a lost same-key race)
--     -- is returned to the caller from this transaction.
--     v_message_id := v_row.id;
--
--     if v_message_id is null then
--       -- Lost the race on the same key: the winner's message is committed. Not
--       -- an insertion: the insertion quota is not charged.
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
--     -- Commit-time fence check (see the T2 migration header): lock the key row
--     -- only now, after the INSERT, and hold it until commit.
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
--     -- Phase 5 T3 (FR-008, D1): the insertion quota, charged by this winning
--     -- insertion in its own transaction, as the last step before commit.
--     -- private.charge_message_insertion_quota serializes this sender's charges
--     -- until commit and reads the window after that lock, so the count is exact
--     -- at a quota boundary and across a window rollover. Refused or uncheckable →
--     -- raise: the whole insertion (and this counter increment) rolls back and
--     -- nothing is stored.
--     if p_insert_quota_limit is not null then
--       begin
--         v_quota_allowed := private.charge_message_insertion_quota(
--           p_sender_id, p_insert_quota_limit, p_insert_quota_window_seconds);
--       exception when others then
--         raise exception 'RATE_LIMIT_UNAVAILABLE'
--           using errcode = 'P0001', detail = pg_catalog.format('%s: %s', sqlstate, sqlerrm);
--       end;
--       if v_quota_allowed is distinct from true then
--         raise exception 'RATE_LIMITED' using errcode = 'P0001';
--       end if;
--     end if;
--
--     return pg_catalog.jsonb_build_object(
--       'message_id', v_message_id,
--       'created', true,
--       'composition', p_composition,
--       'message', pg_catalog.to_jsonb(v_row)
--     );
--   end
--   $$;
--
--   comment on function public.create_message_attempt(uuid, uuid, text, text, uuid, uuid, bigint, jsonb, uuid[], integer, integer) is
--     'Phase 5 T2/T3: creates a text message (keyed or not), or a message with 1-5 pending uploads of its sender (Phase 4 T12/T15 rules), committing only when the attempt generation is current for (sender, conversation, key) at commit time (a generation-less keyed create only when no fence state exists). A winning insertion charges the sender''s ''message:create'' insertion quota (p_insert_quota_limit per p_insert_quota_window_seconds; both NULL = no charge) in the same transaction: RATE_LIMITED (quota exhausted) or RATE_LIMIT_UNAVAILABLE (charge failed) roll it back. Returns {message_id, created, composition, message}; message is the created row (created=true only); created=false is a replay (never charged). Raises NOT_PARTICIPANT (42501) for a non-member sender, ATTEMPT_SUPERSEDED when fenced and MESSAGE_DELETED when a generation-carrying create would recreate a deleted message. Service role only; callers authorize the sender and validate the attachment policy first.';
--
--   revoke all on function public.create_message_attempt(uuid, uuid, text, text, uuid, uuid, bigint, jsonb, uuid[], integer, integer)
--     from public, anon, authenticated;
--   grant execute on function public.create_message_attempt(uuid, uuid, text, text, uuid, uuid, bigint, jsonb, uuid[], integer, integer)
--     to service_role;
--
--   -- ============================================================================
--   -- Phase 4 signature (older server builds): same contract, no quota charge here
--   -- (those servers charge 'message:create' at their route for every create).
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
--       p_client_message_id, null, null, p_upload_ids, null, null
--     ) - 'composition' - 'message';
--   end
--   $$;
--
--   comment on function public.create_message_with_attachments(uuid, uuid, text, text, uuid, uuid, uuid[]) is
--     'Phase 4 T12/T15 signature (kept for older builds): delegates to create_message_attempt without an attempt generation (Phase 5 T2, D4) and without an insertion-quota charge (Phase 5 T3: the calling Phase 4 route charges it). Returns {message_id, created}. Service role only.';
--
--   revoke all on function public.create_message_with_attachments(uuid, uuid, text, text, uuid, uuid, uuid[])
--     from public, anon, authenticated;
--   grant execute on function public.create_message_with_attachments(uuid, uuid, text, text, uuid, uuid, uuid[])
--     to service_role;
--   delete from supabase_migrations.schema_migrations where version = '20261007153119';
--   commit;

begin;

set local lock_timeout = '5s';

-- ============================================================================
-- Mention store: users (users.id) a message mentions. Written only by
-- public.create_message_attempt; readable by conversation members only.
-- ============================================================================
create table if not exists public.message_mentions (
  message_id uuid not null references public.messages (id) on delete cascade,
  mentioned_user_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint message_mentions_pkey primary key (message_id, mentioned_user_id)
);

comment on table public.message_mentions is
  'Phase 5 T4 (FR-024): application users (users.id) mentioned by a message, written in the transaction of the message''s first creation by public.create_message_attempt, only for conversation members other than the sender at that time. Members of the message''s conversation can read them; no client can write them.';

-- users cascade and "mentions of a user" reads; message_id lookups use the
-- primary key.
create index if not exists idx_message_mentions_mentioned_user_id
  on public.message_mentions (mentioned_user_id);

alter table public.message_mentions enable row level security;

revoke all on table public.message_mentions from public, anon, authenticated, service_role;
grant select on table public.message_mentions to authenticated;
grant select, insert on table public.message_mentions to service_role;

drop policy if exists "read_mentions_in_own_conversations" on public.message_mentions;
create policy "read_mentions_in_own_conversations" on public.message_mentions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.messages m
      where m.id = message_mentions.message_id
        and private.is_conversation_member(m.conversation_id)
    )
  );

-- ============================================================================
-- Fenced create (T3 body) + mentions written with the first creation.
-- ============================================================================
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
  v_mention_ids uuid[] := '{}'::uuid[];
  v_mentioned uuid[] := '{}'::uuid[];
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

  -- Phase 5 T4 (FR-024): requested mention ids come from the original
  -- composition (absent key = none requested). At most 50 UUID strings.
  if p_composition is not null and p_composition ? 'mentionIds' then
    if pg_catalog.jsonb_typeof(p_composition -> 'mentionIds') <> 'array'
       or pg_catalog.jsonb_array_length(p_composition -> 'mentionIds') > 50
       or exists (
         select 1
         from pg_catalog.jsonb_array_elements(p_composition -> 'mentionIds') as e(v)
         where pg_catalog.jsonb_typeof(e.v) <> 'string'
            or (e.v #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       ) then
      raise exception 'MENTION_IDS_INVALID' using errcode = '22023';
    end if;
    select coalesce(pg_catalog.array_agg(distinct (e.v #>> '{}')::uuid), '{}'::uuid[])
    into v_mention_ids
    from pg_catalog.jsonb_array_elements(p_composition -> 'mentionIds') as e(v);
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
  -- insertion quota is not charged (Phase 5 T3, D1), and no mention is
  -- written or re-validated (Phase 5 T4).
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
    -- an insertion: the insertion quota is not charged and no mention is
    -- written.
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

  -- Phase 5 T4 (FR-024, BR-010): mentions of the first creation, in this
  -- transaction: only requested ids that are members of the conversation now
  -- and are not the sender. A failure here rolls the whole create back.
  if pg_catalog.cardinality(v_mention_ids) > 0 then
    with inserted as (
      insert into public.message_mentions (message_id, mentioned_user_id)
      select v_message_id, cm.user_id
      from public.conversation_members cm
      where cm.conversation_id = p_conversation_id
        and cm.user_id = any (v_mention_ids)
        and cm.user_id <> p_sender_id
      on conflict (message_id, mentioned_user_id) do nothing
      returning mentioned_user_id
    )
    select coalesce(pg_catalog.array_agg(i.mentioned_user_id order by i.mentioned_user_id), '{}'::uuid[])
    into v_mentioned
    from inserted i;
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
    'message', pg_catalog.to_jsonb(v_row),
    'mentioned_user_ids', pg_catalog.to_jsonb(v_mentioned)
  );
end
$$;

comment on function public.create_message_attempt(uuid, uuid, text, text, uuid, uuid, bigint, jsonb, uuid[], integer, integer) is
  'Phase 5 T2/T3/T4: creates a text message (keyed or not), or a message with 1-5 pending uploads of its sender (Phase 4 T12/T15 rules), committing only when the attempt generation is current for (sender, conversation, key) at commit time (a generation-less keyed create only when no fence state exists). In the same transaction it stores the mentions requested in p_composition->''mentionIds'' (at most 50 UUIDs; only current members other than the sender; MENTION_IDS_INVALID otherwise) and, for a winning insertion, charges the sender''s ''message:create'' insertion quota (p_insert_quota_limit per p_insert_quota_window_seconds; both NULL = no charge): RATE_LIMITED (quota exhausted) or RATE_LIMIT_UNAVAILABLE (charge failed) roll it back. Returns {message_id, created, composition, message, mentioned_user_ids}; message and mentioned_user_ids describe the created row (created=true only); created=false is a replay (never charged, no mention written). Raises NOT_PARTICIPANT (42501) for a non-member sender, ATTEMPT_SUPERSEDED when fenced and MESSAGE_DELETED when a generation-carrying create would recreate a deleted message. Service role only; callers authorize the sender and validate the attachment policy first.';

revoke all on function public.create_message_attempt(uuid, uuid, text, text, uuid, uuid, bigint, jsonb, uuid[], integer, integer)
  from public, anon, authenticated;
grant execute on function public.create_message_attempt(uuid, uuid, text, text, uuid, uuid, bigint, jsonb, uuid[], integer, integer)
  to service_role;

-- ============================================================================
-- Phase 4 signature (older server builds): same contract and result; the
-- result is now built explicitly so no new key of the inner result leaks.
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
declare
  v_result jsonb;
begin
  if p_conversation_id is null or p_sender_id is null or p_content is null or p_type is null then
    raise exception 'create_message_with_attachments: conversation, sender, content and type are required'
      using errcode = '22004';
  end if;
  if coalesce(pg_catalog.cardinality(p_upload_ids), 0) < 1 then
    raise exception 'ATTACHMENT_COUNT_INVALID' using errcode = '22023';
  end if;

  v_result := public.create_message_attempt(
    p_conversation_id, p_sender_id, p_content, p_type, p_reply_to_id,
    p_client_message_id, null, null, p_upload_ids, null, null
  );
  return pg_catalog.jsonb_build_object(
    'message_id', v_result -> 'message_id',
    'created', v_result -> 'created'
  );
end
$$;

comment on function public.create_message_with_attachments(uuid, uuid, text, text, uuid, uuid, uuid[]) is
  'Phase 4 T12/T15 signature (kept for older builds): delegates to create_message_attempt without an attempt generation (Phase 5 T2, D4), without a composition (so without mentions, Phase 5 T4) and without an insertion-quota charge (Phase 5 T3: the calling Phase 4 route charges it). Returns exactly {message_id, created}. Service role only.';

revoke all on function public.create_message_with_attachments(uuid, uuid, text, text, uuid, uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.create_message_with_attachments(uuid, uuid, text, text, uuid, uuid, uuid[])
  to service_role;

-- ============================================================================
-- Bulk mention read: one jsonb value (never truncated by max-rows).
-- ============================================================================
create or replace function public.list_message_mentions(p_message_ids uuid[])
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_message_ids is null then
    raise exception 'list_message_mentions: message ids are required' using errcode = '22004';
  end if;
  if pg_catalog.cardinality(p_message_ids) > 1000 then
    raise exception 'MESSAGE_IDS_INVALID' using errcode = '22023';
  end if;

  -- RLS on public.message_mentions applies to the invoker (members only).
  select coalesce(pg_catalog.jsonb_object_agg(g.message_id, g.mentioned_user_ids), '{}'::jsonb)
  into v_result
  from (
    select mm.message_id,
           pg_catalog.jsonb_agg(mm.mentioned_user_id order by mm.mentioned_user_id) as mentioned_user_ids
    from public.message_mentions mm
    where mm.message_id = any (p_message_ids)
    group by mm.message_id
  ) as g;
  return v_result;
end
$$;

comment on function public.list_message_mentions(uuid[]) is
  'Phase 5 T4 (FR-024): mentioned users (users.id, sorted) of up to 1000 messages as one jsonb object {message_id: [user ids]} (messages without mentions are absent). SECURITY INVOKER: mention RLS limits an authenticated caller to conversations it belongs to. Authenticated and service_role.';

revoke all on function public.list_message_mentions(uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.list_message_mentions(uuid[]) to authenticated, service_role;

-- ============================================================================
-- Current-member roster (FR-023), for current members only.
-- ============================================================================
-- Re-runnable: an earlier local revision returned a table.
drop function if exists public.list_conversation_members(uuid);
create function public.list_conversation_members(p_conversation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller uuid;
  v_members jsonb;
begin
  if p_conversation_id is null then
    raise exception 'list_conversation_members: conversation is required' using errcode = '22004';
  end if;

  -- users.supabase_uid = auth.uid()::text → users.id.
  v_caller := private.current_app_user_id();
  if v_caller is null or not exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.user_id = v_caller
  ) then
    raise exception 'NOT_PARTICIPANT' using errcode = '42501';
  end if;

  select coalesce(
           pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object(
               'user_id', cm.user_id,
               'display_name', u.display_name,
               'avatar_url', u.avatar_url
             )
             order by u.display_name nulls last, cm.user_id
           ),
           '[]'::jsonb
         )
  into v_members
  from public.conversation_members cm
  join public.users u on u.id = cm.user_id
  where cm.conversation_id = p_conversation_id;
  return v_members;
end
$$;

comment on function public.list_conversation_members(uuid) is
  'Phase 5 T4 (FR-023): current members (public.conversation_members) of a conversation with their display name and avatar, as one jsonb array of {user_id, display_name, avatar_url} (never truncated by max-rows), for a caller (auth.uid() → users.supabase_uid → users.id) who is a current member; NOT_PARTICIPANT (42501) otherwise. Authenticated only.';

revoke all on function public.list_conversation_members(uuid) from public, anon, authenticated, service_role;
grant execute on function public.list_conversation_members(uuid) to authenticated;

commit;
