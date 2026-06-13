-- Enable and harden RLS for core tenant tables.
--
-- This migration intentionally removes existing policies on the affected tables
-- before recreating the expected access model. Several older migrations/scripts
-- created broad or deprecated policies while RLS was disabled in production.

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create or replace function private.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.id
  from public.users as u
  where u.supabase_uid = ((select auth.uid())::text)
  limit 1
$$;

create or replace function private.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.company_id
  from public.users as u
  where u.supabase_uid = ((select auth.uid())::text)
  limit 1
$$;

create or replace function private.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.role
  from public.users as u
  where u.supabase_uid = ((select auth.uid())::text)
  limit 1
$$;

create or replace function private.is_company_member(company_id_param uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.users as u
    where u.supabase_uid = ((select auth.uid())::text)
      and u.company_id = company_id_param
  )
$$;

create or replace function private.is_company_admin(company_id_param uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.users as u
    where u.supabase_uid = ((select auth.uid())::text)
      and u.company_id = company_id_param
      and u.role = 'admin'
  )
$$;

create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.platform_admins as pa
    where pa.user_id = (select auth.uid())
  )
$$;

revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, service_role;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = any (array[
        'announcements',
        'companies',
        'invitations',
        'meeting_note_action_items',
        'meeting_notes',
        'space_members',
        'space_presence_log',
        'space_reservations',
        'spaces',
        'users'
      ])
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end $$;

alter table public.announcements enable row level security;
alter table public.companies enable row level security;
alter table public.invitations enable row level security;
alter table public.meeting_note_action_items enable row level security;
alter table public.meeting_notes enable row level security;
alter table public.space_members enable row level security;
alter table public.space_presence_log enable row level security;
alter table public.space_reservations enable row level security;
alter table public.spaces enable row level security;
alter table public.users enable row level security;

revoke all on table public.announcements from anon;
revoke all on table public.companies from anon;
revoke all on table public.invitations from anon;
revoke all on table public.meeting_note_action_items from anon;
revoke all on table public.meeting_notes from anon;
revoke all on table public.space_members from anon;
revoke all on table public.space_presence_log from anon;
revoke all on table public.space_reservations from anon;
revoke all on table public.spaces from anon;
revoke all on table public.users from anon;

revoke all on table public.announcements from authenticated;
revoke all on table public.companies from authenticated;
revoke all on table public.invitations from authenticated;
revoke all on table public.meeting_note_action_items from authenticated;
revoke all on table public.meeting_notes from authenticated;
revoke all on table public.space_members from authenticated;
revoke all on table public.space_presence_log from authenticated;
revoke all on table public.space_reservations from authenticated;
revoke all on table public.spaces from authenticated;
revoke all on table public.users from authenticated;

grant select on table public.announcements to authenticated;
grant select, update (name, settings) on table public.companies to authenticated;
grant select on table public.meeting_note_action_items to authenticated;
grant select on table public.meeting_notes to authenticated;
grant select on table public.space_members to authenticated;
grant select on table public.space_presence_log to authenticated;
grant select on table public.space_reservations to authenticated;
grant select, insert, update, delete on table public.spaces to authenticated;
grant select, update (
  display_name,
  avatar_url,
  status,
  status_message,
  preferences,
  last_active
) on table public.users to authenticated;

grant all on table public.announcements to service_role;
grant all on table public.companies to service_role;
grant all on table public.invitations to service_role;
grant all on table public.meeting_note_action_items to service_role;
grant all on table public.meeting_notes to service_role;
grant all on table public.space_members to service_role;
grant all on table public.space_presence_log to service_role;
grant all on table public.space_reservations to service_role;
grant all on table public.spaces to service_role;
grant all on table public.users to service_role;

create policy "users_select_same_company_or_self"
  on public.users
  for select
  to authenticated
  using (
    supabase_uid = ((select auth.uid())::text)
    or (
      company_id is not null
      and company_id = private.current_company_id()
    )
  );

create policy "users_update_own_safe_columns"
  on public.users
  for update
  to authenticated
  using (supabase_uid = ((select auth.uid())::text))
  with check (supabase_uid = ((select auth.uid())::text));

create policy "companies_select_own_or_platform_admin"
  on public.companies
  for select
  to authenticated
  using (
    private.is_company_member(id)
    or private.is_platform_admin()
  );

create policy "companies_update_own_admin"
  on public.companies
  for update
  to authenticated
  using (private.is_company_admin(id))
  with check (private.is_company_admin(id));

create policy "spaces_select_same_company"
  on public.spaces
  for select
  to authenticated
  using (private.is_company_member(company_id));

create policy "spaces_insert_company_admin"
  on public.spaces
  for insert
  to authenticated
  with check (private.is_company_admin(company_id));

create policy "spaces_update_company_admin"
  on public.spaces
  for update
  to authenticated
  using (private.is_company_admin(company_id))
  with check (private.is_company_admin(company_id));

create policy "spaces_delete_company_admin"
  on public.spaces
  for delete
  to authenticated
  using (private.is_company_admin(company_id));

create policy "announcements_select_same_company"
  on public.announcements
  for select
  to authenticated
  using (private.is_company_member(company_id));

create policy "meeting_notes_select_same_company"
  on public.meeting_notes
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.spaces as s
      where s.id = meeting_notes.room_id
        and private.is_company_member(s.company_id)
    )
  );

create policy "meeting_note_action_items_select_same_company"
  on public.meeting_note_action_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.meeting_notes as mn
      join public.spaces as s on s.id = mn.room_id
      where mn.id = meeting_note_action_items.note_id
        and private.is_company_member(s.company_id)
    )
  );

create policy "space_members_select_same_company"
  on public.space_members
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.spaces as s
      where s.id = space_members.space_id
        and private.is_company_member(s.company_id)
    )
  );

create policy "space_presence_log_select_same_company"
  on public.space_presence_log
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.spaces as s
      where s.id = space_presence_log.space_id
        and private.is_company_member(s.company_id)
    )
  );

create policy "space_reservations_select_same_company"
  on public.space_reservations
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.spaces as s
      where s.id = space_reservations.space_id
        and private.is_company_member(s.company_id)
    )
  );

create index if not exists idx_users_supabase_uid on public.users (supabase_uid);
create index if not exists idx_users_company_id on public.users (company_id);
create index if not exists idx_spaces_company_id on public.spaces (company_id);
create index if not exists idx_announcements_company_id on public.announcements (company_id);
create index if not exists idx_meeting_notes_room_id on public.meeting_notes (room_id);
create index if not exists idx_meeting_note_action_items_note_id on public.meeting_note_action_items (note_id);
create index if not exists idx_space_members_space_id on public.space_members (space_id);
create index if not exists idx_space_members_user_id on public.space_members (user_id);
create index if not exists idx_space_presence_log_space_id on public.space_presence_log (space_id);
create index if not exists idx_space_presence_log_user_id on public.space_presence_log (user_id);
create index if not exists idx_space_reservations_space_id on public.space_reservations (space_id);
create index if not exists idx_space_reservations_user_id on public.space_reservations (user_id);
create index if not exists idx_invitations_company_status_expires_at
  on public.invitations (company_id, status, expires_at);
