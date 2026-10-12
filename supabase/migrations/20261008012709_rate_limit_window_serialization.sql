-- Phase 5 T6 r2 / FR-008, FR-027, AC-009, AC-028, AC-035
-- (spec-interview/phase-5-messaging-resilience): public.check_rate_limit
-- serializes EVERY action per (user, action) and reads its window after the
-- lock, so a delayed check can no longer reopen an exhausted window.
--
-- Problem (adversarial review T6 r2 finding 1). For every action other than
-- 'message:create', check_rate_limit (20260612190000 body, kept verbatim by
-- 20261007114454) took its fixed window from the transaction start (now())
-- and then deleted the user's older windows of that action. A check whose
-- transaction started in an exhausted window W0 and reached the UPSERT only
-- after a W1 check had deleted W0 recreated W0 at count 1 and returned true:
-- one request beyond the limit per delayed check, for the fail-closed route
-- budgets 'message:create-request', 'message:fence' and 'messaging:metrics'
-- (and for the fail-open actions). Only 'message:create' was serialized (T3,
-- private.charge_message_insertion_quota).
--
-- Fix: the same pattern as private.charge_message_insertion_quota, per
-- (user, action): (a) a transaction-scoped advisory lock
-- pg_advisory_xact_lock(hashtextextended('virtual_office.rate_limit:' ||
-- user id || ':' || action, 0)), held until the caller's commit (a hash
-- collision only adds waiting; the key prefix differs from the insertion
-- quota's, so 'message:create' charges keep their own lock); (b) the window
-- read from clock_timestamp() AFTER the lock, so serialized checks of one
-- (user, action) see non-decreasing windows; (c) only then the UPSERT and the
-- cleanup of older windows. No in-flight check can charge a window older than
-- one already charged, so a cleaned-up window is never recreated and at most
-- p_limit checks return true per window (a fixed window still allows up to
-- 2 x p_limit within one rolling interval across a boundary). The ordering
-- relies on the database clock not stepping backwards (a backward NTP step
-- could still let one check recreate a cleaned-up window; accepted).
--
-- Unchanged: the signature, the boolean result (count after the increment
-- <= p_limit), the counter table and its keys, the 'message:create'
-- delegation to private.charge_message_insertion_quota (byte-for-byte), and
-- the behavior on invalid input. For every action other than
-- 'message:create': a NULL user or action fails the NOT NULL insert (23502)
-- as before; p_window_seconds = 0 raises division_by_zero (22012) as before;
-- a NULL limit returns NULL as before. For 'message:create' (unchanged T3
-- branch): a NULL user, NULL or < 1 limit, or NULL or < 1 window raises
-- 22023 INSERT_QUOTA_INVALID, as in T3. SECURITY DEFINER, owner postgres,
-- search_path '' (every call schema-qualified), EXECUTE for service_role
-- only (re-stated below).
--
-- Callers and old builds: check_rate_limit is called only by server routes
-- through the service-role RPC, one call per PostgREST transaction (no
-- database function calls it except through the 'message:create' branch,
-- which is unchanged). Phase 4 / hosted builds call it with the same
-- arguments and get the same results, except that a check delayed across a
-- window boundary is now counted in the current window instead of
-- recreating the previous one. Concurrent checks of the same (user, action)
-- now run one at a time for the few microseconds of the UPSERT (each RPC
-- commits immediately); checks of different users or actions do not wait for
-- each other.
--
-- Database impact: one function body replaced (catalog row only); no table,
-- column, row, policy or grant change. Transactional and re-runnable.
-- Rollout: independent of the application (every build calls the same
-- signature); apply with the other Phase 5 migrations at T23.
--
-- Rollback (self-contained; restores the exact 20261007114454 body and ACL).
-- Order: undo THIS migration BEFORE rolling back 20261007114454 (reverse
-- order; this SQL restores T3's body, and T3's own rollback then restores the
-- original limiter). No application step is needed: every build works with
-- either body. Counters
-- already charged stay in private.rate_limit_counters and expire with their
-- window.
--   begin;
--   set local lock_timeout = '5s';
--   create or replace function public.check_rate_limit(
--     p_user_id uuid,
--     p_action text,
--     p_limit integer,
--     p_window_seconds integer
--   ) returns boolean
--   language plpgsql
--   security definer
--   set search_path = ''
--   as $$
--   declare
--     v_window_start timestamptz;
--     v_count integer;
--   begin
--     -- Phase 5 T3: insertion-quota charges are serialized per user with the
--     -- window read after the lock (private.charge_message_insertion_quota), so a
--     -- delayed charge can never recreate an older, already cleaned-up window.
--     if p_action = 'message:create' then
--       return private.charge_message_insertion_quota(p_user_id, p_limit, p_window_seconds);
--     end if;
--
--     v_window_start := to_timestamp(
--       floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
--     );
--
--     insert into private.rate_limit_counters as c (user_id, action, window_start, count)
--     values (p_user_id, p_action, v_window_start, 1)
--     on conflict (user_id, action, window_start)
--     do update set count = c.count + 1
--     returning count into v_count;
--
--     -- Opportunistic cleanup of this user's expired windows (PK-indexed, cheap).
--     delete from private.rate_limit_counters
--     where user_id = p_user_id
--       and action = p_action
--       and window_start < v_window_start;
--
--     return v_count <= p_limit;
--   end;
--   $$;
--
--   revoke all on function public.check_rate_limit(uuid, text, integer, integer) from public;
--   revoke all on function public.check_rate_limit(uuid, text, integer, integer) from anon, authenticated;
--   grant execute on function public.check_rate_limit(uuid, text, integer, integer) to service_role;
--   delete from supabase_migrations.schema_migrations where version = '20261008012709';
--   commit;

begin;

set local lock_timeout = '5s';

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
  -- Phase 5 T3: insertion-quota charges are serialized per user with the
  -- window read after the lock (private.charge_message_insertion_quota), so a
  -- delayed charge can never recreate an older, already cleaned-up window.
  if p_action = 'message:create' then
    return private.charge_message_insertion_quota(p_user_id, p_limit, p_window_seconds);
  end if;

  -- Phase 5 T6 r2: every other action is serialized per (user, action) until
  -- commit, and its window is read from the wall clock after the lock (not
  -- from the transaction start), so serialized checks see non-decreasing
  -- windows and a delayed check can never recreate a cleaned-up window.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('virtual_office.rate_limit:' || p_user_id::text || ':' || p_action, 0)
  );

  v_window_start := pg_catalog.to_timestamp(
    (pg_catalog.floor(extract(epoch from pg_catalog.clock_timestamp()) / p_window_seconds) * p_window_seconds)::double precision
  );

  insert into private.rate_limit_counters as c (user_id, action, window_start, count)
  values (p_user_id, p_action, v_window_start, 1)
  on conflict (user_id, action, window_start)
  do update set count = c.count + 1
  returning count into v_count;

  -- Older windows of this (user, action) can no longer be charged (every
  -- later check is serialized behind this one and reads a later clock).
  delete from private.rate_limit_counters c
  where c.user_id = p_user_id
    and c.action = p_action
    and c.window_start < v_window_start;

  return v_count <= p_limit;
end;
$$;

revoke all on function public.check_rate_limit(uuid, text, integer, integer) from public;
revoke all on function public.check_rate_limit(uuid, text, integer, integer) from anon, authenticated;
grant execute on function public.check_rate_limit(uuid, text, integer, integer) to service_role;

commit;
