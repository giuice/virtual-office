-- Presence remediation invariant and evidence counters.
-- Run with an approved read-only privileged connection before/after rollout.
-- The transaction mode makes accidental writes fail closed.

begin transaction read only;

with
clock as (
  select pg_catalog.clock_timestamp() as checked_at
),
runtime as (
  select
    pg_catalog.count(*)::bigint as row_count,
    pg_catalog.max(control.mode) as mode
  from private.presence_runtime_control as control
  where control.singleton_id
),
valid_active_occupants as (
  select distinct session.user_id, session.space_id
  from public.user_presence_sessions as session
  join public.users as app_user
    on app_user.id = session.user_id
   and app_user.company_id = session.company_id
   and app_user.current_space_id = session.space_id
   and app_user.location_version = session.placement_version
   and app_user.presence_access_revision = session.user_access_revision
  join public.spaces as space
    on space.id = session.space_id
   and space.company_id = session.company_id
   and space.presence_access_revision = session.space_access_revision
  cross join clock
  where session.retired_at is null
    and session.expires_at > clock.checked_at
),
capacity_violations as (
  select space.id
  from public.spaces as space
  left join valid_active_occupants as occupant on occupant.space_id = space.id
  where space.capacity > 0
  group by space.id, space.capacity
  having pg_catalog.count(occupant.user_id) > space.capacity
),
multiple_open_logs as (
  select log.user_id
  from public.space_presence_log as log
  where log.exited_at is null
  group by log.user_id
  having pg_catalog.count(*) > 1
),
placement_log_mismatches as (
  select app_user.id
  from public.users as app_user
  where (
    app_user.current_space_id is null
    and exists (
      select 1
      from public.space_presence_log as log
      where log.user_id = app_user.id
        and log.exited_at is null
    )
  ) or (
    app_user.current_space_id is not null
    and not exists (
      select 1
      from public.space_presence_log as log
      where log.user_id = app_user.id
        and log.space_id = app_user.current_space_id
        and log.exited_at is null
    )
  )
),
stale_placements_beyond_grace as (
  select app_user.id
  from public.users as app_user
  cross join clock
  where app_user.current_space_id is not null
    and not exists (
      select 1
      from valid_active_occupants as occupant
      where occupant.user_id = app_user.id
        and occupant.space_id = app_user.current_space_id
    )
    and not exists (
      select 1
      from public.user_presence_sessions as session
      join public.spaces as space on space.id = session.space_id
      where session.user_id = app_user.id
        and session.space_id = app_user.current_space_id
        and session.company_id = app_user.company_id
        and space.company_id = app_user.company_id
        and session.placement_version = app_user.location_version
        and session.user_access_revision = app_user.presence_access_revision
        and session.space_access_revision = space.presence_access_revision
        and coalesce(session.retired_at, session.expires_at)
          >= clock.checked_at - interval '5 minutes'
    )
),
revision_invalid_active_sessions as (
  select session.id
  from public.user_presence_sessions as session
  join public.users as app_user on app_user.id = session.user_id
  left join public.spaces as space on space.id = session.space_id
  cross join clock
  where session.retired_at is null
    and session.expires_at > clock.checked_at
    and session.space_id is not null
    and (
      session.space_id is distinct from app_user.current_space_id
      or session.company_id is distinct from app_user.company_id
      or space.company_id is distinct from app_user.company_id
      or session.placement_version is distinct from app_user.location_version
      or session.user_access_revision is distinct from app_user.presence_access_revision
      or session.space_access_revision is distinct from space.presence_access_revision
    )
),
revision_invalid_live_knocks as (
  select knock.id
  from public.knock_requests as knock
  join public.users as requester on requester.id = knock.requester_id
  join public.spaces as space on space.id = knock.space_id
  left join public.users as responder on responder.id = knock.responder_id
  cross join clock
  where knock.status in ('pending', 'approved')
    and knock.consumed_at is null
    and knock.expires_at > clock.checked_at
    and (
      knock.requester_location_version is distinct from requester.location_version
      or knock.company_id is distinct from requester.company_id
      or knock.company_id is distinct from space.company_id
      or knock.requester_access_revision is distinct from requester.presence_access_revision
      or knock.space_access_revision is distinct from space.presence_access_revision
      or (
        knock.status = 'approved'
        and (
          knock.company_id is distinct from responder.company_id
          or knock.responder_access_revision is distinct from responder.presence_access_revision
        )
      )
    )
),
cross_company_presence_authority as (
  select app_user.id::text as authority_id
  from public.users as app_user
  join public.spaces as space on space.id = app_user.current_space_id
  where app_user.company_id is distinct from space.company_id

  union all

  select session.id::text as authority_id
  from public.user_presence_sessions as session
  join public.users as app_user on app_user.id = session.user_id
  left join public.spaces as space on space.id = session.space_id
  cross join clock
  where session.retired_at is null
    and session.expires_at > clock.checked_at
    and (
      session.company_id is distinct from app_user.company_id
      or (
        session.space_id is not null
        and space.company_id is distinct from app_user.company_id
      )
    )

  union all

  select knock.id
  from public.knock_requests as knock
  join public.users as requester on requester.id = knock.requester_id
  join public.spaces as space on space.id = knock.space_id
  left join public.users as responder on responder.id = knock.responder_id
  cross join clock
  where knock.status in ('pending', 'approved')
    and knock.consumed_at is null
    and knock.expires_at > clock.checked_at
    and (
      knock.company_id is distinct from requester.company_id
      or knock.company_id is distinct from space.company_id
      or (
        knock.status = 'approved'
        and knock.company_id is distinct from responder.company_id
      )
    )
),
invalid_live_knock_states as (
  select knock.id
  from public.knock_requests as knock
  cross join clock
  where (
    knock.status in ('pending', 'approved')
    and (
      knock.consumed_at is not null
      or knock.expires_at <= clock.checked_at - interval '2 minutes'
    )
  ) or (
    knock.status = 'consumed'
    and knock.consumed_at is null
  )
),
retention_backlog as (
  select 'session-retirement'::text as source, session.id::text as row_id
  from public.user_presence_sessions as session
  cross join clock
  where session.retired_at is null
    and session.expires_at < clock.checked_at - interval '2 minutes'

  union all

  select 'session-retention', session.id::text
  from public.user_presence_sessions as session
  cross join clock
  where session.retired_at is not null
    and coalesce(session.retired_at, session.expires_at)
      < clock.checked_at - interval '24 hours'

  union all

  select 'transition', request.transition_id::text
  from public.location_transition_requests as request
  cross join clock
  where request.created_at < clock.checked_at - interval '30 days'
    and request.result is not null
    and (
      request.reason <> 'logout'
      or not exists (
        select 1
        from public.revoked_presence_auth_sessions as fence
        where fence.user_id = request.user_id
          and fence.auth_session_id = request.auth_session_id
      )
    )

  union all

  select 'auth-fence', fence.auth_session_id::text
  from public.revoked_presence_auth_sessions as fence
  cross join clock
  where fence.auth_session_absence_confirmed_at is not null
    and fence.purge_after <= clock.checked_at

  union all

  select 'knock', knock.id
  from public.knock_requests as knock
  cross join clock
  where knock.status in ('denied', 'expired', 'consumed')
    and knock.updated_at < clock.checked_at - interval '30 days'
),
checks as (
  select 1 as sort_order, 'runtime_control_singleton_cardinality'::text as check_name,
         case
           when runtime.row_count = 1 then 0::bigint
           else pg_catalog.abs(runtime.row_count - 1)
         end as observed_count,
         'zero'::text as expected, 'database'::text as evidence_source
  from runtime

  union all select 5 as sort_order, 'monitor_authority_is_postgres'::text as check_name,
         case when current_user = 'postgres' then 0::bigint else 1::bigint end as observed_count,
         'zero'::text as expected, 'database'::text as evidence_source

  union all select 10 as sort_order, 'capacity_invariant_violation'::text as check_name,
         pg_catalog.count(*)::bigint as observed_count, 'zero'::text as expected,
         'database'::text as evidence_source
  from capacity_violations

  union all select 15, 'open_presence_log_unique_index',
         case when exists (
           select 1
           from pg_catalog.pg_index as index_state
           join pg_catalog.pg_class as index_class
             on index_class.oid = index_state.indexrelid
           join pg_catalog.pg_class as table_class
             on table_class.oid = index_state.indrelid
           join pg_catalog.pg_namespace as table_schema
             on table_schema.oid = table_class.relnamespace
           where table_schema.nspname = 'public'
             and table_class.relname = 'space_presence_log'
             and index_class.relname = 'ux_space_presence_log_one_open_per_user'
             and index_state.indisunique
             and index_state.indisvalid
             and index_state.indisready
             and pg_catalog.pg_get_indexdef(index_state.indexrelid) =
               'CREATE UNIQUE INDEX ux_space_presence_log_one_open_per_user ON public.space_presence_log USING btree (user_id) WHERE (exited_at IS NULL)'
         ) then 0::bigint else 1::bigint end,
         'zero', 'database'

  union all select 20, 'multiple_open_presence_logs', pg_catalog.count(*)::bigint, 'zero', 'database'
  from multiple_open_logs
  union all select 30, 'placement_open_log_mismatch', pg_catalog.count(*)::bigint, 'zero', 'database'
  from placement_log_mismatches
  union all select 40, 'transition_claim_without_result_over_5m', pg_catalog.count(*)::bigint, 'zero', 'database'
  from public.location_transition_requests as request cross join clock
  where request.result is null and request.created_at < clock.checked_at - interval '5 minutes'
  union all select 50, 'placement_without_valid_evidence_beyond_grace', pg_catalog.count(*)::bigint, 'zero-after-atomic', 'database'
  from stale_placements_beyond_grace
  union all select 60, 'revision_invalid_active_session', pg_catalog.count(*)::bigint, 'zero', 'database'
  from revision_invalid_active_sessions
  union all select 70, 'revision_invalid_live_knock', pg_catalog.count(*)::bigint, 'zero', 'database'
  from revision_invalid_live_knocks
  union all select 80, 'invalid_or_expired_live_knock_state', pg_catalog.count(*)::bigint, 'zero', 'database'
  from invalid_live_knock_states
  union all select 85, 'cross_company_presence_authority', pg_catalog.count(*)::bigint, 'zero', 'database'
  from cross_company_presence_authority
  union all select 90, 'retention_backlog', pg_catalog.count(*)::bigint, 'zero', 'database'
  from retention_backlog
  union all select 91, 'retention_session_retirement_backlog', pg_catalog.count(*)::bigint, 'zero', 'database'
  from retention_backlog where source = 'session-retirement'
  union all select 92, 'retention_session_history_backlog', pg_catalog.count(*)::bigint, 'zero', 'database'
  from retention_backlog where source = 'session-retention'
  union all select 93, 'retention_transition_backlog', pg_catalog.count(*)::bigint, 'zero', 'database'
  from retention_backlog where source = 'transition'
  union all select 94, 'retention_auth_fence_backlog', pg_catalog.count(*)::bigint, 'zero', 'database'
  from retention_backlog where source = 'auth-fence'
  union all select 95, 'retention_knock_backlog', pg_catalog.count(*)::bigint, 'zero', 'database'
  from retention_backlog where source = 'knock'
  union all select 100, 'stale_automatic_transition_rejections', pg_catalog.count(*)::bigint, 'counter', 'database'
  from public.location_transition_requests as request
  where request.reason in ('auto-first-placement', 'auto-rejoin', 'auto-fallback', 'knock-enter')
    and request.result ->> 'code' = 'LOCATION_SUPERSEDED'

  -- These counters have no durable database source. Preserve them from the
  -- presence-observability-v1 log stream in the rollout artifact.
  union all select 110, 'session_heartbeat_failures', null::bigint, 'review', 'structured-log'
  union all select 120, 'invalid_or_replayed_knock_attempts', null::bigint, 'review', 'structured-log'
  union all select 130, 'realtime_reconnect_and_reconciliation', null::bigint, 'review', 'structured-log'
  union all select 140, 'scoped_presence_query_errors', null::bigint, 'review', 'structured-log'
)
select
  clock.checked_at,
  checks.check_name,
  checks.observed_count,
  checks.expected,
  checks.evidence_source,
  coalesce(runtime.mode, 'missing') as runtime_mode,
  case
    when checks.expected = 'zero' then checks.observed_count = 0
    when checks.expected = 'zero-after-atomic' and runtime.mode = 'atomic'
      then checks.observed_count = 0
    else null
  end as gate_pass
from checks
cross join clock
cross join runtime
order by checks.sort_order;

commit;
