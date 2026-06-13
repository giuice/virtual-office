-- Phase 2.2 (messaging audit 2026-06-10): one read model.
--
-- conversation_preferences becomes conversation_members. After the backfill,
-- row existence means MEMBERSHIP, not "user customized prefs". Unread counts
-- are now derived from conversation_members.last_read_at (get_unread_counts);
-- the conversations.unread_count JSONB is no longer written (column dropped in
-- a later cleanup phase). message_read_receipts stays as the per-message
-- source of truth for the sender-side read indicator.
--
-- NOTE: participants[] on conversations remains the authorization source in
-- this phase (Phase 2.3 / S-05 switches authz to conversation_members).

-- ============================================================================
-- 1) Rename + new columns (guarded so a partially-applied run can be retried)
-- ============================================================================
do $$
begin
  if to_regclass('public.conversation_preferences') is not null
     and to_regclass('public.conversation_members') is null then
    alter table public.conversation_preferences rename to conversation_members;
  end if;
end $$;

alter table public.conversation_members
  add column if not exists last_read_at timestamptz,
  add column if not exists joined_at timestamptz not null default now();

comment on table public.conversation_members is
  'Conversation membership with per-user read cursor (last_read_at) and per-user settings (pin/star/archive/notifications). One row per (conversation, participant).';
comment on column public.conversation_members.last_read_at is
  'Per-user read cursor. Unread = messages with timestamp > last_read_at and a different sender.';

-- ============================================================================
-- 2) Backfill one row per (conversation, participant).
--    last_read_at = now(): unread badges reset to 0 once at rollout (accepted;
--    the old JSONB counts are not reconstructed).
-- ============================================================================
insert into public.conversation_members (conversation_id, user_id, last_read_at, joined_at)
select c.id, p.user_id, now(), coalesce(c.created_at, now())
from public.conversations c
cross join lateral unnest(coalesce(c.participants, '{}'::uuid[])) as p(user_id)
join public.users u on u.id = p.user_id
on conflict (conversation_id, user_id) do nothing;

update public.conversation_members set last_read_at = now() where last_read_at is null;

-- ============================================================================
-- 3) Membership sync trigger: replaces create_default_conversation_preference
--    (INSERT-only) and also fires when participants[] changes (addParticipant),
--    so member rows are guaranteed DB-side on every membership path.
-- ============================================================================
drop trigger if exists trigger_create_default_conversation_preferences on public.conversations;
drop function if exists public.create_default_conversation_preference();

create or replace function public.sync_conversation_members()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.conversation_members (conversation_id, user_id, last_read_at)
  select new.id, p.user_id, now()
  from unnest(coalesce(new.participants, '{}'::uuid[])) as p(user_id)
  join public.users u on u.id = p.user_id
  on conflict (conversation_id, user_id) do nothing;
  return new;
end $$;

comment on function public.sync_conversation_members is
  'Keeps conversation_members in sync with conversations.participants on insert and participant changes.';

drop trigger if exists trigger_sync_conversation_members on public.conversations;
create trigger trigger_sync_conversation_members
  after insert or update of participants on public.conversations
  for each row execute function public.sync_conversation_members();

-- ============================================================================
-- 4) Receipts: denormalized conversation_id so realtime postgres_changes can
--    filter per conversation (filters cannot do message_id IN (...)) and the
--    mark-read bulk insert is indexable.
-- ============================================================================
alter table public.message_read_receipts
  add column if not exists conversation_id uuid references public.conversations(id) on delete cascade;

update public.message_read_receipts r
set conversation_id = m.conversation_id
from public.messages m
where m.id = r.message_id and r.conversation_id is null;

create index if not exists idx_read_receipts_conversation
  on public.message_read_receipts (conversation_id, user_id);

-- Backing index for the unread aggregate.
create index if not exists idx_messages_conversation_timestamp
  on public.messages (conversation_id, "timestamp" desc);

-- ============================================================================
-- 5) RPC: viewer's unread counts for a page of conversations (single
--    aggregate, no N+1). Viewer derived server-side; counts are never exposed
--    for other users (fixes the unread_count JSONB privacy leak).
--    sender_id IS DISTINCT FROM user_id so system messages (null sender)
--    count as unread too.
-- ============================================================================
-- Drop first: an older version may exist with different parameter names,
-- and CREATE OR REPLACE cannot rename parameters (error 42P13).
drop function if exists public.get_unread_counts(uuid[]);
create function public.get_unread_counts(p_conversation_ids uuid[])
returns table (conversation_id uuid, unread_count bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select cm.conversation_id, count(m.id)::bigint
  from public.conversation_members cm
  left join public.messages m
    on m.conversation_id = cm.conversation_id
   and m."timestamp" > coalesce(cm.last_read_at, '-infinity'::timestamptz)
   and m.sender_id is distinct from cm.user_id
  where cm.user_id = private.current_app_user_id()
    and cm.conversation_id = any (p_conversation_ids)
  group by cm.conversation_id
$$;

revoke all on function public.get_unread_counts(uuid[]) from public;
grant execute on function public.get_unread_counts(uuid[]) to authenticated;

-- ============================================================================
-- 6) RPC: atomic mark-read. Sets the read cursor AND writes per-message
--    receipts for everything the user just saw, in one transaction
--    (supabase-js cannot express INSERT...SELECT). service_role only — the
--    /api/conversations/read route gates with requireConversationParticipant.
-- ============================================================================
-- A legacy mark_conversation_read(uuid, uuid) exists in the live DB with old
-- parameter names ("conv_id") — must drop before recreating (error 42P13).
drop function if exists public.mark_conversation_read(uuid, uuid);
create function public.mark_conversation_read(p_conversation_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.conversation_members (conversation_id, user_id, last_read_at)
  values (p_conversation_id, p_user_id, now())
  on conflict (conversation_id, user_id)
    do update set last_read_at = now(), updated_at = now();

  insert into public.message_read_receipts (message_id, conversation_id, user_id)
  select m.id, m.conversation_id, p_user_id
  from public.messages m
  where m.conversation_id = p_conversation_id
    and m.sender_id is not null
    and m.sender_id <> p_user_id
  on conflict (message_id, user_id) do nothing;
end $$;

revoke all on function public.mark_conversation_read(uuid, uuid) from public, authenticated;
grant execute on function public.mark_conversation_read(uuid, uuid) to service_role;

-- ============================================================================
-- 7) Realtime: receipts INSERTs drive the sender's live read indicator.
--    Idempotent — 20251009 phase3 may already have added the table.
--    The existing SELECT policy ("Users can view their own read receipts")
--    already lets the message sender receive these events through WAL RLS.
-- ============================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'message_read_receipts'
  ) then
    alter publication supabase_realtime add table public.message_read_receipts;
  end if;
end $$;
