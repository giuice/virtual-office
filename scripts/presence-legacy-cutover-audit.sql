-- Phase 6/10 legacy presence cutover evidence query.
-- Run through the approved privileged database connection and save the entire,
-- unedited output as the rollout artifact. This script is read-only and does
-- not replace the same-transaction locked assertion in Phase 10.

\set ON_ERROR_STOP on

begin transaction isolation level repeatable read read only;

-- Immutable singleton metadata.
select
    singleton_id,
    installed_at,
    observation_started_at,
    expected_schema_fingerprint,
    disabled_at
from private.presence_legacy_cutover_audit_meta
order by singleton_id;

-- Every required hour is emitted, including missing buckets (NULL columns).
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

-- Four direct-write groups, zero-filled for each of the seven complete UTC days.
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
        (bounds.today - 1)::timestamp,
        interval '1 day'
    ) as generated(day_value)
),
groups(field_group) as (
    values
        ('current_space_id'::text),
        ('status'::text),
        ('last_active'::text),
        ('any_authenticated_users_update'::text)
)
select
    days.event_day,
    groups.field_group,
    coalesce(audit.call_count, 0)::bigint as call_count
from days
cross join groups
left join private.presence_legacy_user_write_audit as audit
  on audit.event_day = days.event_day
 and audit.field_group = groups.field_group
order by days.event_day, groups.field_group;

-- Two legacy-route groups, zero-filled for each complete UTC day.
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
        (bounds.today - 1)::timestamp,
        interval '1 day'
    ) as generated(day_value)
),
groups(route_group) as (
    values ('users-location'::text), ('users-offline-status'::text)
)
select
    days.event_day,
    groups.route_group,
    coalesce(audit.call_count, 0)::bigint as call_count
from days
cross join groups
left join private.presence_legacy_route_call_audit as audit
  on audit.event_day = days.event_day
 and audit.route_group = groups.route_group
order by days.event_day, groups.route_group;

-- Current partial UTC day, zero-filled for both counter families.
with today as (
    select (pg_catalog.transaction_timestamp() at time zone 'UTC')::date as event_day
),
direct_groups(field_group) as (
    values
        ('current_space_id'::text),
        ('status'::text),
        ('last_active'::text),
        ('any_authenticated_users_update'::text)
),
route_groups(route_group) as (
    values ('users-location'::text), ('users-offline-status'::text)
),
current_counts as (
    select
        today.event_day,
        'direct-write'::text as counter_family,
        groups.field_group as counter_group,
        coalesce(audit.call_count, 0)::bigint as call_count
    from today
    cross join direct_groups as groups
    left join private.presence_legacy_user_write_audit as audit
      on audit.event_day = today.event_day
     and audit.field_group = groups.field_group
    union all
    select
        today.event_day,
        'legacy-route'::text,
        groups.route_group,
        coalesce(audit.call_count, 0)::bigint
    from today
    cross join route_groups as groups
    left join private.presence_legacy_route_call_audit as audit
      on audit.event_day = today.event_day
     and audit.route_group = groups.route_group
)
select *
from current_counts
order by counter_family, counter_group;

-- Live catalog readback uses the same sole fingerprint implementation as Cron.
select
    meta.expected_schema_fingerprint,
    private.compute_presence_cutover_audit_fingerprint() as live_schema_fingerprint,
    private.is_presence_cutover_audit_catalog_healthy(
        meta.expected_schema_fingerprint
    ) as live_catalog_healthy
from private.presence_legacy_cutover_audit_meta as meta
where meta.singleton_id;

-- Final artifact gate. Missing rows are failures; no evidence is synthesized.
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
meta_gate as (
    select
        meta.*,
        bounds.first_day::timestamp at time zone 'UTC' as first_hour
    from private.presence_legacy_cutover_audit_meta as meta
    cross join bounds
    where meta.singleton_id
),
coverage_gate as (
    select
        count(*) = 168
        and pg_catalog.bool_and(
            coverage.coverage_hour is not null
            and coverage.healthy
            and coverage.schema_fingerprint = meta.expected_schema_fingerprint
        ) as passed
    from hours
    cross join meta_gate as meta
    left join private.presence_legacy_cutover_audit_coverage as coverage
      on coverage.coverage_hour = hours.coverage_hour
),
direct_gate as (
    select coalesce(sum(audit.call_count), 0) = 0 as passed
    from bounds
    left join private.presence_legacy_user_write_audit as audit
      on audit.event_day between bounds.first_day and bounds.today
     and audit.field_group in (
         'current_space_id',
         'status',
         'last_active',
         'any_authenticated_users_update'
     )
),
route_gate as (
    select coalesce(sum(audit.call_count), 0) = 0 as passed
    from bounds
    left join private.presence_legacy_route_call_audit as audit
      on audit.event_day between bounds.first_day and bounds.today
     and audit.route_group in ('users-location', 'users-offline-status')
),
final_gate as (
    select
        meta.installed_at <= meta.first_hour
        and meta.observation_started_at is not null
        and meta.observation_started_at <= meta.first_hour
        and meta.disabled_at is null
        and coverage.passed
        and direct_counts.passed
        and route_counts.passed
        and private.is_presence_cutover_audit_catalog_healthy(
            meta.expected_schema_fingerprint
        ) as gate_pass
    from meta_gate as meta
    cross join coverage_gate as coverage
    cross join direct_gate as direct_counts
    cross join route_gate as route_counts
)
select coalesce((select gate_pass from final_gate), false) as gate_pass;

commit;
