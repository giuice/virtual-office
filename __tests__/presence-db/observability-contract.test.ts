import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PresenceFixtures } from './fixtures';

const NS = `observability-contract-${randomUUID()}`;

describe('presence-db observability RPC contract', () => {
  let fixtures: PresenceFixtures;

  beforeAll(async () => {
    fixtures = await PresenceFixtures.connect(NS);
  });

  afterAll(async () => {
    if (fixtures) await fixtures.end();
  });

  it('installs the transition evidence column and both exact-version triggers', async () => {
    const [column] = await fixtures.sql<{
      data_type: string;
      is_nullable: string;
    }>(
      `select data_type, is_nullable
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'location_transition_requests'
         and column_name = 'previous_location_version'`,
    );
    expect(column).toEqual({ data_type: 'integer', is_nullable: 'YES' });

    const triggers = await fixtures.sql<{
      trigger_name: string;
      table_name: string;
      function_name: string;
      enabled: string;
    }>(
      `select
         trigger.tgname as trigger_name,
         table_name.relname as table_name,
         function_name.proname as function_name,
         trigger.tgenabled::text as enabled
       from pg_catalog.pg_trigger as trigger
       join pg_catalog.pg_class as table_name on table_name.oid = trigger.tgrelid
       join pg_catalog.pg_proc as function_name on function_name.oid = trigger.tgfoid
       where not trigger.tgisinternal
         and trigger.tgname in (
           'users_capture_presence_transition_previous_version',
           'transition_result_fill_previous_location_version'
         )
       order by trigger.tgname`,
    );
    expect(triggers).toEqual([
      {
        trigger_name: 'transition_result_fill_previous_location_version',
        table_name: 'location_transition_requests',
        function_name: 'fill_presence_transition_previous_version',
        enabled: 'O',
      },
      {
        trigger_name: 'users_capture_presence_transition_previous_version',
        table_name: 'users',
        function_name: 'capture_presence_transition_previous_version',
        enabled: 'O',
      },
    ]);
  });

  it('keeps observed wrappers service-only, invoker-rights, and fixed-path', async () => {
    const functions = await fixtures.sql<{
      schema_name: string;
      function_name: string;
      owner_name: string;
      prosecdef: boolean;
      search_path_fixed: boolean;
      grants: string[];
    }>(
      `select
         namespace.nspname as schema_name,
         procedure.proname as function_name,
         owner.rolname as owner_name,
         procedure.prosecdef,
         coalesce(procedure.proconfig @> array['search_path=pg_catalog'], false)
           as search_path_fixed,
         coalesce(
           array_agg(
             case when acl.grantee = 0 then 'PUBLIC' else grantee.rolname end
             || ':' || acl.privilege_type
             order by case when acl.grantee = 0 then 'PUBLIC' else grantee.rolname end
           ) filter (
             where acl.grantee is not null and acl.grantee <> procedure.proowner
           ),
           '{}'::text[]
         ) as grants
       from pg_catalog.pg_proc as procedure
       join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
       join pg_catalog.pg_roles as owner on owner.oid = procedure.proowner
       left join lateral pg_catalog.aclexplode(procedure.proacl) as acl on true
       left join pg_catalog.pg_roles as grantee on grantee.oid = acl.grantee
       where namespace.nspname = 'public'
         and procedure.proname in (
           'transition_user_location_observed',
           'register_presence_session_observed',
           'heartbeat_presence_session_observed',
           'disconnect_presence_session_observed',
           'create_knock_request_observed',
           'respond_to_knock_observed',
           'get_knock_request_status_observed'
         )
       group by namespace.nspname, procedure.proname, procedure.oid, owner.rolname
       order by procedure.proname`,
    );

    expect(functions).toHaveLength(7);
    for (const fn of functions) {
      expect(fn.owner_name, fn.function_name).toBe('presence_maintenance_owner');
      expect(fn.prosecdef, fn.function_name).toBe(false);
      expect(fn.search_path_fixed, fn.function_name).toBe(true);
      expect(fn.grants, fn.function_name).toEqual(['service_role:EXECUTE']);
    }
  });

  it('keeps trigger helpers invoker-rights with no external execution grant', async () => {
    const functions = await fixtures.sql<{
      function_name: string;
      owner_name: string;
      prosecdef: boolean;
      search_path_fixed: boolean;
      grants: string[];
    }>(
      `select
         procedure.proname as function_name,
         owner.rolname as owner_name,
         procedure.prosecdef,
         coalesce(procedure.proconfig @> array['search_path=pg_catalog'], false)
           as search_path_fixed,
         coalesce(
           array_agg(
             case when acl.grantee = 0 then 'PUBLIC' else grantee.rolname end
             || ':' || acl.privilege_type
             order by case when acl.grantee = 0 then 'PUBLIC' else grantee.rolname end
           ) filter (
             where acl.grantee is not null and acl.grantee <> procedure.proowner
           ),
           '{}'::text[]
         ) as grants
       from pg_catalog.pg_proc as procedure
       join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
       join pg_catalog.pg_roles as owner on owner.oid = procedure.proowner
       left join lateral pg_catalog.aclexplode(procedure.proacl) as acl on true
       left join pg_catalog.pg_roles as grantee on grantee.oid = acl.grantee
       where namespace.nspname = 'private'
         and procedure.proname in (
           'capture_presence_transition_previous_version',
           'fill_presence_transition_previous_version'
         )
       group by procedure.proname, procedure.oid, owner.rolname
       order by procedure.proname`,
    );

    expect(functions).toHaveLength(2);
    for (const fn of functions) {
      expect(fn.owner_name, fn.function_name).toBe('presence_maintenance_owner');
      expect(fn.prosecdef, fn.function_name).toBe(false);
      expect(fn.search_path_fixed, fn.function_name).toBe(true);
      expect(fn.grants, fn.function_name).toEqual([]);
    }
  });

  it('keeps clock-based Knock status truthful and locks observed enrichment', async () => {
    const [statusFunction] = await fixtures.sql<{
      volatility: string;
      observed_source: string;
    }>(
      `select
         procedure.provolatile::text as volatility,
         observed.prosrc as observed_source
       from pg_catalog.pg_proc as procedure
       join pg_catalog.pg_namespace as namespace
         on namespace.oid = procedure.pronamespace
       cross join lateral (
         select wrapper.prosrc
         from pg_catalog.pg_proc as wrapper
         join pg_catalog.pg_namespace as wrapper_namespace
           on wrapper_namespace.oid = wrapper.pronamespace
         where wrapper_namespace.nspname = 'public'
           and wrapper.proname = 'get_knock_request_status_observed'
       ) as observed
       where namespace.nspname = 'public'
         and procedure.proname = 'get_knock_request_status'
         and pg_catalog.pg_get_function_identity_arguments(procedure.oid)
           = 'p_requester_id uuid, p_auth_session_id uuid, p_session_id uuid, p_request_id text'`,
    );
    expect(statusFunction?.volatility).toBe('v');
    expect(statusFunction?.observed_source).toMatch(/for share/i);
    expect(
      statusFunction?.observed_source.match(/get_knock_request_status\s*\(/g),
    ).toHaveLength(2);
  });
});
