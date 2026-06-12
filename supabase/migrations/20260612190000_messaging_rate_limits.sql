-- Phase 3.4 (messaging audit 2026-06-10, M-09) — per-user rate limiting for
-- messaging mutations (create / react / upload).
--
-- Fixed-window counters in Postgres: no new infra, serverless-safe (every
-- Next.js instance shares the same counter). The function is SECURITY
-- DEFINER and executable by service_role ONLY — it takes the target user id
-- as a parameter, so an authenticated caller could otherwise exhaust another
-- user's quota on purpose. API routes call it through the service client
-- AFTER the authz check, passing the authenticated user's DB id.
--
-- Re-runnable: create table if not exists; function is CREATE OR REPLACE.

create table if not exists private.rate_limit_counters (
  user_id uuid not null,
  action text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (user_id, action, window_start)
);

alter table private.rate_limit_counters enable row level security;
-- No policies on purpose: only the SECURITY DEFINER function (and
-- service_role) touch this table.

-- Lives in public (PostgREST does not expose the private schema for RPC) but
-- is executable by service_role only — same pattern as mark_conversation_read.
create or replace function public.check_rate_limit(
  p_user_id uuid,
  p_action text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window_start timestamptz;
  v_count integer;
begin
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into private.rate_limit_counters as c (user_id, action, window_start, count)
  values (p_user_id, p_action, v_window_start, 1)
  on conflict (user_id, action, window_start)
  do update set count = c.count + 1
  returning count into v_count;

  -- Opportunistic cleanup of this user's expired windows (PK-indexed, cheap).
  delete from private.rate_limit_counters
  where user_id = p_user_id
    and action = p_action
    and window_start < v_window_start;

  return v_count <= p_limit;
end;
$$;

revoke all on function public.check_rate_limit(uuid, text, integer, integer) from public;
revoke all on function public.check_rate_limit(uuid, text, integer, integer) from anon, authenticated;
grant execute on function public.check_rate_limit(uuid, text, integer, integer) to service_role;
