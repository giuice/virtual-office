import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PresenceFixtures } from './fixtures';

const NS = `phase4-knock-delivery-${randomUUID()}`;

describe('presence-db Phase 4 Knock delivery and retention', () => {
  let fixtures: PresenceFixtures;
  let companyId: string;
  let spaceId: string;
  let requesterId: string;
  let requesterLocationVersion: number;
  let requesterAccessRevision: string;
  let spaceAccessRevision: string;

  beforeAll(async () => {
    fixtures = await PresenceFixtures.connect(NS);

    const [company] = await fixtures.sql<{ id: string }>(
      `insert into public.companies (name, settings)
       values ($1, '{}'::jsonb)
       returning id`,
      [`Phase 4 company::${NS}`],
    );
    if (!company) throw new Error('Failed to create Phase 4 company fixture');
    companyId = company.id;

    const [space] = await fixtures.sql<{ id: string; presence_access_revision: string }>(
      `insert into public.spaces
         (company_id, name, type, status, capacity, access_control)
       values (
         $1,
         $2,
         'private_office'::public.space_type,
         'active'::public.space_status,
         10,
         '{"isPublic": false}'::jsonb
       )
       returning id, presence_access_revision`,
      [companyId, `Phase 4 room::${NS}`],
    );
    if (!space) throw new Error('Failed to create Phase 4 space fixture');
    spaceId = space.id;
    spaceAccessRevision = space.presence_access_revision;

    const [requester] = await fixtures.sql<{
      id: string;
      location_version: number;
      presence_access_revision: string;
    }>(
      `insert into public.users
         (supabase_uid, email, display_name, company_id, role)
       values ($1, $2, 'Phase 4 requester', $3, 'member'::public.user_role)
       returning id, location_version, presence_access_revision`,
      [randomUUID(), `phase4-requester::${NS}@example.test`, companyId],
    );
    if (!requester) throw new Error('Failed to create Phase 4 requester fixture');
    requesterId = requester.id;
    requesterLocationVersion = requester.location_version;
    requesterAccessRevision = requester.presence_access_revision;
  });

  afterAll(async () => {
    if (fixtures) {
      await fixtures.cleanup();
      await fixtures.end();
    }
  });

  it('installs a private company-scoped receive policy and a locked-down worker', async () => {
    const functions = await fixtures.sql<{
      schema_name: string;
      function_name: string;
      owner_name: string;
      prosecdef: boolean;
      search_path_fixed: boolean;
      grants: string[];
    }>(
      `select
         n.nspname as schema_name,
         p.proname as function_name,
         owner.rolname as owner_name,
         p.prosecdef,
         coalesce(p.proconfig @> array['search_path=pg_catalog'], false) as search_path_fixed,
         coalesce(
           array_agg(
             case when acl.grantee = 0 then 'PUBLIC' else grantee.rolname end
             || ':' || acl.privilege_type
             order by case when acl.grantee = 0 then 'PUBLIC' else grantee.rolname end
           ) filter (where acl.grantee is not null and acl.grantee <> p.proowner),
           '{}'::text[]
         ) as grants
       from pg_catalog.pg_proc as p
       join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
       join pg_catalog.pg_roles as owner on owner.oid = p.proowner
       left join lateral pg_catalog.aclexplode(p.proacl) as acl on true
       left join pg_catalog.pg_roles as grantee on grantee.oid = acl.grantee
       where (n.nspname, p.proname) in (
         ('private', 'current_presence_company_id'),
         ('public', 'expire_knock_requests')
       )
       group by n.nspname, p.proname, p.oid, owner.rolname
       order by n.nspname, p.proname`,
    );

    expect(functions).toEqual([
      expect.objectContaining({
        schema_name: 'private',
        function_name: 'current_presence_company_id',
        owner_name: 'presence_maintenance_owner',
        prosecdef: true,
        search_path_fixed: true,
        grants: ['authenticated:EXECUTE', 'service_role:EXECUTE'],
      }),
      expect.objectContaining({
        schema_name: 'public',
        function_name: 'expire_knock_requests',
        owner_name: 'presence_maintenance_owner',
        prosecdef: true,
        search_path_fixed: true,
        grants: ['postgres:EXECUTE'],
      }),
    ]);

    const [policy] = await fixtures.sql<{
      cmd: string;
      roles: string[];
      qual: string;
    }>(
      `select cmd, roles::text[] as roles, qual
       from pg_catalog.pg_policies
       where schemaname = 'realtime'
         and tablename = 'messages'
         and policyname = 'phase4_knock_broadcast_receive'`,
    );
    expect(policy?.cmd).toBe('SELECT');
    expect(policy?.roles).toEqual(['authenticated']);
    expect(policy?.qual).toContain("extension = 'broadcast'::text");
    expect(policy?.qual).toContain('current_presence_company_id');
    expect(policy?.qual).toContain('is_presence_auth_session_unfenced');
    expect(policy?.qual).toContain(':knock');

    const [cronJob] = await fixtures.sql<{
      schedule: string;
      command: string;
      username: string;
    }>(
      `select schedule, command, username
       from cron.job
       where jobname = 'presence-expire-knocks-v1'`,
    );
    expect(cronJob).toEqual({
      schedule: '* * * * *',
      command: 'select public.expire_knock_requests();',
      username: 'postgres',
    });

    const indexes = await fixtures.sql<{ indexname: string }>(
      `select indexname
       from pg_catalog.pg_indexes
       where schemaname = 'public'
         and indexname in (
           'knock_requests_live_expiry_idx',
           'knock_requests_terminal_retention_idx'
         )
       order by indexname`,
    );
    expect(indexes.map(({ indexname }) => indexname)).toEqual([
      'knock_requests_live_expiry_idx',
      'knock_requests_terminal_retention_idx',
    ]);

    const [privilegeCleanup] = await fixtures.sql<{
      postgres_is_member: boolean;
      role_has_members: boolean;
      can_create_public: boolean;
      can_create_private: boolean;
    }>(
      `select
         pg_catalog.pg_has_role(
           'postgres',
           'presence_maintenance_owner',
           'member'
         ) as postgres_is_member,
         exists (
           select 1
           from pg_catalog.pg_auth_members as membership
           where membership.roleid = (
             select role.oid
             from pg_catalog.pg_roles as role
             where role.rolname = 'presence_maintenance_owner'
           )
         ) as role_has_members,
         pg_catalog.has_schema_privilege(
           'presence_maintenance_owner',
           'public',
           'CREATE'
         ) as can_create_public,
         pg_catalog.has_schema_privilege(
           'presence_maintenance_owner',
           'private',
           'CREATE'
         ) as can_create_private`,
    );
    expect(privilegeCleanup).toEqual({
      postgres_is_member: false,
      role_has_members: false,
      can_create_public: false,
      can_create_private: false,
    });
  });

  it('expires live rows and purges terminal rows older than 30 days', async () => {
    const pendingId = randomUUID();
    const retainedId = randomUUID();
    const purgedId = randomUUID();

    await fixtures.sql(
      `insert into public.knock_requests (
         id,
         space_id,
         requester_id,
         requester_name,
         company_id,
         expires_at,
         requester_location_version,
         requester_access_revision,
         space_access_revision,
         status,
         created_at,
         updated_at
       ) values
       (
         $1, $4, $5, 'Pending requester', $6,
         pg_catalog.clock_timestamp() - interval '1 minute',
         $7, $8, $9, 'pending',
         pg_catalog.clock_timestamp() - interval '2 minutes',
         pg_catalog.clock_timestamp() - interval '2 minutes'
       ),
       (
         $2, $4, $5, 'Recent terminal requester', $6,
         pg_catalog.clock_timestamp() - interval '1 day',
         $7, $8, $9, 'expired',
         pg_catalog.clock_timestamp() - interval '1 day',
         pg_catalog.clock_timestamp() - interval '1 day'
       ),
       (
         $3, $4, $5, 'Old terminal requester', $6,
         pg_catalog.clock_timestamp() - interval '31 days',
         $7, $8, $9, 'expired',
         pg_catalog.clock_timestamp() - interval '31 days',
         pg_catalog.clock_timestamp() - interval '31 days'
       )`,
      [
        pendingId,
        retainedId,
        purgedId,
        spaceId,
        requesterId,
        companyId,
        requesterLocationVersion,
        requesterAccessRevision,
        spaceAccessRevision,
      ],
    );

    const [result] = await fixtures.sql<{ affected: number }>(
      `select public.expire_knock_requests() as affected`,
    );
    expect(result?.affected).toBe(2);

    const rows = await fixtures.sql<{ id: string; status: string }>(
      `select id, status
       from public.knock_requests
       where id = any($1::text[])
       order by id`,
      [[pendingId, retainedId, purgedId]],
    );
    expect(rows).toHaveLength(2);
    expect(rows).toEqual(expect.arrayContaining([
      { id: pendingId, status: 'expired' },
      { id: retainedId, status: 'expired' },
    ]));
    expect(rows).not.toContainEqual(expect.objectContaining({ id: purgedId }));
  });
});
