-- Phase 6 T2 (spec-interview/phase-6-meeting-notes; FR-011, FR-030, BR-005;
-- AC-008, AC-009, AC-021, AC-032): the action-item contract.
--
-- Before this migration (baseline 20260610183000, T1 20261013103447, T17
-- 20261013105021): public.meeting_note_action_items has id, note_id (-> notes
-- ON DELETE CASCADE), description (non-empty check only), assignee_id (-> users
-- ON DELETE SET NULL), due_date timestamptz, completed, created_at; no creator,
-- no assignee snapshot, no revision, no immutability; authenticated holds
-- SELECT only (RLS: members of the note's company) and there is no client
-- write path.
--
-- After this migration:
--   * Columns:
--       - due_date is a SQL date (date-only; no timezone ever applies);
--       - creator_user_id + creator_name: historical snapshots of the creating
--         user's application users.id and display name (no FK: they survive
--         the user row); immutable;
--       - assignee_id + assignee_name: the assignee's application users.id and
--         display-name snapshot, both NULL or both set; the users FK is dropped
--         (like meeting_note_participants.user_id) so a departed or deleted
--         assignee keeps their place and snapshot ("Former member", FR-030);
--         the snapshot changes only together with assignee_id;
--       - revision (bigint >= 1): every change of description, assignee, due
--         date, or completion must increase it; it never decreases;
--       - updated_at.
--     id, note_id, creator_user_id, creator_name, and created_at are immutable
--     for every role (service_role and postgres included).
--   * description must be 1-1,000 chars and not blank (NOT VALID, so a legacy
--     row cannot block the migration; it applies to every new or changed row).
--   * Capacity: at most 100 items per note, for EVERY insertion path and role.
--     A BEFORE INSERT row trigger locks the note row FOR UPDATE and counts the
--     note's items (row-level BEFORE triggers see the rows inserted earlier by
--     the same statement, so a multi-row INSERT ... SELECT is counted row by
--     row). Two concurrent insertions on one note serialize on the note row, so
--     the total can never exceed 100. T12's Apply inserts through the same
--     trigger; it must take the note row FOR UPDATE itself first (lock order).
--     The count relies on READ COMMITTED (the default for PostgREST, RPCs, and
--     server clients: each trigger statement takes a fresh snapshot after the
--     lock wait); a caller running REPEATABLE READ/SERIALIZABLE must not rely
--     on it. A trusted multi-note bulk insert must insert in note_id order.
--   * The assignee's current membership is enforced by the RPCs only; the
--     table has no client write path, and trusted roles writing it directly
--     are responsible for it (as for note participants).
--   * Items are current state only (BR-007): item changes neither bump the
--     note revision nor create note versions; each item has its own revision.
--   * Four RPCs, each SECURITY DEFINER, owner postgres, search_path '',
--     EXECUTE to authenticated only (REVOKE ALL from PUBLIC, anon,
--     authenticated, service_role first):
--       public.create_meeting_note_action_item(p_note_id uuid,
--         p_description text, p_assignee_id uuid, p_due_date date) -> jsonb item
--       public.update_meeting_note_action_item(p_item_id uuid,
--         p_expected_revision bigint, p_description text, p_assignee_id uuid,
--         p_due_date date) -> jsonb item
--         Full desired state of description, assignee, and due date
--         (completion unchanged). An unchanged assignee (same id, even a
--         former member) keeps its snapshot; a new assignee must be a current
--         member of the note's company (snapshot = current display name).
--       public.set_meeting_note_action_item_completed(p_item_id uuid,
--         p_expected_revision bigint, p_completed boolean) -> jsonb item
--         The completion-only path: changes nothing but completed (and the
--         revision/updated_at).
--       public.delete_meeting_note_action_item(p_item_id uuid,
--         p_expected_revision bigint) -> jsonb {item_id, deleted: true}
--     The jsonb item is the row (id, note_id, description, assignee_id,
--     assignee_name, due_date as 'YYYY-MM-DD', completed, revision,
--     creator_user_id, creator_name, created_at, updated_at).
--   * Rights (BR-005), evaluated on the locked pre-change state, through the
--     same rules as note edits (private.meeting_note_lock_for_change, which
--     T17's private.meeting_note_authorize now also uses, unchanged in
--     behavior): create/update/delete = note editors (author, current
--     participant, or company admin, each while a member of the note's
--     company); completion = note editors or the item's current assignee while
--     a member of the note's company.
--   * Lock order (PLAN lock order rule): caller's users row FOR KEY SHARE ->
--     note row FOR UPDATE -> item row FOR UPDATE. The only reads before the
--     caller lock are unlocked (the item's immutable note_id). A newly chosen
--     assignee's users row is not locked (it would invert the order); an
--     assignee whose removal commits during the call ends up a former member,
--     the same state as a removal one moment later (no right is gained).
--
-- Errors (message token, SQLSTATE):
--   MEETING_NOTE_NOT_FOUND (P0002): create on a missing note or a note of a
--     company the caller is not a current member of.
--   MEETING_NOTE_ITEM_NOT_FOUND (P0002): update/complete/delete of a missing
--     item, or of an item whose note's company the caller is not a current
--     member of (a former member assignee included; other companies' items
--     are indistinguishable from missing ones).
--   MEETING_NOTE_ITEM_FORBIDDEN (42501): the caller is a member but lacks the
--     right (non-editor create/update/delete; completion by a member who is
--     neither an editor nor the item's assignee).
--   MEETING_NOTE_ITEM_STALE_REVISION (P0001): p_expected_revision differs from
--     the item's current revision; DETAIL is {"current_revision": N}.
--   22023: MEETING_NOTE_ITEM_DESCRIPTION_INVALID (NULL, empty or only
--     spaces/tabs/line breaks, > 1,000 chars),
--     MEETING_NOTE_ITEM_ASSIGNEE_NOT_MEMBER (a newly chosen assignee who is not
--     a current member of the note's company), MEETING_NOTE_ITEM_REVISION_REQUIRED,
--     MEETING_NOTE_ITEM_COMPLETED_REQUIRED, MEETING_NOTE_ITEM_LIMIT_REACHED
--     (the note already has 100 items; DETAIL {"limit": 100}; raised by the
--     insert trigger for every role).
--   42501 MEETING_NOTE_ITEM_IMMUTABLE_FIELD / 23514 MEETING_NOTE_ITEM_REVISION_NOT_BUMPED
--     / 23514 MEETING_NOTE_ITEM_ASSIGNEE_SNAPSHOT_MISMATCH: guard violations by
--     a trusted role writing the table directly.
--   Any error rolls the whole call back.
--
-- Legacy rows (SPEC §9 preflight): 0 rows locally. A legacy due_date
-- timestamptz becomes the calendar date it falls on in America/Sao_Paulo
-- (the product's business timezone, FR-023); creator = the note's author
-- snapshot; assignee_name = the assignee's current display name; revision 1;
-- updated_at = created_at.
--
-- Rollback (order: FIRST roll the application back to a build that does not
-- call these RPCs, THEN run this SQL). Creator/assignee snapshots and item
-- revisions are lost; due dates become midnight America/Sao_Paulo; assignee
-- ids whose user row is gone are cleared before the FK is restored:
--   begin;
--   set local lock_timeout = '5s';
--   lock table public.users in share row exclusive mode;
--   lock table public.meeting_notes, public.meeting_note_action_items in access exclusive mode;
--   drop function if exists public.create_meeting_note_action_item(uuid, text, uuid, date);
--   drop function if exists public.update_meeting_note_action_item(uuid, bigint, text, uuid, date);
--   drop function if exists public.set_meeting_note_action_item_completed(uuid, bigint, boolean);
--   drop function if exists public.delete_meeting_note_action_item(uuid, bigint);
--   drop function if exists private.meeting_note_item_lock(uuid, bigint, text);
--   drop function if exists private.meeting_note_item_validate_description(text);
--   drop function if exists private.meeting_note_item_resolve_assignee(uuid, uuid);
--   drop trigger if exists meeting_note_action_items_guard on public.meeting_note_action_items;
--   drop trigger if exists meeting_note_action_items_reject_truncate on public.meeting_note_action_items;
--   drop function if exists private.guard_meeting_note_action_item();
--   -- Restore T17's self-contained authorize helper (verbatim body from
--   -- 20261013105021_meeting_notes_mutation_rpcs.sql, "create or replace
--   -- function private.meeting_note_authorize" through its "$$;"), re-apply its
--   -- owner/revoke lines from that file, then:
--   drop function if exists private.meeting_note_lock_for_change(uuid, text);
--   alter table public.meeting_note_action_items
--     drop constraint if exists meeting_note_action_items_description_length_check,
--     drop constraint if exists meeting_note_action_items_assignee_snapshot_check,
--     drop constraint if exists meeting_note_action_items_revision_check,
--     drop column if exists creator_user_id,
--     drop column if exists creator_name,
--     drop column if exists assignee_name,
--     drop column if exists revision,
--     drop column if exists updated_at,
--     alter column due_date type timestamptz
--       using (due_date::timestamp at time zone 'America/Sao_Paulo');
--   update public.meeting_note_action_items as i set assignee_id = null
--   where i.assignee_id is not null
--     and not exists (select 1 from public.users as u where u.id = i.assignee_id);
--   alter table public.meeting_note_action_items
--     add constraint meeting_note_action_items_assignee_id_fkey
--       foreign key (assignee_id) references public.users (id) on delete set null;
--   grant truncate, references, trigger on table public.meeting_note_action_items to service_role;
--   commit;

begin;

set local lock_timeout = '5s';

-- Same order as T1: referenced tables first, then the note tables.
lock table public.users in share row exclusive mode;
lock table public.meeting_notes, public.meeting_note_action_items in access exclusive mode;

-- ---------------------------------------------------------------------------
-- Columns and constraints
-- ---------------------------------------------------------------------------

alter table public.meeting_note_action_items
  add column creator_user_id uuid,
  add column creator_name text,
  add column assignee_name text,
  add column revision bigint not null default 1,
  add column updated_at timestamptz not null default pg_catalog.now(),
  alter column due_date type date
    using ((due_date at time zone 'America/Sao_Paulo')::date);

update public.meeting_note_action_items as i
set creator_user_id = n.author_user_id,
    creator_name = n.author_name,
    updated_at = i.created_at
from public.meeting_notes as n
where n.id = i.note_id;

update public.meeting_note_action_items as i
set assignee_name = u.display_name
from public.users as u
where u.id = i.assignee_id;

-- The assignee is identified by users.id without a FK (FR-030): deleting the
-- user keeps the id and the snapshot, like note participants.
alter table public.meeting_note_action_items
  drop constraint meeting_note_action_items_assignee_id_fkey;

alter table public.meeting_note_action_items
  alter column creator_user_id set not null,
  alter column creator_name set not null,
  add constraint meeting_note_action_items_revision_check check (revision >= 1),
  add constraint meeting_note_action_items_assignee_snapshot_check
    check ((assignee_id is null) = (assignee_name is null)),
  add constraint meeting_note_action_items_description_length_check
    check (pg_catalog.char_length(description) between 1 and 1000
           and pg_catalog.btrim(description, E' \t\r\n') <> '')
    not valid;

comment on column public.meeting_note_action_items.due_date is
  'Date-only due date (no time, no timezone); optional.';
comment on column public.meeting_note_action_items.creator_user_id is
  'Historical snapshot of the creating user''s application users.id; immutable, no FK.';
comment on column public.meeting_note_action_items.creator_name is
  'Historical snapshot of the creating user''s display name; immutable.';
comment on column public.meeting_note_action_items.assignee_id is
  'Assignee application users.id (no FK: a departed or deleted assignee keeps their place); NULL when unassigned.';
comment on column public.meeting_note_action_items.assignee_name is
  'Assignee display-name snapshot taken when the assignee was chosen; set exactly when assignee_id is set.';
comment on column public.meeting_note_action_items.revision is
  'Item revision; every change requires the current value and increments it. Independent of the note revision.';

-- ---------------------------------------------------------------------------
-- Guard (every role): capacity under the note row lock, immutable fields,
-- revision discipline, snapshot consistency
-- ---------------------------------------------------------------------------

create or replace function private.guard_meeting_note_action_item()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count bigint;
begin
  if tg_op = 'INSERT' then
    -- The single per-note lock (PLAN lock order rule). A missing note is left
    -- to the note_id FK.
    perform 1
    from public.meeting_notes as n
    where n.id = new.note_id
    for update;

    select pg_catalog.count(*)
    into v_count
    from public.meeting_note_action_items as i
    where i.note_id = new.note_id;

    if v_count >= 100 then
      raise exception 'MEETING_NOTE_ITEM_LIMIT_REACHED'
        using errcode = '22023',
              detail = '{"limit": 100}';
    end if;
    return new;
  end if;

  if new.id is distinct from old.id
     or new.note_id is distinct from old.note_id
     or new.creator_user_id is distinct from old.creator_user_id
     or new.creator_name is distinct from old.creator_name
     or new.created_at is distinct from old.created_at
     or new.revision < old.revision then
    raise exception 'MEETING_NOTE_ITEM_IMMUTABLE_FIELD' using errcode = '42501';
  end if;

  if new.assignee_name is distinct from old.assignee_name
     and new.assignee_id is not distinct from old.assignee_id then
    raise exception 'MEETING_NOTE_ITEM_ASSIGNEE_SNAPSHOT_MISMATCH' using errcode = '23514';
  end if;

  if (new.description is distinct from old.description
      or new.assignee_id is distinct from old.assignee_id
      or new.assignee_name is distinct from old.assignee_name
      or new.due_date is distinct from old.due_date
      or new.completed is distinct from old.completed)
     and new.revision <= old.revision then
    raise exception 'MEETING_NOTE_ITEM_REVISION_NOT_BUMPED' using errcode = '23514';
  end if;

  return new;
end;
$$;

alter function private.guard_meeting_note_action_item() owner to postgres;
revoke all on function private.guard_meeting_note_action_item() from public, anon, authenticated, service_role;

create trigger meeting_note_action_items_guard
  before insert or update on public.meeting_note_action_items
  for each row execute function private.guard_meeting_note_action_item();

create trigger meeting_note_action_items_reject_truncate
  before truncate on public.meeting_note_action_items
  for each statement execute function private.reject_meeting_note_truncate();

-- No client writes (unchanged); service_role keeps row DML only.
revoke all on table public.meeting_note_action_items from public, anon;
revoke insert, update, delete, truncate, references, trigger on table public.meeting_note_action_items from authenticated;
revoke truncate, references, trigger on table public.meeting_note_action_items from service_role;

-- ---------------------------------------------------------------------------
-- Shared note authorization (T17 rules, one place)
-- ---------------------------------------------------------------------------

-- Locks the caller's users row FOR KEY SHARE, then (for a current member of
-- the note's company only) the note row FOR UPDATE, and reports the caller's
-- rights on the locked pre-change state. Raises p_not_found (P0002) when the
-- note is missing or the caller is not a current member of its company.
create or replace function private.meeting_note_lock_for_change(
  p_note_id uuid,
  p_not_found text,
  out caller_id uuid,
  out caller_name text,
  out note_company_id uuid,
  out note_revision bigint,
  out can_edit boolean,
  out can_delete boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_caller record;
  v_note record;
begin
  select * into v_caller from private.meeting_note_lock_caller();
  if p_note_id is null or v_caller.caller_id is null or v_caller.caller_company_id is null then
    raise exception '%', p_not_found using errcode = 'P0002';
  end if;

  -- Outsiders never take the note lock: the company check runs on an
  -- unlocked read first (company_id is immutable, so it cannot go stale).
  if not exists (
    select 1
    from public.meeting_notes as n
    where n.id = p_note_id
      and n.company_id = v_caller.caller_company_id
  ) then
    raise exception '%', p_not_found using errcode = 'P0002';
  end if;

  select n.id, n.company_id, n.author_user_id, n.revision
  into v_note
  from public.meeting_notes as n
  where n.id = p_note_id
  for update;

  if not found then
    -- Deleted by a transaction that committed while this one waited.
    raise exception '%', p_not_found using errcode = 'P0002';
  end if;

  -- Two-valued by construction (a NULL input never grants a right).
  can_delete := coalesce(v_note.author_user_id = v_caller.caller_id, false)
                or coalesce(v_caller.caller_is_admin, false);
  can_edit := can_delete or exists (
    select 1
    from public.meeting_note_participants as p
    where p.note_id = v_note.id
      and p.user_id = v_caller.caller_id
  );
  caller_id := v_caller.caller_id;
  caller_name := v_caller.caller_name;
  note_company_id := v_note.company_id;
  note_revision := v_note.revision;
end;
$$;

-- T17's helper, now built on the shared lock-and-rights helper. Same checks,
-- order, tokens, and outputs as in 20261013105021.
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
  v_lock record;
begin
  if p_action is null or p_action not in ('edit', 'delete') then
    raise exception 'meeting_note_authorize: unknown action' using errcode = '22023';
  end if;
  if p_expected_revision is null then
    raise exception 'MEETING_NOTE_REVISION_REQUIRED' using errcode = '22023';
  end if;

  select * into v_lock from private.meeting_note_lock_for_change(p_note_id, 'MEETING_NOTE_NOT_FOUND');

  if (case p_action when 'edit' then v_lock.can_edit else v_lock.can_delete end) is not true then
    raise exception 'MEETING_NOTE_FORBIDDEN' using errcode = '42501';
  end if;

  if v_lock.note_revision <> p_expected_revision then
    raise exception 'MEETING_NOTE_STALE_REVISION'
      using errcode = 'P0001',
            detail = pg_catalog.format('{"current_revision": %s}', v_lock.note_revision);
  end if;

  caller_id := v_lock.caller_id;
  caller_name := v_lock.caller_name;
  note_company_id := v_lock.note_company_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Item helpers (no EXECUTE for any client or server role)
-- ---------------------------------------------------------------------------

create or replace function private.meeting_note_item_validate_description(p_description text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_description is null
     or pg_catalog.btrim(p_description, E' \t\r\n') = ''
     or pg_catalog.char_length(p_description) > 1000 then
    raise exception 'MEETING_NOTE_ITEM_DESCRIPTION_INVALID' using errcode = '22023';
  end if;
end;
$$;

-- The display-name snapshot of p_assignee_id when it is a current member of
-- p_company_id; NULL for NULL; otherwise MEETING_NOTE_ITEM_ASSIGNEE_NOT_MEMBER.
create or replace function private.meeting_note_item_resolve_assignee(
  p_company_id uuid,
  p_assignee_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if p_assignee_id is null then
    return null;
  end if;

  select u.display_name
  into v_name
  from public.users as u
  where u.id = p_assignee_id
    and u.company_id = p_company_id;

  if not found then
    raise exception 'MEETING_NOTE_ITEM_ASSIGNEE_NOT_MEMBER' using errcode = '22023';
  end if;
  return v_name;
end;
$$;

-- Locks caller -> note -> item (lock order rule), authorizes p_action
-- ('edit' | 'complete') on the locked pre-change state, then checks the item
-- revision. Returns the caller, the note's company, and the locked item.
create or replace function private.meeting_note_item_lock(
  p_item_id uuid,
  p_expected_revision bigint,
  p_action text,
  out caller_id uuid,
  out note_company_id uuid,
  out item_assignee_id uuid,
  out item_assignee_name text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_note_id uuid;
  v_lock record;
  v_item record;
begin
  if p_action is null or p_action not in ('edit', 'complete') then
    raise exception 'meeting_note_item_lock: unknown action' using errcode = '22023';
  end if;
  if p_expected_revision is null then
    raise exception 'MEETING_NOTE_ITEM_REVISION_REQUIRED' using errcode = '22023';
  end if;

  -- Unlocked read of the immutable note_id (no lock is taken before the
  -- caller's users row).
  select i.note_id into v_note_id
  from public.meeting_note_action_items as i
  where i.id = p_item_id;
  if p_item_id is null or v_note_id is null then
    raise exception 'MEETING_NOTE_ITEM_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_lock from private.meeting_note_lock_for_change(v_note_id, 'MEETING_NOTE_ITEM_NOT_FOUND');

  select i.id, i.assignee_id, i.assignee_name, i.revision
  into v_item
  from public.meeting_note_action_items as i
  where i.id = p_item_id
    and i.note_id = v_note_id
  for update;
  if not found then
    -- Deleted by a transaction that committed while this one waited.
    raise exception 'MEETING_NOTE_ITEM_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Null-safe: an unassigned item (assignee_id NULL) grants nothing.
  if (v_lock.can_edit
      or (p_action = 'complete'
          and v_item.assignee_id is not null
          and v_item.assignee_id = v_lock.caller_id)) is not true then
    raise exception 'MEETING_NOTE_ITEM_FORBIDDEN' using errcode = '42501';
  end if;

  if v_item.revision <> p_expected_revision then
    raise exception 'MEETING_NOTE_ITEM_STALE_REVISION'
      using errcode = 'P0001',
            detail = pg_catalog.format('{"current_revision": %s}', v_item.revision);
  end if;

  caller_id := v_lock.caller_id;
  note_company_id := v_lock.note_company_id;
  item_assignee_id := v_item.assignee_id;
  item_assignee_name := v_item.assignee_name;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs (authenticated only)
-- ---------------------------------------------------------------------------

create or replace function public.create_meeting_note_action_item(
  p_note_id uuid,
  p_description text,
  p_assignee_id uuid,
  p_due_date date
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_lock record;
  v_assignee_name text;
  v_item public.meeting_note_action_items;
begin
  perform private.meeting_note_item_validate_description(p_description);

  select * into v_lock from private.meeting_note_lock_for_change(p_note_id, 'MEETING_NOTE_NOT_FOUND');
  if v_lock.can_edit is not true then
    raise exception 'MEETING_NOTE_ITEM_FORBIDDEN' using errcode = '42501';
  end if;

  v_assignee_name := private.meeting_note_item_resolve_assignee(v_lock.note_company_id, p_assignee_id);

  -- Capacity (100) is enforced by the insert trigger under the note row lock
  -- this transaction already holds.
  insert into public.meeting_note_action_items
    (note_id, description, assignee_id, assignee_name, due_date, completed,
     creator_user_id, creator_name, revision)
  values
    (p_note_id, p_description, p_assignee_id, v_assignee_name, p_due_date, false,
     v_lock.caller_id, v_lock.caller_name, 1)
  returning * into v_item;

  return pg_catalog.to_jsonb(v_item);
end;
$$;

create or replace function public.update_meeting_note_action_item(
  p_item_id uuid,
  p_expected_revision bigint,
  p_description text,
  p_assignee_id uuid,
  p_due_date date
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_lock record;
  v_assignee_name text;
  v_item public.meeting_note_action_items;
begin
  perform private.meeting_note_item_validate_description(p_description);

  select * into v_lock from private.meeting_note_item_lock(p_item_id, p_expected_revision, 'edit');

  if p_assignee_id is not distinct from v_lock.item_assignee_id then
    -- Unchanged assignee (a former member included) keeps their snapshot.
    v_assignee_name := v_lock.item_assignee_name;
  else
    v_assignee_name := private.meeting_note_item_resolve_assignee(v_lock.note_company_id, p_assignee_id);
  end if;

  update public.meeting_note_action_items as i
  set description = p_description,
      assignee_id = p_assignee_id,
      assignee_name = v_assignee_name,
      due_date = p_due_date,
      revision = i.revision + 1,
      updated_at = pg_catalog.now()
  where i.id = p_item_id
  returning * into v_item;

  return pg_catalog.to_jsonb(v_item);
end;
$$;

create or replace function public.set_meeting_note_action_item_completed(
  p_item_id uuid,
  p_expected_revision bigint,
  p_completed boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_item public.meeting_note_action_items;
begin
  if p_completed is null then
    raise exception 'MEETING_NOTE_ITEM_COMPLETED_REQUIRED' using errcode = '22023';
  end if;

  perform private.meeting_note_item_lock(p_item_id, p_expected_revision, 'complete');

  -- Completion only: description, assignee, due date, and note are untouched.
  update public.meeting_note_action_items as i
  set completed = p_completed,
      revision = i.revision + 1,
      updated_at = pg_catalog.now()
  where i.id = p_item_id
  returning * into v_item;

  return pg_catalog.to_jsonb(v_item);
end;
$$;

create or replace function public.delete_meeting_note_action_item(
  p_item_id uuid,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.meeting_note_item_lock(p_item_id, p_expected_revision, 'edit');

  delete from public.meeting_note_action_items as i
  where i.id = p_item_id;

  return pg_catalog.jsonb_build_object('item_id', p_item_id, 'deleted', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Ownership, comments, and EXECUTE privileges
-- ---------------------------------------------------------------------------

alter function private.meeting_note_lock_for_change(uuid, text) owner to postgres;
alter function private.meeting_note_authorize(uuid, bigint, text) owner to postgres;
alter function private.meeting_note_item_validate_description(text) owner to postgres;
alter function private.meeting_note_item_resolve_assignee(uuid, uuid) owner to postgres;
alter function private.meeting_note_item_lock(uuid, bigint, text) owner to postgres;
alter function public.create_meeting_note_action_item(uuid, text, uuid, date) owner to postgres;
alter function public.update_meeting_note_action_item(uuid, bigint, text, uuid, date) owner to postgres;
alter function public.set_meeting_note_action_item_completed(uuid, bigint, boolean) owner to postgres;
alter function public.delete_meeting_note_action_item(uuid, bigint) owner to postgres;

revoke all on function private.meeting_note_lock_for_change(uuid, text) from public, anon, authenticated, service_role;
revoke all on function private.meeting_note_authorize(uuid, bigint, text) from public, anon, authenticated, service_role;
revoke all on function private.meeting_note_item_validate_description(text) from public, anon, authenticated, service_role;
revoke all on function private.meeting_note_item_resolve_assignee(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function private.meeting_note_item_lock(uuid, bigint, text) from public, anon, authenticated, service_role;
revoke all on function public.create_meeting_note_action_item(uuid, text, uuid, date) from public, anon, authenticated, service_role;
revoke all on function public.update_meeting_note_action_item(uuid, bigint, text, uuid, date) from public, anon, authenticated, service_role;
revoke all on function public.set_meeting_note_action_item_completed(uuid, bigint, boolean) from public, anon, authenticated, service_role;
revoke all on function public.delete_meeting_note_action_item(uuid, bigint) from public, anon, authenticated, service_role;

grant execute on function public.create_meeting_note_action_item(uuid, text, uuid, date) to authenticated;
grant execute on function public.update_meeting_note_action_item(uuid, bigint, text, uuid, date) to authenticated;
grant execute on function public.set_meeting_note_action_item_completed(uuid, bigint, boolean) to authenticated;
grant execute on function public.delete_meeting_note_action_item(uuid, bigint) to authenticated;

comment on function public.create_meeting_note_action_item(uuid, text, uuid, date) is
  'Phase 6 T2 (FR-011, BR-005): a note editor adds an item (description 1-1,000, optional current-member assignee with name snapshot, optional date-only due date); at most 100 items per note under the note row lock. Does not change the note revision or versions. Authenticated only.';
comment on function public.update_meeting_note_action_item(uuid, bigint, text, uuid, date) is
  'Phase 6 T2 (FR-011, FR-030, BR-005): a note editor sets an item''s description, assignee, and due date at the item''s current revision; an unchanged assignee keeps its snapshot, a new one must be a current member. Authenticated only.';
comment on function public.set_meeting_note_action_item_completed(uuid, bigint, boolean) is
  'Phase 6 T2 (FR-011, BR-005): completion-only path for note editors and the item''s current assignee while a member of the note''s company, at the item''s current revision. Authenticated only.';
comment on function public.delete_meeting_note_action_item(uuid, bigint) is
  'Phase 6 T2 (FR-011, BR-005): a note editor deletes an item at the item''s current revision. Authenticated only.';

commit;
