-- Phase 6 block D review fix D-1/D-2: atomic success finalization of an AI
-- processing operation (spec-interview/phase-6-meeting-notes; SPEC FR-021,
-- FR-022, BR-013; AC-030, AC-034). Depends on 20261013154823 (operations
-- table, private.meeting_note_lock_actor, private.meeting_note_lock_note_for_actor,
-- usage helpers) and 20261013142351 (AI settings).
--
-- Why: the start route checked access with the caller's session and then
-- settled `succeeded` with a call that locked only the operation row. A
-- member removed, demoted, or a note deleted between the two still received
-- the draft. Success is now recorded ONLY by this function, in the same
-- transaction that re-checks access on locked rows.
--
-- Objects:
--   * public.finalize_meeting_note_ai_success(p_operation_id uuid,
--     p_actor_user_id uuid) RETURNS jsonb — service_role only; called by
--     the start route (src/lib/meeting-notes/ai/processing.ts) after the
--     provider returned a draft and the client is still connected;
--     p_actor_user_id is the route's server-derived users.id. ONE
--     transaction (READ COMMITTED; each locking read sees the latest
--     committed state after any wait):
--       0. the operation's immutable identity (user_id, company_id,
--          note_id) by an unlocked read; unknown → OPERATION_NOT_FOUND; an
--          operation of another user → BINDING_MISMATCH (server bug guard).
--       1. locks per the PLAN lock order rule: actor users row FOR KEY
--          SHARE (private.meeting_note_lock_actor) → note FOR UPDATE with the
--          shared rights rule (private.meeting_note_lock_note_for_actor, only
--          while the actor is a current member of the operation's company)
--          → operation row FOR UPDATE. No company or settings row lock. A
--          member removal or role change (both RPCs lock the users row FOR
--          UPDATE), a participant change, or a note delete (both lock the
--          note row) therefore either commits before this check (and is
--          seen) or waits until this transaction ends (and the draft was
--          legitimately delivered at that point). A plain UPDATE of users
--          outside those RPCs takes FOR NO KEY UPDATE, which does not wait
--          on FOR KEY SHARE; it is ordered after this check, as for every
--          RPC built on the same actor lock.
--       2. access = 'ok' (current member of the operation's company, note
--          exists, editor: author while a member, current participant, or
--          company admin), 'not_found' (actor missing / removed / moved
--          company, or note missing or deleted), or 'forbidden' (member
--          without editor rights).
--       3. a `dispatched` operation becomes `succeeded` when access = 'ok',
--          else `discarded` (both COUNTED, settled_at = now). `admitted`
--          (never dispatched) → INVALID_TRANSITION. A terminal operation
--          (e.g. failed by the stale job) is returned unchanged
--          (changed = false).
--     Returns {operation_id, status, changed, counted, admission_day,
--     settled_at, access, usage}; usage = {limit, used, usage_day,
--     reset_at} of the operation's company for today (America/Sao_Paulo)
--     only when access = 'ok', else NULL. The caller returns the draft ONLY
--     when status = 'succeeded' and changed = true; usage comes from here
--     so no later read can drop it or run after access was lost.
--   Owner postgres, SET search_path = '', schema-qualified, REVOKE ALL
--   FROM PUBLIC, anon, authenticated, service_role, then EXECUTE for
--   service_role only. settle_meeting_note_ai_operation is unchanged (the
--   route no longer calls it with `succeeded`).
--
-- Error tokens (message = token; SQLSTATE; DETAIL JSON where listed):
--   22023 MEETING_NOTE_AI_INVALID_ARGUMENT (a NULL argument)
--   P0002 MEETING_NOTE_AI_OPERATION_NOT_FOUND
--   P0001 MEETING_NOTE_AI_BINDING_MISMATCH
--   P0001 MEETING_NOTE_AI_OPERATION_INVALID_TRANSITION DETAIL {status}
--
-- Rollback (order: FIRST roll the application back to a build whose start
-- route does not call this function, THEN run this SQL). No data is lost.
--   begin;
--   drop function if exists public.finalize_meeting_note_ai_success(uuid, uuid);
--   commit;

create or replace function public.finalize_meeting_note_ai_success(p_operation_id uuid, p_actor_user_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ref record;
  v_actor record;
  v_note record;
  v_access text := 'ok';
  v_operation public.meeting_note_ai_operations%rowtype;
  v_changed boolean := false;
  v_limit integer;
  v_day date;
  v_usage jsonb := null;
begin
  if p_operation_id is null or p_actor_user_id is null then
    raise exception 'MEETING_NOTE_AI_INVALID_ARGUMENT' using errcode = '22023';
  end if;

  -- (0) Immutable identity, unlocked: the operation lock comes last.
  select o.user_id, o.company_id, o.note_id
  into v_ref
  from public.meeting_note_ai_operations as o
  where o.id = p_operation_id;
  if not found then
    raise exception 'MEETING_NOTE_AI_OPERATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_ref.user_id <> p_actor_user_id then
    raise exception 'MEETING_NOTE_AI_BINDING_MISMATCH' using errcode = 'P0001';
  end if;

  -- (1a) Actor row FOR KEY SHARE (conflicts with the FOR UPDATE of member
  -- removal and role change).
  select * into v_actor from private.meeting_note_lock_actor(p_actor_user_id);
  if v_actor.caller_id is null
     or v_actor.caller_company_id is distinct from v_ref.company_id then
    v_access := 'not_found';
  else
    -- (1b) Note FOR UPDATE + rights on the locked state (shared rule).
    begin
      select * into v_note
      from private.meeting_note_lock_note_for_actor(
        v_ref.note_id, 'MEETING_NOTE_NOT_FOUND', v_actor.caller_id, v_actor.caller_company_id, v_actor.caller_is_admin
      );
      if v_note.can_edit is not true then
        v_access := 'forbidden';
      end if;
    exception
      when sqlstate 'P0002' then
        -- Note missing, deleted while waiting, or of another company.
        v_access := 'not_found';
    end;
  end if;

  -- (1c) Operation row FOR UPDATE.
  select o.* into v_operation
  from public.meeting_note_ai_operations as o
  where o.id = p_operation_id
  for update;
  if not found then
    raise exception 'MEETING_NOTE_AI_OPERATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_operation.status = 'admitted' then
    raise exception 'MEETING_NOTE_AI_OPERATION_INVALID_TRANSITION'
      using errcode = 'P0001',
            detail = pg_catalog.jsonb_build_object('status', v_operation.status)::text;
  elsif v_operation.status = 'dispatched' then
    update public.meeting_note_ai_operations as o
    set status = case when v_access = 'ok' then 'succeeded' else 'discarded' end,
        settled_at = pg_catalog.now()
    where o.id = p_operation_id
    returning o.* into v_operation;
    v_changed := true;
  end if;
  -- A terminal operation is never settled again (idempotent).

  if v_access = 'ok' then
    select s.daily_limit into v_limit
    from public.meeting_note_ai_settings as s
    where s.company_id = v_ref.company_id;
    v_day := private.meeting_note_ai_usage_day(pg_catalog.clock_timestamp());
    v_usage := pg_catalog.jsonb_build_object(
      'limit', coalesce(v_limit, 20),
      'used', private.meeting_note_ai_used_count(v_ref.company_id, v_day),
      'usage_day', v_day,
      'reset_at', private.meeting_note_ai_reset_at(v_day)
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'operation_id', v_operation.id,
    'status', v_operation.status,
    'changed', v_changed,
    'counted', v_operation.status in ('admitted', 'dispatched', 'succeeded', 'failed', 'discarded'),
    'admission_day', v_operation.admission_day,
    'settled_at', v_operation.settled_at,
    'access', v_access,
    'usage', v_usage
  );
end;
$$;

alter function public.finalize_meeting_note_ai_success(uuid, uuid) owner to postgres;
revoke all on function public.finalize_meeting_note_ai_success(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.finalize_meeting_note_ai_success(uuid, uuid) to service_role;
