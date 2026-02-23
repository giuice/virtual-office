-- =============================================================================
-- Migration: Invitation System Hardening
-- Date: 2026-02-10
-- Description:
--   - Removes over-permissive invitation SELECT policy
--   - Normalizes invitation emails to lowercase
--   - Expires stale pending invitations
--   - Deduplicates active pending invitations (keep newest per company/email)
--   - Recreates invitation policies with authenticated scope and RLS initplan-friendly auth checks
--   - Adds indexes aligned with invitation query patterns
-- =============================================================================

-- 1) Normalize emails for deterministic equality lookups
update public.invitations
set email = lower(trim(email))
where email is not null
  and email <> lower(trim(email));

-- 2) Expire stale pending invites
update public.invitations
set status = 'expired'
where status = 'pending'
  and expires_at <= now();

-- 3) Keep only one active pending invite per company/email (newest wins)
with ranked_pending as (
  select
    id,
    row_number() over (
      partition by company_id, email
      order by created_at desc, id desc
    ) as row_num
  from public.invitations
  where status = 'pending'
    and expires_at > now()
)
update public.invitations i
set status = 'expired'
from ranked_pending rp
where i.id = rp.id
  and rp.row_num > 1;

-- 4) Remove over-permissive public read policy
drop policy if exists "Anyone can validate invitation by token" on public.invitations;

-- 5) Recreate invitation policies scoped to authenticated users
drop policy if exists "Company admins can read company invitations" on public.invitations;
drop policy if exists "Company admins can create invitations for their company" on public.invitations;
drop policy if exists "Company admins can update company invitations" on public.invitations;
drop policy if exists "Platform admins can create invitations for any company" on public.invitations;
drop policy if exists "Platform admins can read all invitations" on public.invitations;

create policy "Company admins can read company invitations"
  on public.invitations
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.users
      where users.supabase_uid = ((select auth.uid())::text)
        and users.company_id = invitations.company_id
        and users.role = 'admin'
    )
  );

create policy "Company admins can create invitations for their company"
  on public.invitations
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.users
      where users.supabase_uid = ((select auth.uid())::text)
        and users.company_id = invitations.company_id
        and users.role = 'admin'
    )
  );

create policy "Company admins can update company invitations"
  on public.invitations
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.users
      where users.supabase_uid = ((select auth.uid())::text)
        and users.company_id = invitations.company_id
        and users.role = 'admin'
    )
  );

create policy "Platform admins can create invitations for any company"
  on public.invitations
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.platform_admins
      where platform_admins.user_id = (select auth.uid())
    )
  );

create policy "Platform admins can read all invitations"
  on public.invitations
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.platform_admins
      where platform_admins.user_id = (select auth.uid())
    )
  );

-- 6) Query-performance indexes for invitation flows
create index if not exists idx_invitations_pending_company_expires_at
  on public.invitations (company_id, expires_at)
  where status = 'pending';

create index if not exists idx_invitations_pending_company_email_created_at
  on public.invitations (company_id, email, created_at desc)
  where status = 'pending';

create index if not exists idx_invitations_pending_email_expires_created_at
  on public.invitations (email, expires_at, created_at desc)
  where status = 'pending';

create unique index if not exists ux_invitations_pending_company_email
  on public.invitations (company_id, email)
  where status = 'pending';
