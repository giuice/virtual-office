-- Phase 4 T12 / FR-008, FR-010, FR-011, AC-009, AC-010, AC-013, AC-015, AC-035
-- (spec-interview/phase-4-messaging-timeline): a message (text optional) can
-- be created with up to five previously uploaded, authorized attachments.
--
-- Model:
--   * POST /api/messages/upload stores the object in the private
--     'attachments' bucket (service client, after the membership check) and
--     records it here as a PENDING upload owned by the caller for one
--     conversation. The upload id is returned to the client.
--   * POST /api/messages/create with attachmentIds validates every pending
--     upload against the server attachment policy (count, size, MIME, owner,
--     conversation) using the STORED object metadata, then calls
--     public.create_message_with_attachments, which in ONE transaction locks
--     the pending rows, inserts the message, moves the rows into
--     public.message_attachments (attachment id = upload id, url = storage
--     path) and deletes the pending rows. A message is therefore never visible
--     without its attachments (BR-007), and an upload can be linked once.
--   * DELETE /api/messages/upload/{id} (uploader only) deletes the pending row
--     and then its storage object (FR-010).
--
-- Visibility (FR-010, BR-011): pending uploads are readable by nobody but the
-- service role — RLS is enabled with NO policy and anon/authenticated hold no
-- privilege on the table; the bucket is private and has no storage.objects
-- policy (no policy is added here, so nothing can collide with the online-only
-- 'user-uploads' avatar policies); GET /api/messages/attachment/{id} only
-- resolves rows of public.message_attachments, i.e. linked attachments, for
-- conversation members, via a short-lived signed URL.
--
-- Abandoned uploads (tab closed): they stay invisible; the upload route
-- best-effort deletes the uploader's own pending uploads older than 24 hours
-- (row first, then object). Uploads left behind by users who never upload
-- again remain invisible until an operator sweep (not scheduled).
--
-- Attachment-only messages (FR-008, AC-010): messages.check_content_not_empty
-- (content <> '') is replaced by messages_content_not_empty_unless_attachment
-- (content <> '' OR type IN ('image', 'file')). Text, system and announcement
-- messages still need content; only attachment-typed messages may be empty,
-- and the server creates those exclusively through
-- create_message_with_attachments together with their attachments. The new
-- check is strictly weaker, so every existing row satisfies it. To keep
-- clients from using the wider check directly, the client policies
-- send_message_as_self (INSERT) and update_own_messages (UPDATE) gain
-- content <> '' in WITH CHECK (service-role writes bypass RLS).
--
-- Server-only attachment writes: message_attachments rows were insertable and
-- deletable by their message's sender through the Data API
-- (add_attachments_to_own_messages / delete_own_message_attachments). A
-- client-inserted row could point at any storage path (e.g. the sender's own
-- PENDING upload, another conversation's object, or an external URL) and the
-- member read route would sign it, bypassing every T12 guarantee. Both client
-- write policies are dropped and anon/authenticated lose INSERT, UPDATE,
-- DELETE and TRUNCATE on the table (SELECT and its member policy stay).
-- Attachment rows are written only by create_message_with_attachments and
-- deleted only by the sender-checked service route (or FK cascade).
--
-- Backward compatible with the published app (BR-013): one new table, one new
-- function, a widened check, two narrowed client policies, and two dropped
-- client write policies on message_attachments. The published client never
-- sends empty content and never writes messages or attachments directly (its
-- creates and deletes go through service-role routes); the only published path
-- that inserted attachment rows with the user's client is the upload route's
-- messageId branch, which no production UI calls (the drawer composer's file
-- input has no handler; the context's uploadAttachment takes no message id) —
-- after this migration that branch fails for the published build until the
-- new app replaces it. The published client never reads the new table; it
-- renders an attachment message's text (possibly empty) plus its first
-- attachment. The table is not added to the Realtime publication.
--
-- Locking: dropping/adding the check takes a brief ACCESS EXCLUSIVE lock on
-- messages and the validation scans it once; lock_timeout makes the migration
-- fail fast instead of queueing message traffic (re-run it).
--
-- Transactional and re-runnable (if not exists / create or replace / revoke
-- and grant are idempotent).
--
-- Rollback (app first: the T12 upload/create routes fail without these
-- objects; the published app is unaffected). Pending objects referenced by
-- the table are left in the private bucket, invisible; list them first if they
-- must be removed (select storage_path from public.message_attachment_uploads).
-- Restoring the strict check fails while attachment-only messages exist: give
-- them content first (the update below uses the first attachment's name).
--   begin;
--   update public.messages m set content = coalesce(
--       (select a.name from public.message_attachments a where a.message_id = m.id order by a.created_at, a.id limit 1),
--       'attachment')
--     where m.content = '';
--   alter table public.messages drop constraint if exists messages_content_not_empty_unless_attachment;
--   alter table public.messages drop constraint if exists check_content_not_empty;
--   alter table public.messages add constraint check_content_not_empty check (content <> '');
--   alter policy "send_message_as_self" on public.messages
--     with check ((sender_id = (select private.current_app_user_id())) and private.is_conversation_member(conversation_id));
--   alter policy "update_own_messages" on public.messages
--     with check ((sender_id = (select private.current_app_user_id())) and private.is_conversation_member(conversation_id));
--   grant insert, update, delete, truncate on table public.message_attachments to anon, authenticated;
--   create policy "add_attachments_to_own_messages" on public.message_attachments for insert
--     with check ((auth.uid() is not null) and (exists (select 1 from public.messages m
--       where m.id = message_attachments.message_id
--         and m.sender_id = (select users.id from public.users where users.supabase_uid = (auth.uid())::text))));
--   create policy "delete_own_message_attachments" on public.message_attachments for delete
--     using ((auth.uid() is not null) and (exists (select 1 from public.messages m
--       where m.id = message_attachments.message_id
--         and m.sender_id = (select users.id from public.users where users.supabase_uid = (auth.uid())::text))));
--   drop function if exists public.create_message_with_attachments(uuid, uuid, text, text, uuid, uuid, uuid[]);
--   drop table if exists public.message_attachment_uploads;
--   delete from supabase_migrations.schema_migrations where version = '20261005004335';
--   commit;

begin;

set local lock_timeout = '5s';

alter table public.messages drop constraint if exists check_content_not_empty;
alter table public.messages drop constraint if exists messages_content_not_empty_unless_attachment;
alter table public.messages
  add constraint messages_content_not_empty_unless_attachment
  check (content <> '' or type in ('image'::public.message_type, 'file'::public.message_type));

-- Clients still cannot store empty content (only the service-role RPC can,
-- together with the attachments).
alter policy "send_message_as_self" on public.messages
  with check (
    (sender_id = (select private.current_app_user_id()))
    and private.is_conversation_member(conversation_id)
    and content <> ''
  );
alter policy "update_own_messages" on public.messages
  with check (
    (sender_id = (select private.current_app_user_id()))
    and private.is_conversation_member(conversation_id)
    and content <> ''
  );

-- Attachment rows are server-written only (see header).
drop policy if exists "add_attachments_to_own_messages" on public.message_attachments;
drop policy if exists "delete_own_message_attachments" on public.message_attachments;
revoke insert, update, delete, truncate on table public.message_attachments from anon, authenticated;

create table if not exists public.message_attachment_uploads (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  uploader_id uuid not null references public.users (id) on delete cascade,
  storage_path text not null,
  name text not null,
  type text not null,
  size integer not null,
  created_at timestamptz not null default now(),
  constraint message_attachment_uploads_storage_path_key unique (storage_path),
  constraint message_attachment_uploads_size_check check (size >= 0),
  constraint message_attachment_uploads_name_check check (char_length(name) between 1 and 255)
);

comment on table public.message_attachment_uploads is
  'Phase 4 T12: files uploaded to the private attachments bucket and not yet linked to a sent message. Service role only (RLS on, no policies). Rows move to message_attachments (same id) when the message is created.';
comment on column public.message_attachment_uploads.uploader_id is
  'users.id of the uploader (application id, not supabase_uid).';
comment on column public.message_attachment_uploads.storage_path is
  'Object path inside the attachments bucket.';

-- Cascades from conversations and the per-uploader stale sweep.
create index if not exists idx_message_attachment_uploads_conversation_id
  on public.message_attachment_uploads (conversation_id);
create index if not exists idx_message_attachment_uploads_uploader_created
  on public.message_attachment_uploads (uploader_id, created_at);

alter table public.message_attachment_uploads enable row level security;

-- Default privileges grant every new public table to anon/authenticated;
-- pending uploads are server-only.
revoke all on table public.message_attachment_uploads from public, anon, authenticated;
-- UPDATE is required by SELECT ... FOR UPDATE in create_message_with_attachments.
grant select, insert, update, delete on table public.message_attachment_uploads to service_role;

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
  select pg_catalog.count(*) into v_locked
  from (
    select u.id
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

  insert into public.message_attachments (id, message_id, name, type, size, url)
  select u.id, v_message_id, u.name, u.type, u.size, u.storage_path
  from public.message_attachment_uploads u
  where u.id = any (p_upload_ids);

  delete from public.message_attachment_uploads u
  where u.id = any (p_upload_ids);

  return pg_catalog.jsonb_build_object('message_id', v_message_id, 'created', true);
end
$$;

comment on function public.create_message_with_attachments(uuid, uuid, text, text, uuid, uuid, uuid[]) is
  'Phase 4 T12: atomically creates a message and links 1-5 pending uploads of its sender for that conversation. Service role only; callers authorize the sender and validate the attachment policy first. Returns {message_id, created}; created=false is a replay of p_client_message_id.';

-- Default privileges grant EXECUTE on new public functions to anon and
-- authenticated (and PUBLIC); this one is server-only.
revoke all on function public.create_message_with_attachments(uuid, uuid, text, text, uuid, uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.create_message_with_attachments(uuid, uuid, text, text, uuid, uuid, uuid[])
  to service_role;

commit;
