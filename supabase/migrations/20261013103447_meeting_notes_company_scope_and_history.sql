-- Phase 6 T1 (spec-interview/phase-6-meeting-notes; FR-028, FR-029, FR-030,
-- BR-001, BR-007; AC-020, AC-021, AC-023, AC-031): meeting-note schema, read
-- isolation, and lifecycle contract.
--
-- Before this migration (baseline 20260610183000 / 20260610183139):
--   * public.meeting_notes had no company, author, revision, content,
--     participants, or versions; room_id was NOT NULL -> spaces ON DELETE
--     CASCADE (deleting a space deleted its notes); summary was NOT NULL.
--   * Both meeting-note SELECT policies joined through public.spaces, so a
--     note without a space would become invisible to everyone.
--
-- After this migration:
--   * public.meeting_notes carries
--       - company_id (NOT NULL -> companies ON DELETE CASCADE): deleting a
--         company deletes its notes; immutable for every role;
--       - author_user_id + author_name: historical snapshots of the creating
--         user's application users.id and display name; immutable, no FK, so
--         they survive the user row;
--       - created_by: the live reference to the author (-> users ON DELETE SET
--         NULL); at INSERT it must equal author_user_id; afterwards it can
--         only become NULL, and only once that user row no longer exists (the
--         FK action of a user deletion), never by a client or process;
--       - revision (bigint >= 1, never decreases), content (text, <= 100,000 chars, '' by
--         default), transcript_id (identity of the stored transcript; present
--         exactly when a transcript is stored);
--       - room_id nullable -> spaces ON DELETE SET NULL: deleting a space keeps
--         its notes (FR-028); a non-NULL room_id must be a space of the note's
--         company;
--       - summary optional (NULL = no summary; the non-empty check stays).
--   * public.meeting_note_participants (note_id, user_id, display_name,
--     sort_order 0..49): participants by application users.id (no FK, so a
--     deleted user keeps their place) with a display-name snapshot; at most 50
--     per note by construction (unique sort_order 0..49); identity and snapshot
--     immutable, sort_order mutable.
--   * public.meeting_note_versions: immutable snapshots (revision, title,
--     meeting_date, participants as a JSON array of {user_id, display_name}
--     with <= 50 entries, content, summary, editor_user_id + editor_name
--     snapshots, created_at). The live editor reference edited_by (-> users ON
--     DELETE SET NULL) is the only column that may change, and only to NULL
--     after that user row is gone. A version can be deleted only by the
--     cascade of its note's deletion (the note row is already gone).
--   * RLS: every read of notes, participants, versions, and action items is
--     scoped to the note's own company_id through
--     private.is_company_member(company_id) (users.supabase_uid =
--     auth.uid()::text and users.company_id = note.company_id); never through
--     public.spaces. A user removed from the company (users.company_id
--     cleared) loses read; the same users.id rejoining regains it.
--   * Grants: anon holds nothing and authenticated holds SELECT only on the
--     four tables; there is no client write path (write RPCs come in T17/T2).
--     service_role keeps SELECT/INSERT/UPDATE/DELETE (no TRUNCATE, REFERENCES,
--     TRIGGER on notes, participants, versions), and the guards below apply to
--     every role, including service_role and postgres; a statement guard
--     rejects TRUNCATE of notes, participants, and versions for every role
--     (row triggers do not fire on TRUNCATE).
--   * Trigger functions are owned by postgres, SECURITY DEFINER with
--     search_path '', and EXECUTE is revoked from PUBLIC, anon, authenticated,
--     and service_role (trigger functions need no EXECUTE grant to fire).
--
-- Legacy rows (SPEC §9 preflight): the migration REFUSES to run
-- (MEETING_NOTES_LEGACY_ROWS_NEED_BACKFILL) when any existing meeting_notes row
-- has no derivable company (room_id -> spaces.company_id) or no derivable
-- author (edited_by -> an existing users row). Rows for which both are
-- derivable are backfilled with company_id = the space's company, author =
-- edited_by's users.id and display name (created_by = edited_by), revision 1,
-- content '', and a fresh transcript_id when a transcript is stored; no version
-- is created for them. The online preflight (T8/T15) decides whether any row
-- exists; if so, the owner decides the backfill before this file is applied.
-- The ACCESS EXCLUSIVE lock below is taken before the preflight count, so no
-- row can be added between the count and the backfill.
--
-- Rollback (order: FIRST roll the application back to a build that does not
-- use meeting notes — today no runtime caller exists — THEN run this SQL).
-- It DROPS versions, participants, and the company/author/revision/content/
-- transcript identity columns (their data is lost) and restores the original
-- SELECT policies. It deliberately does NOT restore room_id NOT NULL or the
-- spaces ON DELETE CASCADE (that would delete notes with their space; SPEC
-- §9), nor summary NOT NULL (fails once a note has no summary):
--   begin;
--   set local lock_timeout = '5s';
--   lock table public.meeting_notes, public.meeting_note_action_items in access exclusive mode;
--   drop trigger if exists meeting_notes_guard on public.meeting_notes;
--   drop trigger if exists meeting_note_participants_guard on public.meeting_note_participants;
--   drop trigger if exists meeting_note_versions_guard on public.meeting_note_versions;
--   drop trigger if exists meeting_notes_reject_truncate on public.meeting_notes;
--   drop table if exists public.meeting_note_versions;
--   drop table if exists public.meeting_note_participants;
--   drop function if exists private.guard_meeting_note();
--   drop function if exists private.guard_meeting_note_participant();
--   drop function if exists private.guard_meeting_note_version();
--   drop function if exists private.reject_meeting_note_truncate();
--   grant truncate, references, trigger on table public.meeting_notes to service_role;
--   drop policy if exists "meeting_notes_select_same_company" on public.meeting_notes;
--   create policy "meeting_notes_select_same_company"
--     on public.meeting_notes for select to authenticated
--     using (exists (select 1 from public.spaces as s
--                    where s.id = meeting_notes.room_id
--                      and private.is_company_member(s.company_id)));
--   drop policy if exists "meeting_note_action_items_select_same_company" on public.meeting_note_action_items;
--   create policy "meeting_note_action_items_select_same_company"
--     on public.meeting_note_action_items for select to authenticated
--     using (exists (select 1 from public.meeting_notes as mn
--                    join public.spaces as s on s.id = mn.room_id
--                    where mn.id = meeting_note_action_items.note_id
--                      and private.is_company_member(s.company_id)));
--   drop index if exists public.idx_meeting_notes_company_meeting_date;
--   drop index if exists public.idx_meeting_notes_created_by;
--   drop index if exists public.idx_meeting_notes_edited_by;
--   alter table public.meeting_notes
--     drop constraint if exists meeting_notes_content_length_check,
--     drop constraint if exists meeting_notes_transcript_identity_check,
--     drop constraint if exists meeting_notes_revision_check,
--     drop column if exists company_id,
--     drop column if exists author_user_id,
--     drop column if exists author_name,
--     drop column if exists created_by,
--     drop column if exists revision,
--     drop column if exists content,
--     drop column if exists transcript_id,
--     alter column generated_by drop default;
--   commit;

begin;

set local lock_timeout = '5s';

-- Referenced tables first (the FK additions below need SHARE ROW EXCLUSIVE on
-- them), then the note tables, so a concurrent user/space/company deletion
-- either finishes before this migration or waits for it (no lock-order cycle).
lock table public.companies, public.spaces, public.users in share row exclusive mode;
lock table public.meeting_notes, public.meeting_note_action_items in access exclusive mode;

-- SPEC §9 legacy-row preflight: refuse rather than invent a company/author.
do $$
declare
  v_unresolvable bigint;
begin
  select count(*)
  into v_unresolvable
  from public.meeting_notes as n
  left join public.spaces as s on s.id = n.room_id
  left join public.users as u on u.id = n.edited_by
  where s.company_id is null
     or u.id is null;

  if v_unresolvable > 0 then
    raise exception 'MEETING_NOTES_LEGACY_ROWS_NEED_BACKFILL: % meeting_notes row(s) have no derivable company or author', v_unresolvable
      using errcode = 'P0001',
            hint = 'Owner backfill decision required before applying (SPEC section 9 preflight).';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- meeting_notes: company, author, revision, content, transcript identity
-- ---------------------------------------------------------------------------

alter table public.meeting_notes
  add column company_id uuid,
  add column author_user_id uuid,
  add column author_name text,
  add column created_by uuid,
  add column revision bigint not null default 1,
  add column content text not null default '',
  add column transcript_id uuid;

update public.meeting_notes as n
set company_id = s.company_id,
    author_user_id = u.id,
    author_name = u.display_name,
    created_by = u.id,
    transcript_id = case when n.transcript is not null then pg_catalog.gen_random_uuid() end
from public.spaces as s, public.users as u
where s.id = n.room_id
  and u.id = n.edited_by;

alter table public.meeting_notes
  alter column company_id set not null,
  alter column author_user_id set not null,
  alter column author_name set not null,
  alter column generated_by set default 'user'::public.note_generator,
  alter column summary drop not null,
  alter column room_id drop not null,
  add constraint meeting_notes_company_id_fkey
    foreign key (company_id) references public.companies (id) on delete cascade,
  add constraint meeting_notes_created_by_fkey
    foreign key (created_by) references public.users (id) on delete set null,
  add constraint meeting_notes_revision_check check (revision >= 1),
  add constraint meeting_notes_content_length_check
    check (pg_catalog.char_length(content) <= 100000),
  add constraint meeting_notes_transcript_identity_check
    check ((transcript is null) = (transcript_id is null));

-- Deleting a space keeps its notes (FR-028).
alter table public.meeting_notes
  drop constraint meeting_notes_room_id_fkey,
  add constraint meeting_notes_room_id_fkey
    foreign key (room_id) references public.spaces (id) on delete set null;

comment on column public.meeting_notes.company_id is
  'Owning company; immutable. Read access = users.company_id equal to this value.';
comment on column public.meeting_notes.author_user_id is
  'Historical snapshot of the author''s application users.id; immutable, survives the user row.';
comment on column public.meeting_notes.author_name is
  'Historical snapshot of the author''s display name at creation; immutable.';
comment on column public.meeting_notes.created_by is
  'Live reference to the author (users.id); equals author_user_id at creation; becomes NULL only when that user row is deleted.';
comment on column public.meeting_notes.revision is
  'Note revision; every accepted change requires the current value and increments it.';
comment on column public.meeting_notes.transcript_id is
  'Identity of the stored transcript; changes whenever the transcript is replaced; NULL when none is stored.';

create index idx_meeting_notes_company_meeting_date
  on public.meeting_notes (company_id, meeting_date desc, id);
create index idx_meeting_notes_created_by
  on public.meeting_notes (created_by) where created_by is not null;
create index idx_meeting_notes_edited_by
  on public.meeting_notes (edited_by) where edited_by is not null;

-- ---------------------------------------------------------------------------
-- Participants (current state; versioned through meeting_note_versions)
-- ---------------------------------------------------------------------------

create table public.meeting_note_participants (
  note_id uuid not null references public.meeting_notes (id) on delete cascade,
  user_id uuid not null,
  display_name text not null,
  sort_order smallint not null,
  added_at timestamptz not null default pg_catalog.now(),
  constraint meeting_note_participants_pkey primary key (note_id, user_id),
  constraint meeting_note_participants_sort_order_key unique (note_id, sort_order),
  constraint meeting_note_participants_sort_order_check check (sort_order between 0 and 49)
);

comment on table public.meeting_note_participants is
  'Note participants by application users.id (no FK: a deleted or departed user keeps their place) with a display-name snapshot; at most 50 per note (sort_order 0..49).';

create index idx_meeting_note_participants_user_id
  on public.meeting_note_participants (user_id);

-- ---------------------------------------------------------------------------
-- Versions (insert-only history)
-- ---------------------------------------------------------------------------

create table public.meeting_note_versions (
  id uuid not null default pg_catalog.gen_random_uuid(),
  note_id uuid not null references public.meeting_notes (id) on delete cascade,
  revision bigint not null,
  title text not null,
  meeting_date timestamptz not null,
  participants jsonb not null default '[]'::jsonb,
  content text not null default '',
  summary text,
  editor_user_id uuid not null,
  editor_name text not null,
  edited_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint meeting_note_versions_pkey primary key (id),
  constraint meeting_note_versions_note_revision_key unique (note_id, revision),
  constraint meeting_note_versions_revision_check check (revision >= 1),
  constraint meeting_note_versions_participants_check
    check (pg_catalog.jsonb_typeof(participants) = 'array'
           and pg_catalog.jsonb_array_length(participants) <= 50),
  constraint meeting_note_versions_content_length_check
    check (pg_catalog.char_length(content) <= 100000),
  constraint meeting_note_versions_summary_not_empty_check
    check (summary is null or summary <> '')
);

comment on table public.meeting_note_versions is
  'Immutable note versions. Only edited_by (live editor reference) may change, to NULL, when that user row is deleted.';
comment on column public.meeting_note_versions.editor_user_id is
  'Historical snapshot of the editor''s application users.id; immutable.';
comment on column public.meeting_note_versions.editor_name is
  'Historical snapshot of the editor''s display name; immutable.';

create index idx_meeting_note_versions_edited_by
  on public.meeting_note_versions (edited_by) where edited_by is not null;

-- ---------------------------------------------------------------------------
-- Guards (every role, including service_role and postgres)
-- ---------------------------------------------------------------------------

create or replace function private.guard_meeting_note()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.created_by is null or new.created_by <> new.author_user_id then
      raise exception 'MEETING_NOTE_AUTHOR_MISMATCH' using errcode = '23514';
    end if;
  else
    if new.id is distinct from old.id
       or new.company_id is distinct from old.company_id
       or new.author_user_id is distinct from old.author_user_id
       or new.author_name is distinct from old.author_name
       or new.created_at is distinct from old.created_at
       or new.revision < old.revision then
      raise exception 'MEETING_NOTE_IMMUTABLE_FIELD' using errcode = '42501';
    end if;

    -- The live author reference only ever becomes NULL, and only after the
    -- user row is gone (the ON DELETE SET NULL action of a user deletion).
    if new.created_by is distinct from old.created_by
       and (new.created_by is not null
            or exists (select 1 from public.users as u where u.id = old.created_by)) then
      raise exception 'MEETING_NOTE_IMMUTABLE_FIELD' using errcode = '42501';
    end if;
  end if;

  if new.room_id is not null
     and (tg_op = 'INSERT' or new.room_id is distinct from old.room_id)
     and not exists (
       select 1
       from public.spaces as s
       where s.id = new.room_id
         and s.company_id = new.company_id
     ) then
    raise exception 'MEETING_NOTE_SPACE_OUTSIDE_COMPANY' using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function private.guard_meeting_note_participant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.note_id is distinct from old.note_id
     or new.user_id is distinct from old.user_id
     or new.display_name is distinct from old.display_name
     or new.added_at is distinct from old.added_at then
    raise exception 'MEETING_NOTE_PARTICIPANT_IMMUTABLE_FIELD' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function private.guard_meeting_note_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.edited_by is null or new.edited_by <> new.editor_user_id then
      raise exception 'MEETING_NOTE_VERSION_EDITOR_MISMATCH' using errcode = '23514';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    -- Only the cascade of the note's own deletion (note row already gone).
    if exists (select 1 from public.meeting_notes as n where n.id = old.note_id) then
      raise exception 'MEETING_NOTE_VERSION_IMMUTABLE' using errcode = '42501';
    end if;
    return old;
  end if;

  if new.id is distinct from old.id
     or new.note_id is distinct from old.note_id
     or new.revision is distinct from old.revision
     or new.title is distinct from old.title
     or new.meeting_date is distinct from old.meeting_date
     or new.participants is distinct from old.participants
     or new.content is distinct from old.content
     or new.summary is distinct from old.summary
     or new.editor_user_id is distinct from old.editor_user_id
     or new.editor_name is distinct from old.editor_name
     or new.created_at is distinct from old.created_at then
    raise exception 'MEETING_NOTE_VERSION_IMMUTABLE' using errcode = '42501';
  end if;

  if new.edited_by is distinct from old.edited_by
     and (new.edited_by is not null
          or exists (select 1 from public.users as u where u.id = old.edited_by)) then
    raise exception 'MEETING_NOTE_VERSION_IMMUTABLE' using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Row triggers do not fire on TRUNCATE; this statement guard keeps history
-- (and the notes it belongs to) from being wiped in bulk by any role.
create or replace function private.reject_meeting_note_truncate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'MEETING_NOTE_TRUNCATE_FORBIDDEN' using errcode = '42501';
end;
$$;

alter function private.guard_meeting_note() owner to postgres;
alter function private.reject_meeting_note_truncate() owner to postgres;
alter function private.guard_meeting_note_participant() owner to postgres;
alter function private.guard_meeting_note_version() owner to postgres;

revoke all on function private.guard_meeting_note() from public, anon, authenticated, service_role;
revoke all on function private.guard_meeting_note_participant() from public, anon, authenticated, service_role;
revoke all on function private.guard_meeting_note_version() from public, anon, authenticated, service_role;
revoke all on function private.reject_meeting_note_truncate() from public, anon, authenticated, service_role;

create trigger meeting_notes_guard
  before insert or update on public.meeting_notes
  for each row execute function private.guard_meeting_note();

create trigger meeting_note_participants_guard
  before update on public.meeting_note_participants
  for each row execute function private.guard_meeting_note_participant();

create trigger meeting_note_versions_guard
  before insert or update or delete on public.meeting_note_versions
  for each row execute function private.guard_meeting_note_version();

create trigger meeting_notes_reject_truncate
  before truncate on public.meeting_notes
  for each statement execute function private.reject_meeting_note_truncate();

create trigger meeting_note_participants_reject_truncate
  before truncate on public.meeting_note_participants
  for each statement execute function private.reject_meeting_note_truncate();

create trigger meeting_note_versions_reject_truncate
  before truncate on public.meeting_note_versions
  for each statement execute function private.reject_meeting_note_truncate();

-- ---------------------------------------------------------------------------
-- Grants: no client writes; authenticated reads under RLS
-- ---------------------------------------------------------------------------

alter table public.meeting_note_participants enable row level security;
alter table public.meeting_note_versions enable row level security;

revoke all on table public.meeting_notes from public, anon, authenticated;
revoke all on table public.meeting_note_action_items from public, anon, authenticated;
revoke all on table public.meeting_note_participants from public, anon, authenticated;
revoke all on table public.meeting_note_versions from public, anon, authenticated;

grant select on table public.meeting_notes to authenticated;
grant select on table public.meeting_note_action_items to authenticated;
grant select on table public.meeting_note_participants to authenticated;
grant select on table public.meeting_note_versions to authenticated;

grant select, insert, update, delete on table public.meeting_note_participants to service_role;
grant select, insert, update, delete on table public.meeting_note_versions to service_role;
revoke truncate, references, trigger on table public.meeting_notes from service_role;
revoke truncate, references, trigger on table public.meeting_note_participants from service_role;
revoke truncate, references, trigger on table public.meeting_note_versions from service_role;

-- ---------------------------------------------------------------------------
-- RLS: company scope from the note's own company_id (never through spaces)
-- ---------------------------------------------------------------------------

drop policy if exists "meeting_notes_select_same_company" on public.meeting_notes;
create policy "meeting_notes_select_same_company"
  on public.meeting_notes
  for select
  to authenticated
  using (private.is_company_member(company_id));

drop policy if exists "meeting_note_action_items_select_same_company" on public.meeting_note_action_items;
create policy "meeting_note_action_items_select_same_company"
  on public.meeting_note_action_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.meeting_notes as mn
      where mn.id = meeting_note_action_items.note_id
        and private.is_company_member(mn.company_id)
    )
  );

create policy "meeting_note_participants_select_same_company"
  on public.meeting_note_participants
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.meeting_notes as mn
      where mn.id = meeting_note_participants.note_id
        and private.is_company_member(mn.company_id)
    )
  );

create policy "meeting_note_versions_select_same_company"
  on public.meeting_note_versions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.meeting_notes as mn
      where mn.id = meeting_note_versions.note_id
        and private.is_company_member(mn.company_id)
    )
  );

commit;
