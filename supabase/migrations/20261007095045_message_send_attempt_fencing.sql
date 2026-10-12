-- Phase 5 T2 / FR-006, FR-011, FR-024 (storage), FR-034, BR-001, BR-004,
-- BR-005, AC-044, AC-045, AC-046, AC-035
-- (spec-interview/phase-5-messaging-resilience): server attempt fencing for
-- keyed message creates.
--
-- Model. Every keyed send (messages.client_message_id, migration
-- 20261005000414) is identified by (sender_id, conversation_id,
-- client_message_id). A Phase 5 client dispatches each try of a key as an
-- ATTEMPT with a monotonic generation (1, 2, ...). The server keeps, per key,
-- one row in private.message_send_attempts:
--   * fence_generation: the highest generation seen from a fence call or a
--     generation-carrying create; NULL = no fence state (D4).
--   * committed_at / message_id: the key's DELIVERY RECORD — when a message
--     was last committed under the key and that message (SET NULL when it is
--     deleted, committed_at kept). Written by every keyed insert path (the
--     fenced create, the raw-insert trigger), by a fence or replay that finds
--     an untracked stored message, and backfilled here for keyed messages
--     created before this migration (messages already deleted before it leave
--     no record: a fence then reports not_stored and a newer attempt may
--     create the message again).
--   * composition: the ORIGINAL submitted composition of the committed message
--     (normalized by the route: trimmed content, effective type or null for
--     attachment messages, reply target, sorted attachment ids; T4 adds sorted
--     requested mention ids). Replays are compared against it; rows without one
--     (messages created before this migration or by a raw insert) fall back to
--     the stored message.
--
-- Functions (service_role only; the routes authorize the caller first):
--   * public.fence_message_attempt(sender, conversation, key, generation):
--     locks the key row (creating it when absent) and, in that transaction,
--     returns 'superseded' when generation < fence_generation (nothing is
--     written); otherwise raises fence_generation to the given generation and
--     returns 'stored' + message_id when the key's message is committed
--     (recording its delivery when untracked), 'stored' with a null message_id
--     when the key's delivered message was deleted since (so a client never
--     resends a message its sender deleted), else 'not_stored'. It never
--     creates a message. The create route calls it first for every
--     generation-carrying create, so a newer attempt that has reached the
--     server fences every older generation before its INSERT.
--   * public.create_message_attempt(...): creates a keyed text message, or a
--     message (keyed or not) with 1-5 pending uploads (the former body of
--     create_message_with_attachments, Phase 4 T12/T15). After the INSERT —
--     i.e. immediately before commit, because PostgREST commits as soon as the
--     function returns — it locks the key row and refuses to commit
--     (ATTEMPT_SUPERSEDED, whole transaction rolled back: no message, no
--     attachment link, uploads stay pending) when
--       - the create carries a generation lower than fence_generation, or
--       - the create carries no generation (Phase 4 client) and fence state
--         exists for the key (D4);
--     and it refuses a generation-carrying create (MESSAGE_DELETED, rolled
--     back) when the key's delivered message was deleted since, so an outbox
--     retry never resurrects a message its sender deleted (a generation-less
--     create keeps the Phase 4 behavior and creates it again); otherwise it
--     records the delivery, the composition and (for a generation-carrying
--     create) the generation, then commits. A replay of an already-stored key
--     is not an insertion: it returns the stored message id and composition
--     (created=false) and records an untracked delivery; a generation-carrying
--     replay older than fence_generation raises ATTEMPT_SUPERSEDED; a
--     generation-less replay always answers like Phase 4.
--   * public.create_message_with_attachments (Phase 4 signature, kept for
--     older builds) now delegates to create_message_attempt without a
--     generation or composition, so it obeys the same D4 rule.
--
-- Keyed writes outside the fenced contract (review T2 r1 finding 1):
--   * send_message_as_self (client INSERT under RLS) additionally requires
--     client_message_id IS NULL: clients cannot insert keyed messages
--     directly (unkeyed client inserts keep their previous policy; no shipped
--     build inserts messages from the browser — every build creates through
--     the service-role create route).
--   * trigger messages_client_message_id_immutable (BEFORE UPDATE OF
--     client_message_id, conversation_id, sender_id): no role may set, change
--     or clear a key after insert, nor move a keyed message to another
--     conversation or sender (42501 CLIENT_MESSAGE_ID_IMMUTABLE); the sender
--     FK's ON DELETE SET NULL stays allowed. No shipped build updates these
--     columns; message edits update content/status/is_edited only.
--   * trigger messages_keyed_insert_fence (AFTER INSERT, keyed rows with a
--     sender): a keyed insert that did not come from create_message_attempt —
--     e.g. a Phase 4 server's direct service-role insert overlapping with this
--     build — commits only while the key has no fence state (else
--     ATTEMPT_SUPERSEDED, rolled back) and records its delivery under the key
--     lock. create_message_attempt marks its own INSERT with a pre-generated
--     id in the transaction-local setting
--     virtual_office.create_message_attempt_id (cleared right after), which the
--     trigger skips because that function performs the check itself.
--
-- Why the key row is locked AFTER the INSERT: a create blocked inside its
-- INSERT (e.g. on a row lock held elsewhere) must not block a fence. The fence
-- takes the key row lock, records the newer generation, sees no committed
-- message and commits; the blocked create, once released, takes the same lock,
-- reads the newer generation and rolls back. Conversely, a create that already
-- holds the key row lock keeps it until commit, so a concurrent fence waits
-- and then (new READ COMMITTED snapshot per statement) sees the committed
-- message. Fencing a tracked key never waits on message rows (repairing an
-- untracked delivery may wait on its message row through the FK check). Either
-- way at most one message
-- is stored per key and a fenced attempt never commits (BR-004). Rows are
-- created with INSERT ... ON CONFLICT DO NOTHING followed by SELECT ... FOR
-- UPDATE, so two transactions that both find no row still serialize.
--
-- Backward compatible (SPEC section 10):
--   * no new column on public.messages and no publication change: Realtime
--     INSERT payloads keep their Phase 4 shape (client_message_id already
--     present since 20261005000414);
--   * unkeyed creates (hosted pre-Phase-4 client, service-role insert) are
--     untouched by both triggers (WHEN clauses) and the narrowed policy;
--   * keyed creates without a generation (Phase 4 client, through this or a
--     Phase 4 server) keep create, replay 200 and 409; they create no fence
--     state, so their own retries are never refused; they only lose
--     (ATTEMPT_SUPERSEDED, nothing stored) when a fence or a generation-
--     carrying request created fence state for the same key, which only a
--     Phase 5 client does;
--   * create_message_with_attachments keeps its signature, ACL, validation
--     errors and {message_id, created} result.
--
-- Security: the table lives in the non-exposed private schema with RLS on and
-- no policy; anon/authenticated hold no privilege on it (authenticated has
-- USAGE on private for private.current_app_user_id), so clients cannot read
-- or write attempt state. service_role gets SELECT/INSERT/UPDATE for the
-- SECURITY INVOKER functions and triggers (only service_role and the owner can
-- insert keyed messages). The new functions are revoked from public, anon and
-- authenticated (Supabase default privileges grant them EXECUTE on new public
-- functions) and granted to service_role only (trigger functions to nobody).
-- Both public functions re-check conversation membership (42501) as defense
-- in depth.
--
-- Locking: CREATE TABLE with foreign keys takes SHARE ROW EXCLUSIVE on users,
-- conversations and messages, and ALTER POLICY / CREATE TRIGGER take ACCESS
-- EXCLUSIVE / SHARE ROW EXCLUSIVE on messages; all are held until COMMIT, so
-- message reads and writes wait for the rest of the transaction. To keep that
-- short, the full backfill scan of keyed messages runs BEFORE the policy and
-- trigger changes, which come last, followed only by a delta backfill (the
-- same statement; it still reads every keyed message, through the partial
-- unique index). Check the number of keyed messages on the target before the
-- apply (select count(*) from public.messages where client_message_id is not
-- null) — with no Phase 4 build deployed it is expected to be about 0.
-- lock_timeout bounds only the wait to acquire each lock; the migration fails
-- fast instead of queueing message traffic; re-run it when that happens.
-- CREATE OR REPLACE FUNCTION and GRANT/REVOKE only touch catalog rows.
-- Transactional and re-runnable (if not exists / create or replace /
-- drop-create trigger / idempotent policy, backfill, revoke and grant).
--
-- Rollback (order, SPEC BR-014: roll the application back to a build that
-- does not call fence_message_attempt / create_message_attempt FIRST, then run
-- this SQL as-is; while no Phase 5 build is deployed against the target the
-- app step is a no-op). Fence state, delivery records and stored compositions
-- are discarded; keyed replays fall back to comparing the stored message
-- (Phase 4); clients regain direct keyed inserts and key updates as before.
--   begin;
--   set local lock_timeout = '5s';
--   drop trigger if exists messages_keyed_insert_fence on public.messages;
--   drop trigger if exists messages_client_message_id_immutable on public.messages;
--   alter policy "send_message_as_self" on public.messages
--     with check (
--       (sender_id = (select private.current_app_user_id()))
--       and private.is_conversation_member(conversation_id)
--       and content <> ''
--     );
--   -- Phase 4 T15 body of create_message_with_attachments (20261005141134).
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
--   declare
--     v_count integer;
--     v_locked integer;
--     v_voice integer;
--     v_message_id uuid;
--   begin
--     if p_conversation_id is null or p_sender_id is null or p_content is null or p_type is null then
--       raise exception 'create_message_with_attachments: conversation, sender, content and type are required'
--         using errcode = '22004';
--     end if;
--
--     v_count := coalesce(pg_catalog.cardinality(p_upload_ids), 0);
--     -- Same bound as the route's attachment policy (5 per message).
--     if v_count < 1 or v_count > 5 then
--       raise exception 'ATTACHMENT_COUNT_INVALID' using errcode = '22023';
--     end if;
--     if (select pg_catalog.count(distinct u) from pg_catalog.unnest(p_upload_ids) as u) <> v_count then
--       raise exception 'ATTACHMENT_DUPLICATE' using errcode = '22023';
--     end if;
--
--     -- Attachment messages are typed image or file (the only types allowed to
--     -- carry empty content).
--     if p_type not in ('image', 'file') then
--       raise exception 'create_message_with_attachments: type must be image or file'
--         using errcode = '22023';
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
--     -- Defense in depth: the route already required membership.
--     if not exists (
--       select 1
--       from public.conversation_members cm
--       where cm.conversation_id = p_conversation_id
--         and cm.user_id = p_sender_id
--     ) then
--       raise exception 'create_message_with_attachments: sender is not a member of the conversation'
--         using errcode = '42501';
--     end if;
--
--     -- Replay of a composition whose create already committed: answer with the
--     -- stored message and link nothing (its uploads were consumed by the first
--     -- create).
--     if p_client_message_id is not null then
--       select m.id into v_message_id
--       from public.messages m
--       where m.sender_id = p_sender_id
--         and m.conversation_id = p_conversation_id
--         and m.client_message_id = p_client_message_id;
--       if v_message_id is not null then
--         return pg_catalog.jsonb_build_object('message_id', v_message_id, 'created', false);
--       end if;
--     end if;
--
--     -- Lock the caller's pending uploads for this conversation (id order avoids
--     -- deadlocks between overlapping sets). A concurrent cancel or link of the
--     -- same upload waits here; once it commits the row is gone.
--     select pg_catalog.count(*), pg_catalog.count(*) filter (where locked.duration is not null)
--     into v_locked, v_voice
--     from (
--       select u.id, u.duration
--       from public.message_attachment_uploads u
--       where u.id = any (p_upload_ids)
--         and u.uploader_id = p_sender_id
--         and u.conversation_id = p_conversation_id
--       order by u.id
--       for update
--     ) as locked;
--
--     if v_locked <> v_count then
--       -- A concurrent create with the same key may have consumed them.
--       if p_client_message_id is not null then
--         select m.id into v_message_id
--         from public.messages m
--         where m.sender_id = p_sender_id
--           and m.conversation_id = p_conversation_id
--           and m.client_message_id = p_client_message_id;
--         if v_message_id is not null then
--           return pg_catalog.jsonb_build_object('message_id', v_message_id, 'created', false);
--         end if;
--       end if;
--       -- Unknown, foreign, other-conversation, cancelled, or already linked.
--       raise exception 'ATTACHMENT_UPLOAD_NOT_FOUND' using errcode = '22023';
--     end if;
--
--     -- Phase 4 T15: a voice note is the only attachment of its message, which is
--     -- typed file.
--     if v_voice > 0 and v_count > 1 then
--       raise exception 'VOICE_NOTE_NOT_ALONE' using errcode = '22023';
--     end if;
--     if v_voice > 0 and p_type <> 'file' then
--       raise exception 'create_message_with_attachments: a voice note message must be typed file'
--         using errcode = '22023';
--     end if;
--
--     insert into public.messages (conversation_id, sender_id, content, type, status, reply_to_id, client_message_id)
--     values (
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
--
--     if v_message_id is null then
--       -- Lost the race on the same key: the winner's message is committed.
--       select m.id into v_message_id
--       from public.messages m
--       where m.sender_id = p_sender_id
--         and m.conversation_id = p_conversation_id
--         and m.client_message_id = p_client_message_id;
--       return pg_catalog.jsonb_build_object('message_id', v_message_id, 'created', false);
--     end if;
--
--     insert into public.message_attachments (id, message_id, name, type, size, url, duration, waveform_data)
--     select u.id, v_message_id, u.name, u.type, u.size, u.storage_path, u.duration, u.waveform_data
--     from public.message_attachment_uploads u
--     where u.id = any (p_upload_ids);
--
--     delete from public.message_attachment_uploads u
--     where u.id = any (p_upload_ids);
--
--     return pg_catalog.jsonb_build_object('message_id', v_message_id, 'created', true);
--   end
--   $$;
--
--   comment on function public.create_message_with_attachments(uuid, uuid, text, text, uuid, uuid, uuid[]) is
--     'Phase 4 T12/T15: atomically creates a message and links 1-5 pending uploads of its sender for that conversation (a voice note alone, typed file, with its duration and waveform). Service role only; callers authorize the sender and validate the attachment policy first. Returns {message_id, created}; created=false is a replay of p_client_message_id.';
--
--   revoke all on function public.create_message_with_attachments(uuid, uuid, text, text, uuid, uuid, uuid[])
--     from public, anon, authenticated;
--   grant execute on function public.create_message_with_attachments(uuid, uuid, text, text, uuid, uuid, uuid[])
--     to service_role;
--   drop function if exists public.fence_message_attempt(uuid, uuid, uuid, bigint);
--   drop function if exists public.create_message_attempt(uuid, uuid, text, text, uuid, uuid, bigint, jsonb, uuid[]);
--   drop function if exists private.message_attempt_replay(uuid, uuid, uuid, bigint, uuid);
--   drop function if exists private.fence_raw_keyed_message_insert();
--   drop function if exists private.reject_client_message_id_change();
--   drop table if exists private.message_send_attempts;
--   delete from supabase_migrations.schema_migrations where version = '20261007095045';
--   commit;

begin;

set local lock_timeout = '5s';

-- ============================================================================
-- Attempt state per (sender, conversation, client key).
-- ============================================================================
create table if not exists private.message_send_attempts (
  sender_id uuid not null references public.users (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  client_message_id uuid not null,
  fence_generation bigint,
  committed_at timestamptz,
  message_id uuid references public.messages (id) on delete set null,
  composition jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint message_send_attempts_pkey primary key (sender_id, conversation_id, client_message_id),
  constraint message_send_attempts_generation_check check (fence_generation is null or fence_generation >= 1),
  constraint message_send_attempts_composition_check check (composition is null or jsonb_typeof(composition) = 'object')
);

comment on table private.message_send_attempts is
  'Phase 5 T2: attempt fencing state and delivery record per (sender_id = users.id, conversation_id, client_message_id). fence_generation NULL = no fence state. Written only by public.fence_message_attempt, public.create_message_attempt and the messages_keyed_insert_fence trigger (service_role / owner).';
comment on column private.message_send_attempts.fence_generation is
  'Highest attempt generation seen from a fence call or a generation-carrying create; creates with a lower generation (or without one, when set) cannot commit.';
comment on column private.message_send_attempts.committed_at is
  'Delivery record: when a message was last committed under this key (kept when the message is deleted). Backfilled from the message timestamp for keyed messages created before this migration.';
comment on column private.message_send_attempts.composition is
  'Original submitted composition of the message committed under this key (route-normalized JSON object); replays are compared against it.';

-- Cascades from conversations (the primary key already leads with sender_id
-- for the users cascade) and SET NULL from deleted messages.
create index if not exists idx_message_send_attempts_conversation_id
  on private.message_send_attempts (conversation_id);
create index if not exists idx_message_send_attempts_message_id
  on private.message_send_attempts (message_id)
  where message_id is not null;

alter table private.message_send_attempts enable row level security;

revoke all on table private.message_send_attempts from public, anon, authenticated;
grant select, insert, update on table private.message_send_attempts to service_role;

-- ============================================================================
-- Replay answer (internal): stored message id + its recorded composition.
-- A generation-carrying replay older than the key's fence generation is
-- refused; a generation-less replay always answers (Phase 4 contract).
-- ============================================================================
create or replace function private.message_attempt_replay(
  p_sender_id uuid,
  p_conversation_id uuid,
  p_client_message_id uuid,
  p_attempt_generation bigint,
  p_message_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_generation bigint;
  v_composition jsonb;
begin
  -- Delivery record (FR-006): a replay that finds a message the key row does
  -- not track yet records it under the key lock, so a later deletion is never
  -- mistaken for "not stored". A composition recorded for another message is
  -- discarded (it was not this message's).
  insert into private.message_send_attempts as a
    (sender_id, conversation_id, client_message_id, committed_at, message_id)
  values (p_sender_id, p_conversation_id, p_client_message_id, pg_catalog.now(), p_message_id)
  on conflict (sender_id, conversation_id, client_message_id) do update
    set message_id = excluded.message_id,
        committed_at = coalesce(a.committed_at, excluded.committed_at),
        composition = case when a.message_id = excluded.message_id then a.composition end,
        updated_at = pg_catalog.now()
    where a.message_id is distinct from excluded.message_id or a.committed_at is null;

  select a.fence_generation, case when a.message_id = p_message_id then a.composition end
  into v_generation, v_composition
  from private.message_send_attempts a
  where a.sender_id = p_sender_id
    and a.conversation_id = p_conversation_id
    and a.client_message_id = p_client_message_id;

  if p_attempt_generation is not null and v_generation is not null and p_attempt_generation < v_generation then
    raise exception 'ATTEMPT_SUPERSEDED' using errcode = 'P0001';
  end if;

  return pg_catalog.jsonb_build_object(
    'message_id', p_message_id,
    'created', false,
    'composition', v_composition
  );
end
$$;

comment on function private.message_attempt_replay(uuid, uuid, uuid, bigint, uuid) is
  'Phase 5 T2 internal helper of public.create_message_attempt: records the delivery of the stored message under the key and answers the replay. service_role only.';

revoke all on function private.message_attempt_replay(uuid, uuid, uuid, bigint, uuid)
  from public, anon, authenticated;
grant execute on function private.message_attempt_replay(uuid, uuid, uuid, bigint, uuid)
  to service_role;

-- ============================================================================
-- Fence / lookup.
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
    raise exception 'fence_message_attempt: sender is not a member of the conversation'
      using errcode = '42501';
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
  'Phase 5 T2: fence/lookup of the sender''s own client key. Returns {outcome: superseded|stored|not_stored, message_id (null when the stored message was deleted)}; never creates a message; makes every lower generation of the key unable to commit. Service role only; callers authorize the sender first.';

revoke all on function public.fence_message_attempt(uuid, uuid, uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.fence_message_attempt(uuid, uuid, uuid, bigint)
  to service_role;

-- ============================================================================
-- Fenced create (keyed text, or attachments with or without a key).
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
  p_upload_ids uuid[]
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
    raise exception 'create_message_attempt: sender is not a member of the conversation'
      using errcode = '42501';
  end if;

  -- Replay of a key whose create already committed: answer with the stored
  -- message and link nothing (its uploads were consumed by the first create).
  -- Checked before the reply target: an unchanged replay is compared against
  -- the original composition, not re-validated (FR-024), so a reply target
  -- deleted since does not turn it into a refusal.
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
  returning id into v_message_id;
  perform pg_catalog.set_config('virtual_office.create_message_attempt_id', '', true);

  if v_message_id is null then
    -- Lost the race on the same key: the winner's message is committed.
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

  -- Commit-time fence check (see header): lock the key row only now, after
  -- the INSERT, and hold it until commit.
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

  return pg_catalog.jsonb_build_object('message_id', v_message_id, 'created', true, 'composition', p_composition);
end
$$;

comment on function public.create_message_attempt(uuid, uuid, text, text, uuid, uuid, bigint, jsonb, uuid[]) is
  'Phase 5 T2: creates a keyed text message, or a message with 1-5 pending uploads of its sender (Phase 4 T12/T15 rules), committing only when the attempt generation is current for (sender, conversation, key) at commit time (a generation-less keyed create only when no fence state exists). Returns {message_id, created, composition}; created=false is a replay. Raises ATTEMPT_SUPERSEDED when fenced and MESSAGE_DELETED when a generation-carrying create would recreate a deleted message. Service role only; callers authorize the sender and validate the attachment policy first.';

revoke all on function public.create_message_attempt(uuid, uuid, text, text, uuid, uuid, bigint, jsonb, uuid[])
  from public, anon, authenticated;
grant execute on function public.create_message_attempt(uuid, uuid, text, text, uuid, uuid, bigint, jsonb, uuid[])
  to service_role;

-- ============================================================================
-- Phase 4 signature, kept for older builds: same contract, now fenced (D4).
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
    p_client_message_id, null, null, p_upload_ids
  ) - 'composition';
end
$$;

comment on function public.create_message_with_attachments(uuid, uuid, text, text, uuid, uuid, uuid[]) is
  'Phase 4 T12/T15 signature (kept for older builds): delegates to create_message_attempt without an attempt generation (Phase 5 T2, D4). Returns {message_id, created}. Service role only.';

revoke all on function public.create_message_with_attachments(uuid, uuid, text, text, uuid, uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.create_message_with_attachments(uuid, uuid, text, text, uuid, uuid, uuid[])
  to service_role;

-- ============================================================================
-- Backfill: delivery records for keyed messages created before this migration
-- (no fence state; their original composition is unavailable). It runs here,
-- BEFORE the policy and trigger changes below take their exclusive locks on
-- messages; on first application the foreign keys created above already hold
-- SHARE ROW EXCLUSIVE on messages, so message writes wait for this scan too
-- (see the lock warning in the header); the same statement runs
-- again after the trigger exists to catch keyed rows committed in between.
-- Messages deleted before this migration leave no record (unrecoverable).
-- ============================================================================
insert into private.message_send_attempts as a
  (sender_id, conversation_id, client_message_id, committed_at, message_id)
select m.sender_id, m.conversation_id, m.client_message_id, m.timestamp, m.id
from public.messages m
where m.client_message_id is not null
  and m.sender_id is not null
on conflict (sender_id, conversation_id, client_message_id) do update
  set message_id = excluded.message_id,
      committed_at = coalesce(a.committed_at, excluded.committed_at),
      composition = case when a.message_id = excluded.message_id then a.composition end,
      updated_at = pg_catalog.now()
  where a.message_id is distinct from excluded.message_id or a.committed_at is null;

-- ============================================================================
-- Keyed messages are written only through the fenced contract.
-- ============================================================================
-- Clients (authenticated, under RLS) may still insert their own UNKEYED
-- messages directly (no shipped build does; the policy is kept as it was), but
-- never a keyed one: a keyed create must go through POST /api/messages/create.
alter policy "send_message_as_self" on public.messages
  with check (
    (sender_id = (select private.current_app_user_id()))
    and private.is_conversation_member(conversation_id)
    and content <> ''
    and client_message_id is null
  );

-- No writer (clients, service role, owner) may set, change or clear a
-- message's key after it was inserted, nor move a keyed message to another
-- conversation or sender (which would carry the key outside its delivery
-- record): a key is only ever assigned by the INSERT that the fence guards. No
-- shipped build updates client_message_id, conversation_id or sender_id. The
-- sender FK's ON DELETE SET NULL (user deletion) stays allowed.
create or replace function private.reject_client_message_id_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'CLIENT_MESSAGE_ID_IMMUTABLE' using errcode = '42501';
end
$$;

comment on function private.reject_client_message_id_change() is
  'Phase 5 T2 trigger function: messages.client_message_id cannot change after insert, and a keyed message cannot move to another conversation or sender.';

revoke all on function private.reject_client_message_id_change() from public, anon, authenticated;

drop trigger if exists messages_client_message_id_immutable on public.messages;
create trigger messages_client_message_id_immutable
  before update of client_message_id, conversation_id, sender_id on public.messages
  for each row
  when (
    old.client_message_id is distinct from new.client_message_id
    or (
      old.client_message_id is not null
      and (
        old.conversation_id is distinct from new.conversation_id
        or (new.sender_id is not null and old.sender_id is distinct from new.sender_id)
      )
    )
  )
  execute function private.reject_client_message_id_change();

-- Every keyed insert that does not come from create_message_attempt (an older
-- server build's direct service-role insert, a script) obeys the generation-
-- less rule at the database boundary: it commits only while the key has no
-- fence state (D4), and it records its delivery under the key lock. AFTER
-- ROW: the row exists for the message_id reference, and the key lock is held
-- until commit, exactly like create_message_attempt's check.
create or replace function private.fence_raw_keyed_message_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_generation bigint;
begin
  if pg_catalog.current_setting('virtual_office.create_message_attempt_id', true) = new.id::text then
    return null;
  end if;

  insert into private.message_send_attempts (sender_id, conversation_id, client_message_id)
  values (new.sender_id, new.conversation_id, new.client_message_id)
  on conflict (sender_id, conversation_id, client_message_id) do nothing;

  select a.fence_generation into v_generation
  from private.message_send_attempts a
  where a.sender_id = new.sender_id
    and a.conversation_id = new.conversation_id
    and a.client_message_id = new.client_message_id
  for update;

  if v_generation is not null then
    raise exception 'ATTEMPT_SUPERSEDED' using errcode = 'P0001';
  end if;

  update private.message_send_attempts a
  set committed_at = pg_catalog.now(),
      message_id = new.id,
      composition = null,
      updated_at = pg_catalog.now()
  where a.sender_id = new.sender_id
    and a.conversation_id = new.conversation_id
    and a.client_message_id = new.client_message_id;
  return null;
end
$$;

comment on function private.fence_raw_keyed_message_insert() is
  'Phase 5 T2 trigger function: a keyed insert outside create_message_attempt commits only while its key has no fence state, and records its delivery.';

revoke all on function private.fence_raw_keyed_message_insert() from public, anon, authenticated;

drop trigger if exists messages_keyed_insert_fence on public.messages;
create trigger messages_keyed_insert_fence
  after insert on public.messages
  for each row
  when (new.client_message_id is not null and new.sender_id is not null)
  execute function private.fence_raw_keyed_message_insert();

-- Delta backfill under the locks taken above: keyed rows committed between the
-- first backfill and the trigger's creation (normally none).
insert into private.message_send_attempts as a
  (sender_id, conversation_id, client_message_id, committed_at, message_id)
select m.sender_id, m.conversation_id, m.client_message_id, m.timestamp, m.id
from public.messages m
where m.client_message_id is not null
  and m.sender_id is not null
on conflict (sender_id, conversation_id, client_message_id) do update
  set message_id = excluded.message_id,
      committed_at = coalesce(a.committed_at, excluded.committed_at),
      composition = case when a.message_id = excluded.message_id then a.composition end,
      updated_at = pg_catalog.now()
  where a.message_id is distinct from excluded.message_id or a.committed_at is null;

commit;
