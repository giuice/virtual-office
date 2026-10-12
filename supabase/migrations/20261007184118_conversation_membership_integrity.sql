-- Phase 5 T28 / AC-019, AC-024, AC-030, AC-034, BR-009, BR-010, AC-035
-- (spec-interview/phase-5-messaging-resilience, owner decision D9):
-- membership integrity — a public.conversation_members row is created or
-- restored only by a server path that authorizes that user for that
-- conversation, and the authorization still holds when the row is written.
--
-- Before this migration (D9): the baseline policies on conversation_members
-- let any authenticated user INSERT a row for itself into ANY conversation and
-- UPDATE its row into another conversation (no WITH CHECK), and members could
-- UPDATE conversations.participants / room_id / type, whose AFTER trigger
-- (sync_conversation_members) inserted a membership for EVERY id in
-- participants — also re-creating memberships that had been removed.
--
-- Membership writers after this migration (the inventory is in TRACK T28):
--   * Creation of a membership row: only SECURITY DEFINER code owned by
--     postgres — sync_conversation_members (conversation creation; additions
--     to participants), public.join_room_conversation and
--     public.restore_conversation_membership — or a database administrator
--     role. The BEFORE INSERT trigger conversation_members_guard_insert lets
--     the API roles (anon, authenticated, service_role) insert only a row that
--     ALREADY exists (the INSERT ... ON CONFLICT DO UPDATE "upsert" of a
--     preference that old builds send), locking that row FOR KEY SHARE so a
--     concurrent removal either commits first (the upsert is refused with
--     NOT_PARTICIPANT, 42501, and no row is created) or waits for it. For
--     every other inserter the same trigger is the insertion boundary: it
--     locks an existing row and refuses a revoked user (MEMBERSHIP_REVOKED),
--     after all of the caller's authorization waits.
--   * conversation_members: anon loses every write privilege; authenticated
--     keeps INSERT (that upsert) and UPDATE of its own rows (policies now
--     require user_id = the caller's users.id and, for INSERT, an existing
--     membership); DELETE and TRUNCATE are revoked from anon and authenticated
--     and the own-row DELETE policy is dropped: a client DELETE of a
--     membership — its own or anyone else's — is REFUSED (decision recorded in
--     TRACK T28; there is no client "leave"). The identity of a membership
--     (id, conversation_id, user_id) is immutable for every role
--     (conversation_members_identity_immutable), so no role can move a row to
--     another conversation or user.
--   * Removal = revocation: deleting a membership row (service role / admin;
--     not an FK cascade) records a revocation in
--     private.conversation_member_revocations. A revoked user is never
--     restored by an unrelated write (another user's join, a participants
--     change, a preference/archive/read write) nor by its own join; only
--     public.restore_conversation_membership (service_role: the explicitly
--     authorized rejoin) lifts it, re-checking the room's access rules under
--     lock (a room conversation whose space was deleted cannot be restored).
--     No other code — not even a database-administrator INSERT — lifts or
--     overrides a revocation (review T28 r1 #1). Existing participants without
--     a membership row (removed before this migration) are backfilled as
--     revoked, under an ACCESS EXCLUSIVE lock on conversations and
--     conversation_members taken before the backfill and held until COMMIT, so
--     no removal can slip between the backfill and the revocation trigger
--     (review T28 r1 #2).
--   * public.conversations (client): anon loses INSERT/UPDATE; authenticated
--     keeps INSERT (the resolver creates conversations with the user-scoped
--     client in the current, Phase 4 and hosted builds), but the BEFORE INSERT
--     trigger conversations_guard_client_insert authorizes it under row locks:
--     direct = exactly the caller and one other existing user, not in two
--     different companies (the resolver's company rule), no room, visibility
--     'direct'; room = participants exactly [caller], the caller passes the
--     room's access rules (ConversationResolverService.assertRoomAccess,
--     mirrored by private.room_access_denial) and visibility is the one the
--     resolver derives; any other type is refused for clients. Client UPDATE
--     is limited to the columns name, last_activity and is_archived (column
--     privileges): no client can change participants, room_id, type,
--     visibility or the fingerprint. DELETE and TRUNCATE are revoked from
--     anon and authenticated (no DELETE policy existed; no build deletes
--     conversations with a user-scoped client).
--   * sync_conversation_members: on INSERT it still creates the memberships
--     of the new conversation's participants; on UPDATE OF participants it
--     acts only on ids NEWLY added (removed members already in the array are
--     never re-created) and only for room conversations, after the room's
--     access rules pass under lock and no revocation exists; otherwise the
--     whole UPDATE fails (MEMBERSHIP_GRANT_FORBIDDEN / MEMBERSHIP_REVOKED /
--     ROOM_ACCESS_DENIED, 42501). This also gates the old builds' service-role
--     addParticipant (read-modify-write of participants).
--   * public.join_room_conversation(conversation, user) (service_role): the
--     current build's room join/rejoin (POST /api/conversations/join and the
--     room resolver). Idempotent for a current member; refuses non-room
--     conversations, revoked users and users the room's rules deny.
--   * public.mark_messages_read now locks the caller's membership row
--     FOR KEY SHARE (was an unlocked EXISTS), so per-message receipts are
--     never recorded for a membership removed concurrently.
--
-- Authorization at write time (PLAN review r5 #1): every grant path evaluates
-- the access rules on rows it has locked — the users rows FOR SHARE (sorted by
-- id, as every Presence/Knock function locks users), then the space row FOR
-- SHARE — and the membership insert re-checks revocations at the insertion
-- boundary (above). Revocations are UPDATEs of those rows (company/role on
-- users; company/status/access_control on spaces) or a DELETE of the
-- membership row: a revocation that committed first is seen; one in progress
-- makes the grant wait and then see it.
-- Lock order (review T28 r1 #5): join_room_conversation and
-- restore_conversation_membership take users -> space -> conversation (FOR NO
-- KEY UPDATE, re-validated after the lock). That is the Presence order
-- (users -> spaces; Presence never locks conversations) and the order of a
-- space DELETE (space, then its room conversation through ON DELETE SET NULL),
-- so these paths form no lock cycle with Presence or with space deletion. Other
-- parent deletions: a users DELETE cascades to conversation_members rows (not
-- to conversations) and is RESTRICTed by many tables; a conversations DELETE
-- cascades to its members. Residual (legacy only): an UPDATE OF participants
-- by an old build's service-role addParticipant locks the conversation first
-- and the users/space afterwards (in this trigger), the reverse of a
-- concurrent space DELETE or a T28 join/restore of the same conversation; such
-- a cycle is detected by PostgreSQL (40P01) and rolls one side back without
-- writing a membership. It disappears once no pre-T28 build is deployed. A
-- grant may wait briefly behind a Presence transition of the same user/room
-- (and vice versa).
--
-- Trust boundary: service_role and admin roles creating CONVERSATIONS
-- (test seeding) are not restricted here — that is server code. Membership
-- rows themselves cannot be created by any API role directly (see above).
--
-- Security: functions are search_path '' with schema-qualified references;
-- EXECUTE revoked from public, anon and authenticated and granted explicitly
-- (Supabase default privileges grant it on new functions). private schema is
-- not exposed through the Data API.
--
-- Backward compatible (SPEC section 10): the current and Phase 4 builds keep
-- creating direct and room conversations (user-scoped INSERT without
-- RETURNING); every build keeps joining rooms (service-role participants update
-- or the new RPC) and changing preferences/archive/read state, including the
-- hosted build's user-scoped preference/archive UPSERT of an existing
-- membership and the Phase 4 build's service-role UPSERT. Inherited limitation
-- (unchanged by this migration, review T28 r1 #6 / r2 #2): the hosted build
-- e27dd10 creates conversations with INSERT ... RETURNING (PostgREST
-- return=representation), which the conversations SELECT policies refuse
-- (403/42501) when users.id differs from users.supabase_uid — identically on
-- the pre-T28 database. What changes for old builds: an UPSERT for a user
-- without a membership row now fails instead of creating one; a service-role
-- addition to a direct/group conversation, or of a revoked or room-denied user,
-- fails.
--
-- Locking: the migration first takes, NOWAIT, EXCLUSIVE on public.users and
-- ACCESS EXCLUSIVE on public.conversations and public.conversation_members,
-- all held until COMMIT (see the comment at the LOCK statements): while it
-- runs, plain reads of users continue, but writes and row locks on users
-- (e.g. Presence transitions, foreign-key checks of inserts that reference a
-- user) and every read/write of the two messaging tables wait for this short
-- transaction (the backfill reads conversations once). If a conflicting lock
-- is held on any of these tables (e.g. an application write, a row lock such
-- as SELECT ... FOR UPDATE on users, or any access to the two messaging
-- tables; a plain read of users does not conflict), the migration fails
-- immediately with
-- lock_not_available (55P03) and changes nothing, so it never waits behind an
-- application transaction and cannot take part in a deadlock with one.
-- Operator procedure: re-run the whole migration file (same transaction) until
-- it applies; apply it at low traffic. An autovacuum worker processing one of
-- these tables (VACUUM/ANALYZE holds ShareUpdateExclusiveLock) also causes
-- 55P03; re-run after a moment.
-- Rollout: apply the migration, then deploy the T28 application promptly. Until
-- no pre-T28 build adds participants, the legacy lock-order residual described
-- above can also involve a Presence transition of a user being added (one
-- party aborted with 40P01, retryable, no membership written).
--
-- Rollback (order, SPEC BR-014): FIRST roll the application back to the T4
-- build (it does not call join_room_conversation; the T4 build's join route
-- and resolver use addParticipant, and its preference/archive writes are
-- UPSERTs), THEN run this SQL as-is. While no Phase 5 build is deployed
-- against the target the app step is a no-op. WARNING: undoing this migration
-- RESTORES the D9 self-enrolment vulnerability (clients can again enrol
-- themselves, move memberships, and add others through participants) and
-- forgets every recorded revocation. Undo it only together with the T28 app.
--   begin;
--   set local lock_timeout = '5s';
--   drop function if exists public.join_room_conversation(uuid, uuid);
--   drop function if exists public.restore_conversation_membership(uuid, uuid);
--   drop trigger if exists conversation_members_guard_insert on public.conversation_members;
--   drop trigger if exists conversation_members_identity_immutable on public.conversation_members;
--   drop trigger if exists conversation_members_record_revocation on public.conversation_members;
--   drop trigger if exists conversations_guard_client_insert on public.conversations;
--   drop function if exists private.guard_conversation_member_insert();
--   drop function if exists private.guard_conversation_member_identity();
--   drop function if exists private.record_conversation_member_revocation();
--   drop function if exists private.guard_client_conversation_insert();
--   drop function if exists private.authorize_client_conversation_insert(text, uuid[], uuid, text);
--   drop function if exists private.lock_existing_conversation_membership(uuid, uuid);
--   drop function if exists private.authorize_room_membership(uuid[], uuid);
--   drop function if exists private.room_access_denial(public.users, public.spaces);
--   drop function if exists private.jsonb_js_truthy(jsonb);
--   drop table if exists private.conversation_member_revocations;
--   create or replace function public.sync_conversation_members()
--   returns trigger
--   language plpgsql
--   security definer
--   set search_path = public, pg_temp
--   as $$
--   begin
--     insert into public.conversation_members (conversation_id, user_id, last_read_at)
--     select new.id, p.user_id, now()
--     from unnest(coalesce(new.participants, '{}'::uuid[])) as p(user_id)
--     join public.users u on u.id = p.user_id
--     on conflict (conversation_id, user_id) do nothing;
--     return new;
--   end $$;
--   create or replace function public.mark_messages_read(
--     p_conversation_id uuid,
--     p_user_id uuid,
--     p_message_ids uuid[]
--   ) returns integer
--   language plpgsql
--   security definer
--   set search_path = ''
--   as $$
--   declare
--     v_recorded integer;
--   begin
--     if p_conversation_id is null or p_user_id is null then
--       raise exception 'mark_messages_read: conversation and user are required'
--         using errcode = '22004';
--     end if;
--
--     if p_message_ids is null or pg_catalog.cardinality(p_message_ids) = 0 then
--       return 0;
--     end if;
--
--     -- Bounded input: the route caps the batch at 100 ids as well.
--     if pg_catalog.cardinality(p_message_ids) > 100 then
--       raise exception 'mark_messages_read: at most 100 message ids per call'
--         using errcode = '22023';
--     end if;
--
--     if not exists (
--       select 1
--       from public.conversation_members cm
--       where cm.conversation_id = p_conversation_id
--         and cm.user_id = p_user_id
--     ) then
--       raise exception 'mark_messages_read: user is not a member of the conversation'
--         using errcode = '42501';
--     end if;
--
--     -- Ids outside the conversation are ignored; the caller's own messages never
--     -- get a receipt (system messages with a null sender may). Repeats are
--     -- idempotent on the unique (message_id, user_id).
--     insert into public.message_read_receipts (message_id, conversation_id, user_id)
--     select m.id, m.conversation_id, p_user_id
--     from public.messages m
--     where m.conversation_id = p_conversation_id
--       and m.id = any (p_message_ids)
--       and m.sender_id is distinct from p_user_id
--     on conflict (message_id, user_id) do nothing;
--
--     get diagnostics v_recorded = row_count;
--     return v_recorded;
--   end $$;
--   drop policy if exists "Users can insert their own conversation preferences" on public.conversation_members;
--   create policy "Users can insert their own conversation preferences" on public.conversation_members
--     for insert to public
--     with check (((auth.uid())::text = (select users.supabase_uid from public.users where users.id = conversation_members.user_id)));
--   drop policy if exists "Users can update their own conversation preferences" on public.conversation_members;
--   create policy "Users can update their own conversation preferences" on public.conversation_members
--     for update to public
--     using (((auth.uid())::text = (select users.supabase_uid from public.users where users.id = conversation_members.user_id)));
--   drop policy if exists "Users can delete their own conversation preferences" on public.conversation_members;
--   create policy "Users can delete their own conversation preferences" on public.conversation_members
--     for delete to public
--     using (((auth.uid())::text = (select users.supabase_uid from public.users where users.id = conversation_members.user_id)));
--   revoke update (name, last_activity, is_archived) on table public.conversations from authenticated;
--   grant all on table public.conversations to anon, authenticated;
--   grant all on table public.conversation_members to anon, authenticated;
--   grant execute on function public.sync_conversation_members() to public, anon, authenticated;
--   delete from supabase_migrations.schema_migrations where version = '20261007184118';
--   commit;

begin;

set local lock_timeout = '5s';

-- Review T28 r1 #2: no membership may be removed between the backfill below
-- and the installation of the revocation trigger, so the tables are locked for
-- the whole migration: public.users (EXCLUSIVE: it includes the SHARE ROW
-- EXCLUSIVE the revocations foreign key needs, and it also excludes row locks
-- on users — a SELECT ... FOR UPDATE holder would otherwise make the
-- backfill's foreign-key check wait; Supabase/RLS review of r2), public.conversations
-- and public.conversation_members (ACCESS EXCLUSIVE). Review T28 r2 #1:
-- application transactions take these tables in BOTH orders (e.g.
-- mark_conversation_read updates conversation_members and then its receipt
-- inserts lock conversations through their foreign key; joins lock users and
-- conversations; Presence writes users), so no table order is safe while
-- waiting. Every lock is therefore taken NOWAIT: the migration never waits
-- behind (nor deadlocks with) an application transaction; on contention it
-- fails at once with lock_not_available (55P03) before changing anything, and
-- the operator re-runs the whole migration. Once these locks are held, no later
-- statement of this migration waits for an application lock: the rows it
-- reads or references (users, conversations, conversation_members) cannot be
-- locked by anyone else, the revocations table is new, and functions, triggers,
-- policies and grants touch only the catalog and these tables.
lock table public.users in exclusive mode nowait;
lock table public.conversations, public.conversation_members in access exclusive mode nowait;

-- ---------------------------------------------------------------------------
-- 1. Revocations (removed memberships stay removed).
-- ---------------------------------------------------------------------------
create table if not exists private.conversation_member_revocations (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  revoked_at timestamptz not null default pg_catalog.now(),
  primary key (conversation_id, user_id)
);

create index if not exists idx_conversation_member_revocations_user_id
  on private.conversation_member_revocations (user_id);

alter table private.conversation_member_revocations enable row level security;
revoke all on table private.conversation_member_revocations from public, anon, authenticated, service_role;

comment on table private.conversation_member_revocations is
  'Phase 5 T28: memberships removed (DELETE of a conversation_members row that was not an FK cascade). A revoked user is never re-added by participants syncs or joins; only public.restore_conversation_membership lifts it. No API role has any privilege.';

-- Participants that lost their membership before this migration (a removed
-- member stays in conversations.participants) are revocations.
insert into private.conversation_member_revocations (conversation_id, user_id)
select distinct c.id, p.user_id
from public.conversations c
cross join lateral pg_catalog.unnest(c.participants) as p(user_id)
join public.users u on u.id = p.user_id
where not exists (
  select 1
  from public.conversation_members cm
  where cm.conversation_id = c.id
    and cm.user_id = p.user_id
)
on conflict (conversation_id, user_id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Room access rules (ConversationResolverService.assertRoomAccess).
-- ---------------------------------------------------------------------------
-- JavaScript truthiness of a JSON value as the TypeScript code sees it after
-- JSON.parse (numbers become IEEE doubles). Returns NULL for a number outside
-- the double range — e.g. 1e-400, which JSON.parse turns into 0, or 1e400
-- (Infinity) — because PostgreSQL refuses it as out of range; callers treat
-- NULL as a malformed ACL and deny (ROOM_ACL_INVALID), never as truthy.
create or replace function private.jsonb_js_truthy(p_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  case pg_catalog.jsonb_typeof(p_value)
    when 'boolean' then
      return (p_value)::text::boolean;
    when 'number' then
      begin
        return ((p_value)::text)::double precision <> 0;
      exception when numeric_value_out_of_range then
        return null;
      end;
    when 'string' then
      return (p_value #>> '{}') <> '';
    when 'object' then
      return true;
    when 'array' then
      return true;
    else
      -- JSON null, or a missing key (SQL NULL).
      return false;
  end case;
end;
$$;

revoke all on function private.jsonb_js_truthy(jsonb) from public, anon, authenticated, service_role;

-- Pure function of the two rows; null = allowed, otherwise the reason.
-- Mirrors the TypeScript rule: different (non-null) companies deny; with an
-- access_control object, a non-empty allowedUsers must contain users.id, a
-- non-empty allowedRoles must contain the user's role, and a room that is not
-- public (JavaScript truthiness of isPublic) with no allowed users/roles
-- denies a user without a company; a falsy access_control (null, false, 0,
-- "") skips the access-control checks, as in TypeScript. Stricter than the
-- TypeScript rule only for malformed data, which denies (ROOM_ACL_INVALID): an
-- allowedUsers/allowedRoles that is neither an array nor null (TypeScript
-- would treat a string by its characters), and an access_control or isPublic
-- number outside the double range (JSON.parse would turn it into 0/Infinity).
create or replace function private.room_access_denial(p_user public.users, p_space public.spaces)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_ac jsonb := p_space.access_control;
  v_users jsonb;
  v_roles jsonb;
  v_truthy boolean;
  v_public boolean;
begin
  if p_space.company_id is not null
     and p_user.company_id is not null
     and p_space.company_id <> p_user.company_id then
    return 'COMPANY_MISMATCH';
  end if;

  -- `if (accessControl)`: a falsy value (null, false, 0, "") skips every
  -- access-control check.
  v_truthy := private.jsonb_js_truthy(v_ac);
  if v_truthy is null then
    return 'ROOM_ACL_INVALID';
  end if;
  if not v_truthy then
    return null;
  end if;
  if pg_catalog.jsonb_typeof(v_ac) <> 'object' then
    -- A truthy JavaScript non-object (true, string, number, array) has no
    -- such properties.
    v_ac := '{}'::jsonb;
  end if;

  v_users := v_ac -> 'allowedUsers';
  v_roles := v_ac -> 'allowedRoles';
  if v_users is null or pg_catalog.jsonb_typeof(v_users) = 'null' then
    v_users := '[]'::jsonb;
  end if;
  if v_roles is null or pg_catalog.jsonb_typeof(v_roles) = 'null' then
    v_roles := '[]'::jsonb;
  end if;
  if pg_catalog.jsonb_typeof(v_users) <> 'array' or pg_catalog.jsonb_typeof(v_roles) <> 'array' then
    return 'ROOM_ACL_INVALID';
  end if;

  if pg_catalog.jsonb_array_length(v_users) > 0 and not (v_users ? (p_user.id)::text) then
    return 'NOT_ALLOWED_USER';
  end if;
  if pg_catalog.jsonb_array_length(v_roles) > 0
     and p_user.role is not null
     and not (v_roles ? (p_user.role)::text) then
    return 'NOT_ALLOWED_ROLE';
  end if;

  v_public := private.jsonb_js_truthy(v_ac -> 'isPublic');
  if v_public is null then
    return 'ROOM_ACL_INVALID';
  end if;
  if not v_public
     and pg_catalog.jsonb_array_length(v_users) = 0
     and pg_catalog.jsonb_array_length(v_roles) = 0
     and p_user.company_id is null then
    return 'PRIVATE_NO_COMPANY';
  end if;

  return null;
end;
$$;

revoke all on function private.room_access_denial(public.users, public.spaces) from public, anon, authenticated, service_role;

-- Locks the users (FOR SHARE, id order) and then the space (FOR SHARE) and
-- raises unless every user passes the room's access rules on the locked rows:
-- USER_NOT_FOUND / ROOM_NOT_FOUND (P0002), ROOM_ACCESS_DENIED (42501).
-- Called only from SECURITY DEFINER code of this migration.
create or replace function private.authorize_room_membership(p_user_ids uuid[], p_space_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_user public.users;
  v_space public.spaces;
  v_count integer;
begin
  if p_space_id is null or p_user_ids is null or pg_catalog.cardinality(p_user_ids) = 0 then
    raise exception 'ROOM_NOT_FOUND' using errcode = 'P0002';
  end if;

  select pg_catalog.count(*) into v_count
  from (
    select u.id
    from public.users u
    where u.id = any (p_user_ids)
    order by u.id
    for share
  ) as locked;
  if v_count <> (select pg_catalog.count(distinct x) from pg_catalog.unnest(p_user_ids) as t(x) where x is not null)
     or array_position(p_user_ids, null) is not null then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
  end if;

  select s.* into v_space
  from public.spaces s
  where s.id = p_space_id
  for share;
  if not found then
    raise exception 'ROOM_NOT_FOUND' using errcode = 'P0002';
  end if;

  for v_user in
    select u.* from public.users u where u.id = any (p_user_ids) order by u.id
  loop
    if private.room_access_denial(v_user, v_space) is not null then
      raise exception 'ROOM_ACCESS_DENIED' using errcode = '42501',
        detail = private.room_access_denial(v_user, v_space);
    end if;
  end loop;
end;
$$;

revoke all on function private.authorize_room_membership(uuid[], uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. conversation_members: client writes.
-- ---------------------------------------------------------------------------
-- Locks the existing membership row FOR KEY SHARE (a concurrent DELETE waits
-- for the caller, or has committed and the row is gone). True when it exists.
create or replace function private.lock_existing_conversation_membership(p_conversation_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1
  from public.conversation_members cm
  where cm.conversation_id = p_conversation_id
    and cm.user_id = p_user_id
  for key share;
  return found;
end;
$$;

revoke all on function private.lock_existing_conversation_membership(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function private.lock_existing_conversation_membership(uuid, uuid) to authenticated, service_role;

-- SECURITY INVOKER on purpose: current_user is the role of the INSERT
-- statement (anon/authenticated/service_role for Data API requests; the
-- function owner inside SECURITY DEFINER code such as the participants sync).
create or replace function private.guard_conversation_member_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated', 'service_role') then
    -- API roles never create a membership: only the upsert of an existing
    -- row (which then takes the ON CONFLICT DO UPDATE path) is accepted.
    if not private.lock_existing_conversation_membership(new.conversation_id, new.user_id) then
      raise exception 'NOT_PARTICIPANT' using errcode = '42501';
    end if;
  else
    -- Authorized creation (SECURITY DEFINER code of this migration, or a
    -- database administrator). Review T28 r1 #1: re-checked here, at the
    -- insertion boundary, after every authorization wait of the caller. The
    -- existing row (if any) is locked first, so a removal either committed
    -- (row gone, its revocation committed with it and visible below) or waits
    -- for this transaction. A revoked user is never inserted; only
    -- public.restore_conversation_membership lifts a revocation (it deletes
    -- the revocation before inserting).
    perform 1
    from public.conversation_members cm
    where cm.conversation_id = new.conversation_id
      and cm.user_id = new.user_id
    for key share;
    if exists (
      select 1
      from private.conversation_member_revocations r
      where r.conversation_id = new.conversation_id
        and r.user_id = new.user_id
    ) then
      raise exception 'MEMBERSHIP_REVOKED' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_conversation_member_insert() from public, anon, authenticated, service_role;

drop trigger if exists conversation_members_guard_insert on public.conversation_members;
create trigger conversation_members_guard_insert
  before insert on public.conversation_members
  for each row execute function private.guard_conversation_member_insert();

create or replace function private.guard_conversation_member_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.conversation_id is distinct from old.conversation_id
     or new.user_id is distinct from old.user_id then
    raise exception 'MEMBERSHIP_IDENTITY_IMMUTABLE' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_conversation_member_identity() from public, anon, authenticated, service_role;

drop trigger if exists conversation_members_identity_immutable on public.conversation_members;
create trigger conversation_members_identity_immutable
  before update on public.conversation_members
  for each row execute function private.guard_conversation_member_identity();

-- A removed membership (not an FK cascade of a deleted conversation or user,
-- whose parent row is already gone) becomes a revocation.
create or replace function private.record_conversation_member_revocation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.conversation_member_revocations (conversation_id, user_id)
  select old.conversation_id, old.user_id
  where exists (select 1 from public.conversations c where c.id = old.conversation_id)
    and exists (select 1 from public.users u where u.id = old.user_id)
  on conflict (conversation_id, user_id) do update
    set revoked_at = pg_catalog.now();
  return old;
end;
$$;

revoke all on function private.record_conversation_member_revocation() from public, anon, authenticated, service_role;

drop trigger if exists conversation_members_record_revocation on public.conversation_members;
create trigger conversation_members_record_revocation
  after delete on public.conversation_members
  for each row execute function private.record_conversation_member_revocation();

drop policy if exists "Users can delete their own conversation preferences" on public.conversation_members;

drop policy if exists "Users can insert their own conversation preferences" on public.conversation_members;
create policy "Users can insert their own conversation preferences"
  on public.conversation_members
  for insert
  to authenticated
  with check (
    user_id = (select private.current_app_user_id())
    and private.is_conversation_member(conversation_id)
  );

drop policy if exists "Users can update their own conversation preferences" on public.conversation_members;
create policy "Users can update their own conversation preferences"
  on public.conversation_members
  for update
  to authenticated
  using (user_id = (select private.current_app_user_id()))
  with check (user_id = (select private.current_app_user_id()));

revoke insert, update, delete, truncate on table public.conversation_members from anon;
revoke delete, truncate on table public.conversation_members from authenticated;

-- ---------------------------------------------------------------------------
-- 4. conversations: client writes.
-- ---------------------------------------------------------------------------
-- Authorizes a client-created conversation under row locks (see header).
-- Raises CONVERSATION_CREATE_FORBIDDEN / ROOM_ACCESS_DENIED (42501),
-- USER_NOT_FOUND / ROOM_NOT_FOUND (P0002).
create or replace function private.authorize_client_conversation_insert(
  p_type text,
  p_participants uuid[],
  p_room_id uuid,
  p_visibility text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := private.current_app_user_id();
  v_users public.users[];
  v_space public.spaces;
  v_derived text;
begin
  if v_caller is null
     or p_participants is null
     or array_position(p_participants, null) is not null
     or not (v_caller = any (p_participants)) then
    raise exception 'CONVERSATION_CREATE_FORBIDDEN' using errcode = '42501';
  end if;

  if p_type = 'direct' then
    if pg_catalog.cardinality(p_participants) <> 2
       or (select pg_catalog.count(distinct x) from pg_catalog.unnest(p_participants) as t(x)) <> 2
       or p_room_id is not null
       or p_visibility is distinct from 'direct' then
      raise exception 'CONVERSATION_CREATE_FORBIDDEN' using errcode = '42501';
    end if;

    select pg_catalog.array_agg(locked order by (locked).id) into v_users
    from (
      select u as locked
      from public.users u
      where u.id = any (p_participants)
      order by u.id
      for share
    ) as l;
    if coalesce(pg_catalog.cardinality(v_users), 0) <> 2 then
      raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
    end if;
    if (v_users[1]).company_id is not null
       and (v_users[2]).company_id is not null
       and (v_users[1]).company_id <> (v_users[2]).company_id then
      raise exception 'CONVERSATION_CREATE_FORBIDDEN' using errcode = '42501',
        detail = 'COMPANY_MISMATCH';
    end if;
    return;
  end if;

  if p_type = 'room' then
    if pg_catalog.cardinality(p_participants) <> 1 or p_room_id is null then
      raise exception 'CONVERSATION_CREATE_FORBIDDEN' using errcode = '42501';
    end if;
    perform private.authorize_room_membership(array[v_caller], p_room_id);

    select s.* into v_space from public.spaces s where s.id = p_room_id;
    v_derived := case
      when (v_space.access_control -> 'isPublic') = 'false'::jsonb then 'private'
      else 'public'
    end;
    if p_visibility is distinct from v_derived then
      raise exception 'CONVERSATION_CREATE_FORBIDDEN' using errcode = '42501',
        detail = 'VISIBILITY_MISMATCH';
    end if;
    return;
  end if;

  raise exception 'CONVERSATION_CREATE_FORBIDDEN' using errcode = '42501';
end;
$$;

revoke all on function private.authorize_client_conversation_insert(text, uuid[], uuid, text) from public, anon, authenticated, service_role;
grant execute on function private.authorize_client_conversation_insert(text, uuid[], uuid, text) to authenticated;

-- SECURITY INVOKER: current_user identifies a Data API client.
create or replace function private.guard_client_conversation_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    perform private.authorize_client_conversation_insert(
      (new.type)::text, new.participants, new.room_id, (new.visibility)::text);
  end if;
  return new;
end;
$$;

revoke all on function private.guard_client_conversation_insert() from public, anon, authenticated, service_role;

drop trigger if exists conversations_guard_client_insert on public.conversations;
create trigger conversations_guard_client_insert
  before insert on public.conversations
  for each row execute function private.guard_client_conversation_insert();

revoke insert, update, delete, truncate on table public.conversations from anon;
-- No client deletes conversations (there is no DELETE policy; the only caller
-- of a conversation delete is the service-role test seeder).
revoke update, delete, truncate on table public.conversations from authenticated;
grant update (name, last_activity, is_archived) on table public.conversations to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Participants sync: creation, and authorized additions only.
-- ---------------------------------------------------------------------------
create or replace function public.sync_conversation_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_added uuid[];
begin
  if tg_op = 'INSERT' then
    -- The memberships of a new conversation (client inserts were authorized
    -- by conversations_guard_client_insert; service-role/admin inserts are
    -- server code).
    insert into public.conversation_members (conversation_id, user_id, last_read_at)
    select new.id, u.id, pg_catalog.now()
    from public.users u
    where u.id = any (coalesce(new.participants, '{}'::uuid[]))
    on conflict (conversation_id, user_id) do nothing;
    return new;
  end if;

  -- UPDATE OF participants: only ids newly added get a membership; an id
  -- already in the old array (e.g. a removed member) is never re-created.
  select coalesce(pg_catalog.array_agg(distinct u.id order by u.id), '{}'::uuid[])
  into v_added
  from public.users u
  where u.id = any (coalesce(new.participants, '{}'::uuid[]))
    and array_position(coalesce(old.participants, '{}'::uuid[]), u.id) is null;

  if pg_catalog.cardinality(v_added) = 0 then
    return new;
  end if;

  if new.type <> 'room'::public.conversation_type or new.room_id is null then
    raise exception 'MEMBERSHIP_GRANT_FORBIDDEN' using errcode = '42501';
  end if;
  if exists (
    select 1
    from private.conversation_member_revocations r
    where r.conversation_id = new.id
      and r.user_id = any (v_added)
  ) then
    raise exception 'MEMBERSHIP_REVOKED' using errcode = '42501';
  end if;

  perform private.authorize_room_membership(v_added, new.room_id);

  insert into public.conversation_members (conversation_id, user_id, last_read_at)
  select new.id, a.user_id, pg_catalog.now()
  from pg_catalog.unnest(v_added) as a(user_id)
  on conflict (conversation_id, user_id) do nothing;
  return new;
end;
$$;

-- A trigger function cannot be called directly; the baseline grants are still
-- removed from the API roles (RLS review). service_role keeps its grant.
revoke execute on function public.sync_conversation_members() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Server join / authorized rejoin.
-- ---------------------------------------------------------------------------
-- Room join (POST /api/conversations/join, room resolver). Returns true when a
-- membership was created, false when the user already is a member. Raises
-- CONVERSATION_NOT_FOUND / ROOM_NOT_FOUND / USER_NOT_FOUND (P0002),
-- JOIN_FORBIDDEN / MEMBERSHIP_REVOKED / ROOM_ACCESS_DENIED (42501).
-- Lock order (review T28 r1 #5): the user and the space (authorize_room_
-- membership: users -> spaces, the Presence order), THEN the conversation —
-- the order of a space DELETE, which locks the space and then, through
-- ON DELETE SET NULL, its room conversation. The conversation is re-read
-- under its lock and must still belong to the authorized room.
create or replace function public.join_room_conversation(p_conversation_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation public.conversations;
  v_room_id uuid;
begin
  if p_conversation_id is null or p_user_id is null then
    raise exception 'join_room_conversation: conversation and user are required' using errcode = '22004';
  end if;

  -- Unlocked read: a current member is answered without any lock (no grant).
  select c.* into v_conversation
  from public.conversations c
  where c.id = p_conversation_id;
  if not found then
    raise exception 'CONVERSATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.user_id = p_user_id
  ) then
    return false;
  end if;
  if v_conversation.type <> 'room'::public.conversation_type or v_conversation.room_id is null then
    raise exception 'JOIN_FORBIDDEN' using errcode = '42501';
  end if;
  v_room_id := v_conversation.room_id;

  perform private.authorize_room_membership(array[p_user_id], v_room_id);

  select c.* into v_conversation
  from public.conversations c
  where c.id = p_conversation_id
  for no key update;
  if not found then
    raise exception 'CONVERSATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_conversation.type <> 'room'::public.conversation_type
     or v_conversation.room_id is distinct from v_room_id then
    raise exception 'JOIN_FORBIDDEN' using errcode = '42501';
  end if;
  if exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.user_id = p_user_id
  ) then
    return false;
  end if;
  if exists (
    select 1
    from private.conversation_member_revocations r
    where r.conversation_id = p_conversation_id
      and r.user_id = p_user_id
  ) then
    raise exception 'MEMBERSHIP_REVOKED' using errcode = '42501';
  end if;

  if array_position(coalesce(v_conversation.participants, '{}'::uuid[]), p_user_id) is null then
    -- sync_conversation_members creates the membership (same checks; the
    -- locks are already held, so it does not wait).
    update public.conversations c
    set participants = pg_catalog.array_append(coalesce(c.participants, '{}'::uuid[]), p_user_id)
    where c.id = p_conversation_id;
  else
    insert into public.conversation_members (conversation_id, user_id, last_read_at)
    values (p_conversation_id, p_user_id, pg_catalog.now())
    on conflict (conversation_id, user_id) do nothing;
  end if;
  return true;
end;
$$;

revoke all on function public.join_room_conversation(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.join_room_conversation(uuid, uuid) to service_role;

-- The explicitly authorized rejoin of a revoked member (server/admin only), and
-- the only code that lifts a revocation. A ROOM conversation requires the
-- room's access rules on the locked rows; a room conversation whose space was
-- deleted (room_id set NULL) raises ROOM_NOT_FOUND and keeps the revocation
-- (review T28 r1 #4). A direct or group conversation restores only an original
-- participant. Same lock order as join_room_conversation. Returns false when
-- the user already is a member. Raises CONVERSATION_NOT_FOUND / ROOM_NOT_FOUND
-- / USER_NOT_FOUND (P0002), MEMBERSHIP_GRANT_FORBIDDEN / ROOM_ACCESS_DENIED
-- (42501).
create or replace function public.restore_conversation_membership(p_conversation_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation public.conversations;
  v_type public.conversation_type;
  v_room_id uuid;
  v_in_participants boolean;
begin
  if p_conversation_id is null or p_user_id is null then
    raise exception 'restore_conversation_membership: conversation and user are required' using errcode = '22004';
  end if;

  select c.* into v_conversation
  from public.conversations c
  where c.id = p_conversation_id;
  if not found then
    raise exception 'CONVERSATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.user_id = p_user_id
  ) then
    return false;
  end if;
  v_type := v_conversation.type;
  v_room_id := v_conversation.room_id;

  if v_type = 'room'::public.conversation_type then
    if v_room_id is null then
      raise exception 'ROOM_NOT_FOUND' using errcode = 'P0002';
    end if;
    perform private.authorize_room_membership(array[p_user_id], v_room_id);
  else
    perform 1 from public.users u where u.id = p_user_id for share;
    if not found then
      raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  select c.* into v_conversation
  from public.conversations c
  where c.id = p_conversation_id
  for no key update;
  if not found then
    raise exception 'CONVERSATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_conversation.type is distinct from v_type
     or v_conversation.room_id is distinct from v_room_id then
    raise exception 'MEMBERSHIP_GRANT_FORBIDDEN' using errcode = '42501';
  end if;
  if exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.user_id = p_user_id
  ) then
    return false;
  end if;

  v_in_participants :=
    array_position(coalesce(v_conversation.participants, '{}'::uuid[]), p_user_id) is not null;
  if v_type <> 'room'::public.conversation_type and not v_in_participants then
    raise exception 'MEMBERSHIP_GRANT_FORBIDDEN' using errcode = '42501';
  end if;

  delete from private.conversation_member_revocations r
  where r.conversation_id = p_conversation_id
    and r.user_id = p_user_id;

  if not v_in_participants then
    update public.conversations c
    set participants = pg_catalog.array_append(coalesce(c.participants, '{}'::uuid[]), p_user_id)
    where c.id = p_conversation_id;
  else
    insert into public.conversation_members (conversation_id, user_id, last_read_at)
    values (p_conversation_id, p_user_id, pg_catalog.now())
    on conflict (conversation_id, user_id) do nothing;
  end if;
  return true;
end;
$$;

revoke all on function public.restore_conversation_membership(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.restore_conversation_membership(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 7. Per-message read receipts: lock the membership (never for a removed one).
-- ---------------------------------------------------------------------------
create or replace function public.mark_messages_read(p_conversation_id uuid, p_user_id uuid, p_message_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recorded integer;
begin
  if p_conversation_id is null or p_user_id is null then
    raise exception 'mark_messages_read: conversation and user are required'
      using errcode = '22004';
  end if;

  if p_message_ids is null or pg_catalog.cardinality(p_message_ids) = 0 then
    return 0;
  end if;

  -- Bounded input: the route caps the batch at 100 ids as well.
  if pg_catalog.cardinality(p_message_ids) > 100 then
    raise exception 'mark_messages_read: at most 100 message ids per call'
      using errcode = '22023';
  end if;

  -- Phase 5 T28: the membership row is locked until commit, so a concurrent
  -- removal either committed first (refused here) or waits for these receipts.
  perform 1
  from public.conversation_members cm
  where cm.conversation_id = p_conversation_id
    and cm.user_id = p_user_id
  for key share;
  if not found then
    raise exception 'mark_messages_read: user is not a member of the conversation'
      using errcode = '42501';
  end if;

  -- Ids outside the conversation are ignored; the caller's own messages never
  -- get a receipt (system messages with a null sender may). Repeats are
  -- idempotent on the unique (message_id, user_id).
  insert into public.message_read_receipts (message_id, conversation_id, user_id)
  select m.id, m.conversation_id, p_user_id
  from public.messages m
  where m.conversation_id = p_conversation_id
    and m.id = any (p_message_ids)
    and m.sender_id is distinct from p_user_id
  on conflict (message_id, user_id) do nothing;

  get diagnostics v_recorded = row_count;
  return v_recorded;
end;
$$;

commit;
