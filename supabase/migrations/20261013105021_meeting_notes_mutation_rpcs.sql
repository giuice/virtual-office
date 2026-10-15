-- Phase 6 T17 (spec-interview/phase-6-meeting-notes; FR-001, FR-006..FR-010,
-- FR-030, BR-002, BR-003, BR-004, BR-011; AC-002, AC-004..AC-007, AC-021):
-- the only client write path for meeting notes, their participants, and their
-- versions.
--
-- Before this migration (T1, 20261013103447): authenticated holds SELECT only
-- on the note tables; nothing lets a client create, change, restore, or delete
-- a note.
--
-- After this migration, four RPCs, each SECURITY DEFINER, owner postgres,
-- search_path '', EXECUTE granted to authenticated only (REVOKE ALL from
-- PUBLIC, anon, authenticated, service_role first):
--   * public.create_meeting_note(p_room_id uuid, p_title text,
--       p_meeting_date timestamptz, p_content text, p_participant_ids uuid[])
--       -> jsonb {note_id, revision: 1, version_id}
--     Any member of the space's company (private spaces included). The note's
--     company is the space's company; author id/name snapshots, created_by,
--     and edited_by come from the caller's users row. Participants must be
--     current members of that company. Creates version 1.
--   * public.update_meeting_note(p_note_id uuid, p_expected_revision bigint,
--       p_title text, p_meeting_date timestamptz, p_content text,
--       p_participant_ids uuid[]) -> jsonb {note_id, revision, version_id}
--     Full desired state of title, meeting date, content, and the ordered
--     participant list (summary, transcript, space, and items are unchanged).
--     A listed person must be a current company member or already a
--     participant of the note (a former member may be retained, never added).
--   * public.restore_meeting_note_version(p_note_id uuid,
--       p_expected_revision bigint, p_version_id uuid)
--       -> jsonb {note_id, revision, version_id}
--     Applies the version's title, meeting date, participants (with their
--     snapshot names), content, and summary; action items and the transcript
--     are untouched.
--   * public.delete_meeting_note(p_note_id uuid, p_expected_revision bigint)
--       -> jsonb {note_id, deleted: true}
--     Deletes the note; versions, participants, and action items go by the
--     ON DELETE CASCADE of their note_id FKs; the transcript is a note column.
--
-- Caller: users.supabase_uid = auth.uid()::text -> users.id. Membership:
-- users.company_id = note.company_id. Rights (BR-003) are evaluated on the
-- locked pre-change state: edit/restore = author (author_user_id) or current
-- participant or company admin (users.role = 'admin'), each while a member;
-- delete = author or company admin, while a member. Every update, restore,
-- and delete requires p_expected_revision = the note's current revision and
-- bumps it by one (except delete); create/update/restore insert exactly one
-- version for the new revision, in the same transaction.
--
-- Lock order (PLAN lock order rule): the caller's users row FOR KEY SHARE
-- (the lock a version/note FK check takes anyway), then (create) the space row
-- FOR KEY SHARE or (update/restore/delete) the note row FOR UPDATE, then
-- participants and versions. The users lock comes first so the product
-- member-removal and role-change RPCs, which lock users FOR UPDATE before
-- companies and spaces, can never interleave into a cycle, and it makes those
-- RPCs wait for the note change (or the note change wait for them), so the
-- rights read under the lock hold for the whole call against them. KEY SHARE,
-- not SHARE, on purpose: it does not conflict with the NO KEY UPDATE of
-- presence writes to the caller's row (last_active, current_space_id), which
-- may hold space locks; a SHARE lock here could close a cycle with them. A raw
-- UPDATE of users.company_id/role (not a product path; service-role
-- membership updates are rejected by presence_block_service_role_membership_update)
-- is not blocked by it. A caller outside the note's company is rejected
-- before any note lock.
--
-- Accepted races (no rights are gained): a person newly listed as a
-- participant whose removal from the company commits during the call ends up
-- listed as a former member, the same state as a removal one moment later.
-- Restore reproduces the version's participants exactly (FR-009, AC-006),
-- including people who have since left the company; they stay former members
-- with no access, because every right requires current membership.
--
-- Errors (message token, SQLSTATE):
--   MEETING_NOTE_NOT_FOUND (P0002): no such note, or the caller is not a
--     current member of its company (other companies' notes are
--     indistinguishable from missing ones; cross-company admins included).
--   MEETING_NOTE_FORBIDDEN (42501): the caller is a member but lacks the edit
--     (update/restore) or delete right, or (create) has no users row/company.
--   MEETING_NOTE_STALE_REVISION (P0001): p_expected_revision differs from the
--     current revision; DETAIL is {"current_revision": N}. Nothing changes.
--   MEETING_NOTE_SPACE_NOT_FOUND (P0002): create with a space that does not
--     exist or is not in the caller's company.
--   MEETING_NOTE_VERSION_NOT_FOUND (P0002): restore of a version that is not
--     a version of that note.
--   22023 limit/shape violations: MEETING_NOTE_TITLE_INVALID (blank or > 200
--     chars), MEETING_NOTE_DATE_REQUIRED, MEETING_NOTE_CONTENT_TOO_LONG
--     (> 100,000 chars), MEETING_NOTE_CONTENT_REQUIRED (NULL; '' is an
--     empty note), MEETING_NOTE_TOO_MANY_PARTICIPANTS (> 50),
--     MEETING_NOTE_PARTICIPANTS_INVALID (NULL list, NULL or duplicate entries),
--     MEETING_NOTE_PARTICIPANT_NOT_MEMBER (a newly listed person who is not a
--     current member of the note's company), MEETING_NOTE_REVISION_REQUIRED.
--   Any error rolls the whole call back: nothing is stored.
--
-- Defense in depth for every role (service_role and postgres included):
-- meeting_notes.title and meeting_note_versions.title must be 1-200 chars and
-- not blank. The meeting_notes check is NOT VALID so a legacy row (SPEC §9)
-- does not block the migration; it applies to every new or changed row.
--
-- Rollback (order: FIRST roll the application back to a build that does not
-- call these RPCs, THEN run this SQL; no data is lost — notes, participants,
-- and versions written through the RPCs stay):
--   begin;
--   drop function if exists public.create_meeting_note(uuid, text, timestamptz, text, uuid[]);
--   drop function if exists public.update_meeting_note(uuid, bigint, text, timestamptz, text, uuid[]);
--   drop function if exists public.restore_meeting_note_version(uuid, bigint, uuid);
--   drop function if exists public.delete_meeting_note(uuid, bigint);
--   drop function if exists private.meeting_note_lock_caller();
--   drop function if exists private.meeting_note_authorize(uuid, bigint, text);
--   drop function if exists private.meeting_note_validate_fields(text, timestamptz, text);
--   drop function if exists private.meeting_note_replace_participants(uuid, uuid, uuid[]);
--   drop function if exists private.meeting_note_write_participants(uuid, jsonb);
--   drop function if exists private.meeting_note_insert_version(uuid, uuid, text);
--   alter table public.meeting_notes drop constraint if exists meeting_notes_title_length_check;
--   alter table public.meeting_note_versions drop constraint if exists meeting_note_versions_title_length_check;
--   commit;

begin;

set local lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- Title limits for every role
-- ---------------------------------------------------------------------------

alter table public.meeting_notes
  drop constraint if exists meeting_notes_title_length_check,
  add constraint meeting_notes_title_length_check
    check (pg_catalog.char_length(title) between 1 and 200 and pg_catalog.btrim(title) <> '')
    not valid;

alter table public.meeting_note_versions
  drop constraint if exists meeting_note_versions_title_length_check,
  add constraint meeting_note_versions_title_length_check
    check (pg_catalog.char_length(title) between 1 and 200 and pg_catalog.btrim(title) <> '');

-- ---------------------------------------------------------------------------
-- Internal helpers (no EXECUTE for any client or server role)
-- ---------------------------------------------------------------------------

-- The caller's users row, locked FOR KEY SHARE (first lock of every note
-- mutation). All OUT values are NULL when auth.uid() has no users row.
create or replace function private.meeting_note_lock_caller(
  out caller_id uuid,
  out caller_company_id uuid,
  out caller_is_admin boolean,
  out caller_name text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid text := (select auth.uid())::text;
begin
  if v_uid is null then
    return;
  end if;

  select u.id, u.company_id, (u.role = 'admin'::public.user_role), u.display_name
  into caller_id, caller_company_id, caller_is_admin, caller_name
  from public.users as u
  where u.supabase_uid = v_uid
  for key share;
end;
$$;

create or replace function private.meeting_note_validate_fields(
  p_title text,
  p_meeting_date timestamptz,
  p_content text
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_title is null
     or pg_catalog.btrim(p_title) = ''
     or pg_catalog.char_length(p_title) > 200 then
    raise exception 'MEETING_NOTE_TITLE_INVALID' using errcode = '22023';
  end if;
  if p_meeting_date is null then
    raise exception 'MEETING_NOTE_DATE_REQUIRED' using errcode = '22023';
  end if;
  if p_content is null then
    raise exception 'MEETING_NOTE_CONTENT_REQUIRED' using errcode = '22023';
  end if;
  if pg_catalog.char_length(p_content) > 100000 then
    raise exception 'MEETING_NOTE_CONTENT_TOO_LONG' using errcode = '22023';
  end if;
end;
$$;

-- Locks the caller then the note (lock order rule) and authorizes p_action
-- ('edit' | 'delete') on the locked pre-change state, then checks the
-- revision. Returns the caller's id and name snapshot and the note company.
create or replace function private.meeting_note_authorize(
  p_note_id uuid,
  p_expected_revision bigint,
  p_action text,
  out caller_id uuid,
  out caller_name text,
  out note_company_id uuid
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_caller record;
  v_note record;
  v_allowed boolean;
begin
  if p_action is null or p_action not in ('edit', 'delete') then
    raise exception 'meeting_note_authorize: unknown action' using errcode = '22023';
  end if;
  if p_expected_revision is null then
    raise exception 'MEETING_NOTE_REVISION_REQUIRED' using errcode = '22023';
  end if;

  select * into v_caller from private.meeting_note_lock_caller();
  if p_note_id is null or v_caller.caller_id is null or v_caller.caller_company_id is null then
    raise exception 'MEETING_NOTE_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Outsiders never take the note lock: the company check runs on an
  -- unlocked read first (company_id is immutable, so it cannot go stale).
  if not exists (
    select 1
    from public.meeting_notes as n
    where n.id = p_note_id
      and n.company_id = v_caller.caller_company_id
  ) then
    raise exception 'MEETING_NOTE_NOT_FOUND' using errcode = 'P0002';
  end if;

  select n.id, n.company_id, n.author_user_id, n.revision
  into v_note
  from public.meeting_notes as n
  where n.id = p_note_id
  for update;

  if not found then
    -- Deleted by a transaction that committed while this one waited.
    raise exception 'MEETING_NOTE_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_allowed := v_note.author_user_id = v_caller.caller_id or v_caller.caller_is_admin;
  if not v_allowed and p_action = 'edit' then
    v_allowed := exists (
      select 1
      from public.meeting_note_participants as p
      where p.note_id = v_note.id
        and p.user_id = v_caller.caller_id
    );
  end if;
  if not v_allowed then
    raise exception 'MEETING_NOTE_FORBIDDEN' using errcode = '42501';
  end if;

  if v_note.revision <> p_expected_revision then
    raise exception 'MEETING_NOTE_STALE_REVISION'
      using errcode = 'P0001',
            detail = pg_catalog.format('{"current_revision": %s}', v_note.revision);
  end if;

  caller_id := v_caller.caller_id;
  caller_name := v_caller.caller_name;
  note_company_id := v_note.company_id;
end;
$$;

-- Rewrites the note's participant rows from p_rows, a JSON array of
-- {user_id, display_name, added_at} in order. sort_order is unique per note
-- and not deferrable, and identity/snapshot columns are immutable, so the
-- list is rewritten by delete + insert (sort_order = array position).
create or replace function private.meeting_note_write_participants(
  p_note_id uuid,
  p_rows jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  delete from public.meeting_note_participants as p
  where p.note_id = p_note_id;

  insert into public.meeting_note_participants (note_id, user_id, display_name, sort_order, added_at)
  select p_note_id,
         (e.item ->> 'user_id')::uuid,
         e.item ->> 'display_name',
         (e.ord - 1)::smallint,
         (e.item ->> 'added_at')::timestamptz
  from pg_catalog.jsonb_array_elements(p_rows) with ordinality as e(item, ord);
end;
$$;

-- Replaces the note's participant list with p_user_ids in order. A listed
-- person must already be a participant of the note (kept with their
-- snapshot, even as a former member) or be a current member of p_company_id
-- (snapshot = current display name, added_at = now).
create or replace function private.meeting_note_replace_participants(
  p_note_id uuid,
  p_company_id uuid,
  p_user_ids uuid[]
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ids uuid[] := p_user_ids;
  v_resolved jsonb;
begin
  if v_ids is null then
    raise exception 'MEETING_NOTE_PARTICIPANTS_INVALID' using errcode = '22023';
  end if;
  if pg_catalog.cardinality(v_ids) > 50 then
    raise exception 'MEETING_NOTE_TOO_MANY_PARTICIPANTS' using errcode = '22023';
  end if;
  if pg_catalog.array_position(v_ids, null) is not null
     or (select pg_catalog.count(distinct t.id) from pg_catalog.unnest(v_ids) as t(id))
        <> pg_catalog.cardinality(v_ids) then
    raise exception 'MEETING_NOTE_PARTICIPANTS_INVALID' using errcode = '22023';
  end if;

  select coalesce(
           pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object(
               'user_id', r.id,
               'display_name', coalesce(p.display_name, u.display_name),
               'added_at', coalesce(p.added_at, pg_catalog.now()),
               'allowed', (p.user_id is not null or u.id is not null)
             )
             order by r.ord
           ),
           '[]'::jsonb
         )
  into v_resolved
  from pg_catalog.unnest(v_ids) with ordinality as r(id, ord)
  left join public.meeting_note_participants as p
    on p.note_id = p_note_id
   and p.user_id = r.id
  left join public.users as u
    on u.id = r.id
   and u.company_id = p_company_id;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(v_resolved) as e(item)
    where not (e.item ->> 'allowed')::boolean
  ) then
    raise exception 'MEETING_NOTE_PARTICIPANT_NOT_MEMBER' using errcode = '22023';
  end if;

  perform private.meeting_note_write_participants(p_note_id, v_resolved);
end;
$$;

-- Inserts the immutable version of the note's current state (its current
-- revision) with the editor's id and name snapshots; returns the version id.
create or replace function private.meeting_note_insert_version(
  p_note_id uuid,
  p_editor_id uuid,
  p_editor_name text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_version_id uuid;
begin
  insert into public.meeting_note_versions
    (note_id, revision, title, meeting_date, participants, content, summary,
     editor_user_id, editor_name, edited_by)
  select n.id,
         n.revision,
         n.title,
         n.meeting_date,
         coalesce(
           (select pg_catalog.jsonb_agg(
                     pg_catalog.jsonb_build_object('user_id', p.user_id, 'display_name', p.display_name)
                     order by p.sort_order)
            from public.meeting_note_participants as p
            where p.note_id = n.id),
           '[]'::jsonb
         ),
         n.content,
         n.summary,
         p_editor_id,
         p_editor_name,
         p_editor_id
  from public.meeting_notes as n
  where n.id = p_note_id
  returning id into v_version_id;

  if v_version_id is null then
    raise exception 'MEETING_NOTE_NOT_FOUND' using errcode = 'P0002';
  end if;
  return v_version_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs (authenticated only)
-- ---------------------------------------------------------------------------

create or replace function public.create_meeting_note(
  p_room_id uuid,
  p_title text,
  p_meeting_date timestamptz,
  p_content text,
  p_participant_ids uuid[]
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_caller record;
  v_note_id uuid;
  v_version_id uuid;
begin
  perform private.meeting_note_validate_fields(p_title, p_meeting_date, p_content);

  select * into v_caller from private.meeting_note_lock_caller();
  if v_caller.caller_id is null or v_caller.caller_company_id is null then
    raise exception 'MEETING_NOTE_FORBIDDEN' using errcode = '42501';
  end if;

  -- FOR KEY SHARE: a concurrent space deletion waits for this note instead of
  -- turning the insert into a raw FK error.
  perform 1
  from public.spaces as s
  where s.id = p_room_id
    and s.company_id = v_caller.caller_company_id
  for key share;
  if p_room_id is null or not found then
    raise exception 'MEETING_NOTE_SPACE_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.meeting_notes
    (company_id, room_id, title, meeting_date, content, summary, generated_by,
     author_user_id, author_name, created_by, edited_by, revision)
  values
    (v_caller.caller_company_id, p_room_id, p_title, p_meeting_date,
     p_content, null, 'user'::public.note_generator,
     v_caller.caller_id, v_caller.caller_name, v_caller.caller_id, v_caller.caller_id, 1)
  returning id into v_note_id;

  perform private.meeting_note_replace_participants(v_note_id, v_caller.caller_company_id, p_participant_ids);
  v_version_id := private.meeting_note_insert_version(v_note_id, v_caller.caller_id, v_caller.caller_name);

  return pg_catalog.jsonb_build_object('note_id', v_note_id, 'revision', 1, 'version_id', v_version_id);
end;
$$;

create or replace function public.update_meeting_note(
  p_note_id uuid,
  p_expected_revision bigint,
  p_title text,
  p_meeting_date timestamptz,
  p_content text,
  p_participant_ids uuid[]
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_auth record;
  v_revision bigint;
  v_version_id uuid;
begin
  perform private.meeting_note_validate_fields(p_title, p_meeting_date, p_content);
  select * into v_auth from private.meeting_note_authorize(p_note_id, p_expected_revision, 'edit');

  perform private.meeting_note_replace_participants(p_note_id, v_auth.note_company_id, p_participant_ids);

  update public.meeting_notes as n
  set title = p_title,
      meeting_date = p_meeting_date,
      content = p_content,
      revision = n.revision + 1,
      edited_by = v_auth.caller_id,
      updated_at = pg_catalog.now()
  where n.id = p_note_id
  returning n.revision into v_revision;

  v_version_id := private.meeting_note_insert_version(p_note_id, v_auth.caller_id, v_auth.caller_name);
  return pg_catalog.jsonb_build_object('note_id', p_note_id, 'revision', v_revision, 'version_id', v_version_id);
end;
$$;

create or replace function public.restore_meeting_note_version(
  p_note_id uuid,
  p_expected_revision bigint,
  p_version_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_auth record;
  v_version record;
  v_rows jsonb;
  v_revision bigint;
  v_version_id uuid;
begin
  select * into v_auth from private.meeting_note_authorize(p_note_id, p_expected_revision, 'edit');

  select v.title, v.meeting_date, v.participants, v.content, v.summary
  into v_version
  from public.meeting_note_versions as v
  where v.id = p_version_id
    and v.note_id = p_note_id;

  if not found then
    raise exception 'MEETING_NOTE_VERSION_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- The version's participant list in its order, with the version's snapshot
  -- names (former members included: they were already on the note); a person
  -- still on the note keeps their original added_at.
  select coalesce(
           pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object(
               'user_id', e.item ->> 'user_id',
               'display_name', e.item ->> 'display_name',
               'added_at', coalesce(p.added_at, pg_catalog.now())
             )
             order by e.ord
           ),
           '[]'::jsonb
         )
  into v_rows
  from pg_catalog.jsonb_array_elements(v_version.participants) with ordinality as e(item, ord)
  left join public.meeting_note_participants as p
    on p.note_id = p_note_id
   and p.user_id = (e.item ->> 'user_id')::uuid;

  perform private.meeting_note_write_participants(p_note_id, v_rows);

  update public.meeting_notes as n
  set title = v_version.title,
      meeting_date = v_version.meeting_date,
      content = v_version.content,
      summary = v_version.summary,
      revision = n.revision + 1,
      edited_by = v_auth.caller_id,
      updated_at = pg_catalog.now()
  where n.id = p_note_id
  returning n.revision into v_revision;

  v_version_id := private.meeting_note_insert_version(p_note_id, v_auth.caller_id, v_auth.caller_name);
  return pg_catalog.jsonb_build_object('note_id', p_note_id, 'revision', v_revision, 'version_id', v_version_id);
end;
$$;

create or replace function public.delete_meeting_note(
  p_note_id uuid,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_auth record;
begin
  select * into v_auth from private.meeting_note_authorize(p_note_id, p_expected_revision, 'delete');

  -- Versions, participants, and action items go by their ON DELETE CASCADE
  -- note_id FKs; the transcript is a column of the note row.
  delete from public.meeting_notes as n
  where n.id = p_note_id;

  return pg_catalog.jsonb_build_object('note_id', p_note_id, 'deleted', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Ownership, comments, and EXECUTE privileges
-- ---------------------------------------------------------------------------

alter function private.meeting_note_lock_caller() owner to postgres;
alter function private.meeting_note_validate_fields(text, timestamptz, text) owner to postgres;
alter function private.meeting_note_authorize(uuid, bigint, text) owner to postgres;
alter function private.meeting_note_replace_participants(uuid, uuid, uuid[]) owner to postgres;
alter function private.meeting_note_write_participants(uuid, jsonb) owner to postgres;
alter function private.meeting_note_insert_version(uuid, uuid, text) owner to postgres;
alter function public.create_meeting_note(uuid, text, timestamptz, text, uuid[]) owner to postgres;
alter function public.update_meeting_note(uuid, bigint, text, timestamptz, text, uuid[]) owner to postgres;
alter function public.restore_meeting_note_version(uuid, bigint, uuid) owner to postgres;
alter function public.delete_meeting_note(uuid, bigint) owner to postgres;

revoke all on function private.meeting_note_lock_caller() from public, anon, authenticated, service_role;
revoke all on function private.meeting_note_validate_fields(text, timestamptz, text) from public, anon, authenticated, service_role;
revoke all on function private.meeting_note_authorize(uuid, bigint, text) from public, anon, authenticated, service_role;
revoke all on function private.meeting_note_replace_participants(uuid, uuid, uuid[]) from public, anon, authenticated, service_role;
revoke all on function private.meeting_note_write_participants(uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function private.meeting_note_insert_version(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.create_meeting_note(uuid, text, timestamptz, text, uuid[]) from public, anon, authenticated, service_role;
revoke all on function public.update_meeting_note(uuid, bigint, text, timestamptz, text, uuid[]) from public, anon, authenticated, service_role;
revoke all on function public.restore_meeting_note_version(uuid, bigint, uuid) from public, anon, authenticated, service_role;
revoke all on function public.delete_meeting_note(uuid, bigint) from public, anon, authenticated, service_role;

grant execute on function public.create_meeting_note(uuid, text, timestamptz, text, uuid[]) to authenticated;
grant execute on function public.update_meeting_note(uuid, bigint, text, timestamptz, text, uuid[]) to authenticated;
grant execute on function public.restore_meeting_note_version(uuid, bigint, uuid) to authenticated;
grant execute on function public.delete_meeting_note(uuid, bigint) to authenticated;

comment on function public.create_meeting_note(uuid, text, timestamptz, text, uuid[]) is
  'Phase 6 T17 (FR-001, BR-002): a member of the space''s company creates a note (title 1-200, date required, content <= 100,000, <= 50 current-member participants) with version 1; company and author snapshots come from the space and the caller''s users row. Authenticated only.';
comment on function public.update_meeting_note(uuid, bigint, text, timestamptz, text, uuid[]) is
  'Phase 6 T17 (FR-006..FR-008, FR-030, BR-003, BR-004, BR-011): an editor (author, current participant, or company admin, each while a member, evaluated before the change) saves title, date, content, and participants at the current revision; bumps the revision and inserts one version. Former members already listed may be retained, never added. Authenticated only.';
comment on function public.restore_meeting_note_version(uuid, bigint, uuid) is
  'Phase 6 T17 (FR-009, BR-004): an editor restores a version''s title, date, participants, content, and summary at the current revision; bumps the revision and inserts one version; action items and transcript unchanged. Authenticated only.';
comment on function public.delete_meeting_note(uuid, bigint) is
  'Phase 6 T17 (FR-010, BR-003): the author (while a member) or a company admin deletes a note at the current revision, with its versions, participants, action items, and transcript. Authenticated only.';

commit;
