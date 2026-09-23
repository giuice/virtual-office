-- Migration: fix_presence_cutover_coverage_first_observation
-- Purpose: Preserve the earliest hourly cutover-audit observation under concurrent writers.
-- Date (UTC): 2026-07-27

begin;

-- Hosted/local postgres is intentionally not superuser. Keep this authority
-- temporary and remove it before calculating the immutable audit fingerprint.
grant presence_maintenance_owner to postgres;
grant create on schema private to presence_maintenance_owner;

-- ON CONFLICT DO UPDATE and the serialized hourly reset are subject to FORCE
-- RLS. The isolated function owner already has SELECT/INSERT; add only the
-- UPDATE and DELETE policies required by those two maintenance operations.
create policy pmo_presence_legacy_cutover_audit_coverage_update
    on private.presence_legacy_cutover_audit_coverage
    for update to presence_maintenance_owner
    using (true)
    with check (true);
create policy pmo_presence_legacy_cutover_audit_coverage_delete
    on private.presence_legacy_cutover_audit_coverage
    for delete to presence_maintenance_owner
    using (true);

-- Preserve the latest catalog-health implementation from the preceding
-- migration while extending its exact policy contract. The guarded rewrite
-- fails closed if the expected predecessor definition has drifted.
do $migration$
declare
    v_definition text;
    v_rewritten text;
    v_policy_count_marker constant text := '    if v_policies <> 11 then';
    v_policy_check_marker constant text :=
        '    -- The platform-admin tenant creator locks the authorization row.';
    v_coverage_policy_check constant text := $check$
    if (
        select pg_catalog.count(*)
        from pg_catalog.pg_policy as policy
        where policy.polrelid =
              'private.presence_legacy_cutover_audit_coverage'::pg_catalog.regclass
          and policy.polname in (
              'pmo_presence_legacy_cutover_audit_coverage_update',
              'pmo_presence_legacy_cutover_audit_coverage_delete'
          )
          and policy.polroles = array[
              'presence_maintenance_owner'::pg_catalog.regrole::oid
          ]
          and policy.polpermissive
          and pg_catalog.pg_get_expr(policy.polqual, policy.polrelid) = 'true'
          and (
              (
                  policy.polname =
                      'pmo_presence_legacy_cutover_audit_coverage_update'
                  and policy.polcmd = 'w'
                  and pg_catalog.pg_get_expr(
                      policy.polwithcheck,
                      policy.polrelid
                  ) = 'true'
              )
              or (
                  policy.polname =
                      'pmo_presence_legacy_cutover_audit_coverage_delete'
                  and policy.polcmd = 'd'
                  and policy.polwithcheck is null
              )
          )
    ) <> 2 then
        return false;
    end if;

$check$;
begin
    select pg_catalog.pg_get_functiondef(p.oid)
    into v_definition
    from pg_catalog.pg_proc as p
    where p.oid = pg_catalog.to_regprocedure(
        'private.is_presence_cutover_audit_catalog_healthy(text)'
    );

    if v_definition is null
       or (
           pg_catalog.length(v_definition)
           - pg_catalog.length(
               pg_catalog.replace(v_definition, v_policy_count_marker, '')
           )
       ) <> pg_catalog.length(v_policy_count_marker)
       or (
           pg_catalog.length(v_definition)
           - pg_catalog.length(
               pg_catalog.replace(v_definition, v_policy_check_marker, '')
           )
       ) <> pg_catalog.length(v_policy_check_marker) then
        raise exception 'PRESENCE_CUTOVER_CATALOG_HEALTH_PREDECESSOR_DRIFT'
            using errcode = 'P0001';
    end if;

    v_rewritten := pg_catalog.replace(
        v_definition,
        v_policy_count_marker,
        '    if v_policies <> 13 then'
    );
    v_rewritten := pg_catalog.replace(
        v_rewritten,
        v_policy_check_marker,
        v_coverage_policy_check || v_policy_check_marker
    );

    execute v_rewritten;
end;
$migration$;

alter function private.is_presence_cutover_audit_catalog_healthy(text)
    owner to presence_maintenance_owner;
revoke all on function private.is_presence_cutover_audit_catalog_healthy(text)
    from public, anon, authenticated, service_role;
grant execute on function private.is_presence_cutover_audit_catalog_healthy(text)
    to presence_maintenance_owner, postgres;

create or replace function private.record_presence_legacy_cutover_audit_coverage()
returns private.presence_legacy_cutover_audit_coverage
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
    v_meta private.presence_legacy_cutover_audit_meta%rowtype;
    v_now timestamptz;
    v_hour timestamptz;
    v_fingerprint text;
    v_healthy boolean;
    v_result private.presence_legacy_cutover_audit_coverage%rowtype;
begin
    select m.*
    into v_meta
    from private.presence_legacy_cutover_audit_meta as m
    where m.singleton_id;

    if not found then
        raise exception 'PRESENCE_LEGACY_CUTOVER_META_MISSING'
            using errcode = 'P0001';
    end if;

    -- Capture observation time before catalog inspection. If this writer later
    -- waits on the hourly row, checked_at still represents when it observed the
    -- catalog rather than when it finally acquired the row lock.
    v_now := pg_catalog.clock_timestamp();
    v_hour := pg_catalog.date_trunc('hour', v_now);
    v_fingerprint := private.compute_presence_cutover_audit_fingerprint();
    v_healthy := v_meta.observation_started_at is not null
        and v_meta.disabled_at is null
        and v_meta.expected_schema_fingerprint is not null
        and private.is_presence_cutover_audit_catalog_healthy(
            v_meta.expected_schema_fingerprint
        );

    insert into private.presence_legacy_cutover_audit_coverage as stored (
        coverage_hour,
        checked_at,
        schema_fingerprint,
        healthy
    )
    values (v_hour, v_now, v_fingerprint, v_healthy)
    on conflict (coverage_hour) do update
    set checked_at = excluded.checked_at,
        schema_fingerprint = excluded.schema_fingerprint,
        healthy = excluded.healthy
    -- Exact timestamp collisions have no observable order. Resolve them
    -- fail-closed so a healthy result can never mask unhealthy evidence.
    where excluded.checked_at < stored.checked_at
       or (
           excluded.checked_at = stored.checked_at
           and not excluded.healthy
           and stored.healthy
       );

    select c.*
    into v_result
    from private.presence_legacy_cutover_audit_coverage as c
    where c.coverage_hour = v_hour;

    return v_result;
end;
$$;

alter function private.record_presence_legacy_cutover_audit_coverage()
    owner to presence_maintenance_owner;
revoke all on function private.record_presence_legacy_cutover_audit_coverage()
    from public, anon, authenticated, service_role, presence_maintenance_owner;
grant execute on function private.record_presence_legacy_cutover_audit_coverage()
    to postgres;

-- Serialize the rebaseline against the hourly cron. Existing evidence was
-- produced under the losing-writer contract and cannot be carried forward.
lock table private.presence_legacy_cutover_audit_coverage
    in share row exclusive mode;
delete from private.presence_legacy_cutover_audit_coverage as coverage
where coverage.coverage_hour =
      pg_catalog.date_trunc('hour', pg_catalog.clock_timestamp())
  and exists (
      select 1
      from private.presence_legacy_cutover_audit_meta as meta
      where meta.singleton_id
        and meta.observation_started_at is not null
        and meta.disabled_at is null
  );

-- Restore final catalog authority before taking the fingerprint.
revoke create on schema private from presence_maintenance_owner;
revoke presence_maintenance_owner from postgres;

select pg_catalog.set_config(
    'app.presence_cutover_rebaseline_fingerprint',
    private.compute_presence_cutover_audit_fingerprint(),
    true
);

-- The original trigger intentionally permits only first start and final
-- disable. Temporarily suspend it inside this transaction to restart an active
-- observation window; rollback restores the trigger if any later step fails.
grant presence_maintenance_owner to postgres;
alter table private.presence_legacy_cutover_audit_meta
    disable trigger presence_audit_meta_immutable;
update private.presence_legacy_cutover_audit_meta as meta
set observation_started_at = pg_catalog.clock_timestamp(),
    expected_schema_fingerprint = pg_catalog.current_setting(
        'app.presence_cutover_rebaseline_fingerprint'
    )
where meta.singleton_id
  and meta.observation_started_at is not null
  and meta.disabled_at is null;
alter table private.presence_legacy_cutover_audit_meta
    enable trigger presence_audit_meta_immutable;
revoke presence_maintenance_owner from postgres;

do $record$
begin
    if exists (
        select 1
        from private.presence_legacy_cutover_audit_meta as meta
        where meta.singleton_id
          and meta.observation_started_at is not null
          and meta.disabled_at is null
    ) then
        perform private.record_presence_legacy_cutover_audit_coverage();
    end if;
end;
$record$;

commit;
