-- Phase 10 legacy adapter removal evidence query.
-- Run through the approved privileged connection after the disabled 426
-- tombstone has remained deployed for seven complete UTC days. Save the full,
-- unedited output. This read-only artifact does not replace the final locked
-- call to private.assert_presence_legacy_adapter_removal_gate().

\set ON_ERROR_STOP on

begin transaction isolation level repeatable read read only;

select
    mode,
    cutover_id,
    changed_at,
    changed_by,
    legacy_adapter_enabled,
    legacy_adapter_disabled_at
from private.presence_runtime_control
where singleton_id;

select
    singleton_id,
    installed_at,
    observation_started_at,
    expected_schema_fingerprint,
    disabled_at
from private.presence_legacy_cutover_audit_meta
where singleton_id;

with bounds as (
    select
        ((pg_catalog.transaction_timestamp() at time zone 'UTC')::date - 7)::timestamp
            at time zone 'UTC' as first_hour,
        ((pg_catalog.transaction_timestamp() at time zone 'UTC')::date)::timestamp
            at time zone 'UTC' as current_day_start
),
required_hours as (
    select pg_catalog.generate_series(
        bounds.first_hour,
        bounds.current_day_start - interval '1 hour',
        interval '1 hour'
    ) as coverage_hour
    from bounds
)
select
    required.coverage_hour,
    coverage.checked_at,
    coverage.schema_fingerprint,
    coverage.healthy,
    (coverage.coverage_hour is not null) as bucket_present
from required_hours as required
left join private.presence_legacy_cutover_audit_coverage as coverage
  on coverage.coverage_hour = required.coverage_hour
order by required.coverage_hour;

with bounds as (
    select
        (pg_catalog.transaction_timestamp() at time zone 'UTC')::date - 7 as first_day,
        (pg_catalog.transaction_timestamp() at time zone 'UTC')::date as today
),
days as (
    select day_value::date as event_day
    from bounds
    cross join lateral pg_catalog.generate_series(
        bounds.first_day::timestamp,
        bounds.today::timestamp,
        interval '1 day'
    ) as generated(day_value)
),
groups(route_group) as (
    values ('users-location'::text), ('users-offline-status'::text)
)
select
    days.event_day,
    groups.route_group,
    coalesce(audit.call_count, 0)::bigint as call_count,
    (days.event_day = bounds.today) as current_partial_utc_day
from days
cross join bounds
cross join groups
left join private.presence_legacy_route_call_audit as audit
  on audit.event_day = days.event_day
 and audit.route_group = groups.route_group
order by days.event_day, groups.route_group;

select
    meta.expected_schema_fingerprint,
    private.compute_presence_cutover_audit_fingerprint() as live_schema_fingerprint,
    private.is_presence_cutover_audit_catalog_healthy(
        meta.expected_schema_fingerprint
    ) as live_catalog_healthy
from private.presence_legacy_cutover_audit_meta as meta
where meta.singleton_id;

with bounds as (
    select
        (pg_catalog.transaction_timestamp() at time zone 'UTC')::date as today,
        (pg_catalog.transaction_timestamp() at time zone 'UTC')::date - 7 as first_day
),
hours as (
    select pg_catalog.generate_series(
        bounds.first_day::timestamp at time zone 'UTC',
        bounds.today::timestamp at time zone 'UTC' - interval '1 hour',
        interval '1 hour'
    ) as coverage_hour
    from bounds
),
state_gate as (
    select
        not control.legacy_adapter_enabled
        and control.mode = 'atomic'
        and control.legacy_adapter_disabled_at is not null
        and control.legacy_adapter_disabled_at
            <= bounds.first_day::timestamp at time zone 'UTC'
        and meta.installed_at <= bounds.first_day::timestamp at time zone 'UTC'
        and meta.observation_started_at is not null
        and meta.observation_started_at
            <= bounds.first_day::timestamp at time zone 'UTC'
        and meta.disabled_at is null
        and private.is_presence_cutover_audit_catalog_healthy(
            meta.expected_schema_fingerprint
        ) as passed,
        meta.expected_schema_fingerprint
    from private.presence_runtime_control as control
    cross join private.presence_legacy_cutover_audit_meta as meta
    cross join bounds
    where control.singleton_id and meta.singleton_id
),
coverage_gate as (
    select
        count(*) = 168
        and pg_catalog.bool_and(
            coverage.coverage_hour is not null
            and coverage.healthy
            and coverage.schema_fingerprint = state.expected_schema_fingerprint
        ) as passed
    from hours
    cross join state_gate as state
    left join private.presence_legacy_cutover_audit_coverage as coverage
      on coverage.coverage_hour = hours.coverage_hour
),
route_gate as (
    select coalesce(sum(audit.call_count), 0) = 0 as passed
    from bounds
    left join private.presence_legacy_route_call_audit as audit
      on audit.event_day between bounds.first_day and bounds.today
     and audit.route_group in ('users-location', 'users-offline-status')
)
select coalesce(
    (
        select state.passed and coverage.passed and routes.passed
        from state_gate as state
        cross join coverage_gate as coverage
        cross join route_gate as routes
    ),
    false
) as gate_pass;

commit;
