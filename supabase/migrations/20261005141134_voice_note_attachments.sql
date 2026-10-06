-- Phase 4 T15 / FR-018, BR-006, BR-008, BR-011, AC-021, AC-032, AC-035
-- (spec-interview/phase-4-messaging-timeline): voice notes are stored as
-- attachments in the private 'attachments' bucket, with duration (at most 120
-- seconds) and waveform metadata; audio is accepted ONLY for voice notes.
--
-- Depends on 20261005004335_message_attachment_uploads (T12): apply it first.
--
-- Model (server contract in src/lib/messaging/attachment-policy.ts):
--   * POST /api/messages/upload with kind=voice, duration (seconds) and
--     waveform (JSON array) stores the audio object and records a PENDING
--     upload carrying duration (whole seconds, 1-120) and waveform_data.
--     Without kind=voice an audio file is refused (regular allowlist).
--   * POST /api/messages/create links it through
--     create_message_with_attachments, which now copies duration and
--     waveform_data into message_attachments. A voice note is the only
--     attachment of its message, which is typed 'file' (no new message_type
--     value: 'file' already allows empty content, and the published app
--     renders an unknown attachment as a file).
--
-- Database invariants (the route checks the same; these are defense in depth
-- for every writer, the service role included):
--   * message_attachment_uploads_voice_note_check: an audio upload carries
--     valid voice metadata (duration 1-120, waveform = JSON array of 1-256
--     numbers in [0, 1]); any other upload carries none.
--   * message_attachments_voice_note_check: an audio attachment carries the
--     same valid voice metadata. Non-audio rows are unconstrained. Added NOT
--     VALID (every new or updated row is checked) and validated in the same
--     transaction only when no existing row breaks it, so legacy audio rows
--     (the baseline already had duration/waveform_data and a partial index on
--     duration) never block the deploy; convalidated reports the outcome.
--   * create_message_with_attachments refuses a voice upload together with
--     other uploads (VOICE_NOTE_NOT_ALONE) and a voice message not typed file.
--   * attachments bucket: allowed_mime_types gains audio/webm and audio/mp4
--     (stored as bare container types; the route strips codec parameters).
--     The bucket stays private (asserted), 10 MB, with no storage.objects
--     policy (none added here: nothing can collide with the online-only
--     'user-uploads' avatar policies).
--
-- Backward compatible with the published app (BR-013): two nullable columns
-- on the T12 table (unknown to the published app), one check on it, one check
-- on message_attachments that only constrains audio rows (the published app
-- never writes audio: its upload allowlist has none, and since T12 clients
-- cannot write message_attachments), the same function signature, and two
-- more allowed MIME types on a bucket only the service role writes. A voice
-- message reaches the published app as a 'file' message with one audio
-- attachment (shown as a file).
--
-- Locking: adding the check on message_attachments takes an ACCESS EXCLUSIVE
-- lock held until commit, plus one validation scan (small table);
-- lock_timeout makes the migration fail fast instead of queueing message
-- traffic (re-run it). Check legacy rows first online (expected 0 rows; any
-- row here leaves the constraint NOT VALID):
--   select id, type, duration, jsonb_typeof(waveform_data) from public.message_attachments
--   where type ilike 'audio/%'
--     and not (coalesce(duration between 1 and 120, false) and jsonb_typeof(waveform_data) = 'array');
--
-- Transactional and re-runnable (add column if not exists, drop/add
-- constraint, create or replace, idempotent bucket update and grants).
--
-- Rollback (app first: the T15 routes write the new columns). Linked voice
-- notes stay readable (their duration/waveform columns are original columns of
-- message_attachments); the old app shows them as files. Pending voice uploads
-- become unlinkable (the T12 policy refuses audio) and are deleted below; list
-- their objects first if they must be removed from the bucket:
--   select storage_path from public.message_attachment_uploads where type ilike 'audio/%';
--   begin;
--   set local lock_timeout = '5s';
--   alter table public.message_attachments drop constraint if exists message_attachments_voice_note_check;
--   alter table public.message_attachment_uploads drop constraint if exists message_attachment_uploads_voice_note_check;
--   delete from public.message_attachment_uploads where type ilike 'audio/%';
--   -- Restore the T12 function body: run, verbatim, the statements
--   -- "create or replace function public.create_message_with_attachments ... $$;",
--   -- its "comment on function", "revoke all on function" and "grant execute"
--   -- from supabase/migrations/20261005004335_message_attachment_uploads.sql
--   -- (lines 173-322; the T12 body copies no voice columns).
--   alter table public.message_attachment_uploads drop column if exists waveform_data;
--   alter table public.message_attachment_uploads drop column if exists duration;
--   update storage.buckets set allowed_mime_types = array[
--     'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain',
--     'application/msword',
--     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
--     'application/vnd.ms-excel',
--     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
--   ] where id = 'attachments';
--   delete from supabase_migrations.schema_migrations where version = '20261005141134';
--   commit;

begin;

set local lock_timeout = '5s';

-- Bucket allowlist = regular attachment types + voice-note containers. Keep in
-- sync with ATTACHMENT_BUCKET_MIME_TYPES in src/lib/messaging/attachment-policy.ts.
do $$
begin
  if exists (select 1 from storage.buckets where id = 'attachments' and public) then
    raise exception 'attachments bucket must be private';
  end if;
  update storage.buckets
  set allowed_mime_types = array[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'audio/webm',
    'audio/mp4'
  ]
  where id = 'attachments';
  if not found then
    raise exception 'attachments bucket not found';
  end if;
end
$$;

alter table public.message_attachment_uploads
  add column if not exists duration integer,
  add column if not exists waveform_data jsonb;

comment on column public.message_attachment_uploads.duration is
  'Phase 4 T15: voice-note duration in whole seconds (1-120), claimed by the client and bounded by the route; null for other uploads.';
comment on column public.message_attachment_uploads.waveform_data is
  'Phase 4 T15: voice-note waveform (JSON array of 1-256 numbers in [0, 1]); null for other uploads.';

-- CASE keeps jsonb_array_length away from non-arrays (AND has no evaluation
-- order). Bounds mirror MAX_VOICE_NOTE_DURATION_SECONDS and
-- VOICE_NOTE_WAVEFORM_MAX_SAMPLES in the attachment policy.
alter table public.message_attachment_uploads
  drop constraint if exists message_attachment_uploads_voice_note_check;
alter table public.message_attachment_uploads
  add constraint message_attachment_uploads_voice_note_check check (
    case
      when type ilike 'audio/%' then
        duration is not null
        and duration between 1 and 120
        and waveform_data is not null
        and case
          when jsonb_typeof(waveform_data) = 'array' then
            jsonb_array_length(waveform_data) between 1 and 256
            and not jsonb_path_exists(
              waveform_data,
              'strict $[*] ? (@.type() != "number" || @ < 0 || @ > 1)'
            )
          else false
        end
      else duration is null and waveform_data is null
    end
  );

alter table public.message_attachments
  drop constraint if exists message_attachments_voice_note_check;
alter table public.message_attachments
  add constraint message_attachments_voice_note_check check (
    case
      when type ilike 'audio/%' then
        duration is not null
        and duration between 1 and 120
        and waveform_data is not null
        and case
          when jsonb_typeof(waveform_data) = 'array' then
            jsonb_array_length(waveform_data) between 1 and 256
            and not jsonb_path_exists(
              waveform_data,
              'strict $[*] ? (@.type() != "number" || @ < 0 || @ > 1)'
            )
          else false
        end
      else true
    end
  ) not valid;

do $$
begin
  if not exists (
    select 1
    from public.message_attachments a
    where a.type ilike 'audio/%'
      and not (
        coalesce(a.duration between 1 and 120, false)
        and a.waveform_data is not null
        and case
          when jsonb_typeof(a.waveform_data) = 'array' then
            jsonb_array_length(a.waveform_data) between 1 and 256
            and not jsonb_path_exists(
              a.waveform_data,
              'strict $[*] ? (@.type() != "number" || @ < 0 || @ > 1)'
            )
          else false
        end
      )
  ) then
    alter table public.message_attachments validate constraint message_attachments_voice_note_check;
  else
    raise notice 'message_attachments_voice_note_check left NOT VALID: legacy audio rows lack valid voice metadata';
  end if;
end
$$;

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
  v_count integer;
  v_locked integer;
  v_voice integer;
  v_message_id uuid;
begin
  if p_conversation_id is null or p_sender_id is null or p_content is null or p_type is null then
    raise exception 'create_message_with_attachments: conversation, sender, content and type are required'
      using errcode = '22004';
  end if;

  v_count := coalesce(pg_catalog.cardinality(p_upload_ids), 0);
  -- Same bound as the route's attachment policy (5 per message).
  if v_count < 1 or v_count > 5 then
    raise exception 'ATTACHMENT_COUNT_INVALID' using errcode = '22023';
  end if;
  if (select pg_catalog.count(distinct u) from pg_catalog.unnest(p_upload_ids) as u) <> v_count then
    raise exception 'ATTACHMENT_DUPLICATE' using errcode = '22023';
  end if;

  -- Attachment messages are typed image or file (the only types allowed to
  -- carry empty content).
  if p_type not in ('image', 'file') then
    raise exception 'create_message_with_attachments: type must be image or file'
      using errcode = '22023';
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

  -- Defense in depth: the route already required membership.
  if not exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.user_id = p_sender_id
  ) then
    raise exception 'create_message_with_attachments: sender is not a member of the conversation'
      using errcode = '42501';
  end if;

  -- Replay of a composition whose create already committed: answer with the
  -- stored message and link nothing (its uploads were consumed by the first
  -- create).
  if p_client_message_id is not null then
    select m.id into v_message_id
    from public.messages m
    where m.sender_id = p_sender_id
      and m.conversation_id = p_conversation_id
      and m.client_message_id = p_client_message_id;
    if v_message_id is not null then
      return pg_catalog.jsonb_build_object('message_id', v_message_id, 'created', false);
    end if;
  end if;

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
        return pg_catalog.jsonb_build_object('message_id', v_message_id, 'created', false);
      end if;
    end if;
    -- Unknown, foreign, other-conversation, cancelled, or already linked.
    raise exception 'ATTACHMENT_UPLOAD_NOT_FOUND' using errcode = '22023';
  end if;

  -- Phase 4 T15: a voice note is the only attachment of its message, which is
  -- typed file.
  if v_voice > 0 and v_count > 1 then
    raise exception 'VOICE_NOTE_NOT_ALONE' using errcode = '22023';
  end if;
  if v_voice > 0 and p_type <> 'file' then
    raise exception 'create_message_with_attachments: a voice note message must be typed file'
      using errcode = '22023';
  end if;

  insert into public.messages (conversation_id, sender_id, content, type, status, reply_to_id, client_message_id)
  values (
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

  if v_message_id is null then
    -- Lost the race on the same key: the winner's message is committed.
    select m.id into v_message_id
    from public.messages m
    where m.sender_id = p_sender_id
      and m.conversation_id = p_conversation_id
      and m.client_message_id = p_client_message_id;
    return pg_catalog.jsonb_build_object('message_id', v_message_id, 'created', false);
  end if;

  insert into public.message_attachments (id, message_id, name, type, size, url, duration, waveform_data)
  select u.id, v_message_id, u.name, u.type, u.size, u.storage_path, u.duration, u.waveform_data
  from public.message_attachment_uploads u
  where u.id = any (p_upload_ids);

  delete from public.message_attachment_uploads u
  where u.id = any (p_upload_ids);

  return pg_catalog.jsonb_build_object('message_id', v_message_id, 'created', true);
end
$$;

comment on function public.create_message_with_attachments(uuid, uuid, text, text, uuid, uuid, uuid[]) is
  'Phase 4 T12/T15: atomically creates a message and links 1-5 pending uploads of its sender for that conversation (a voice note alone, typed file, with its duration and waveform). Service role only; callers authorize the sender and validate the attachment policy first. Returns {message_id, created}; created=false is a replay of p_client_message_id.';

revoke all on function public.create_message_with_attachments(uuid, uuid, text, text, uuid, uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.create_message_with_attachments(uuid, uuid, text, text, uuid, uuid, uuid[])
  to service_role;

commit;
