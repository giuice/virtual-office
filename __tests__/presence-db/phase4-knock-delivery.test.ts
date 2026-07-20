import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PresenceFixtures } from './fixtures';
import { createServiceClient } from './auth-clients';

const NS = `phase4-knock-delivery-${randomUUID()}`;

describe('presence-db Phase 4 Knock delivery and retention', () => {
  let fixtures: PresenceFixtures;
  let companyId: string;
  let spaceId: string;
  let requesterId: string;
  let requesterSupabaseUid: string;
  let requesterLocationVersion: number;
  let requesterAccessRevision: string;
  let spaceAccessRevision: string;
  let serviceClient: ReturnType<typeof createServiceClient>;

  beforeAll(async () => {
    fixtures = await PresenceFixtures.connect(NS);
    serviceClient = createServiceClient();

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

    requesterSupabaseUid = randomUUID();
    const [requester] = await fixtures.sql<{
      id: string;
      location_version: number;
      presence_access_revision: string;
    }>(
      `insert into public.users
         (supabase_uid, email, display_name, company_id, role)
       values ($1, $2, 'Phase 4 requester', $3, 'member'::public.user_role)
       returning id, location_version, presence_access_revision`,
      [requesterSupabaseUid, `phase4-requester::${NS}@example.test`, companyId],
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

  it('returns exact Knock versions and revisions through service-only observed wrappers', async () => {
    const responderSupabaseUid = randomUUID();
    const responderAuthSessionId = randomUUID();
    const requesterAuthSessionId = randomUUID();
    const [responder] = await fixtures.sql<{
      id: string;
      location_version: number;
      presence_access_revision: string;
    }>(
      `insert into public.users
         (supabase_uid, email, display_name, company_id, role, current_space_id)
       values ($1, $2, 'Phase 4 responder', $3, 'member'::public.user_role, $4)
       returning id, location_version, presence_access_revision`,
      [
        responderSupabaseUid,
        `phase4-responder::${NS}@example.test`,
        companyId,
        spaceId,
      ],
    );
    if (!responder) throw new Error('Failed to create observed Knock responder');

    const [requesterSession] = await fixtures.sql<{ id: string }>(
      `insert into public.user_presence_sessions
         (registration_id, user_id, auth_session_id, company_id,
          connected_at, last_seen_at, expires_at)
       values ($1, $2, $3, $4, pg_catalog.clock_timestamp(),
               pg_catalog.clock_timestamp(),
               pg_catalog.clock_timestamp() + interval '90 seconds')
       returning id`,
      [randomUUID(), requesterId, requesterAuthSessionId, companyId],
    );
    const [responderSession] = await fixtures.sql<{ id: string }>(
      `insert into public.user_presence_sessions
         (registration_id, user_id, auth_session_id, company_id, space_id,
          placement_version, user_access_revision, space_access_revision,
          connected_at, last_seen_at, expires_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8,
               pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp(),
               pg_catalog.clock_timestamp() + interval '90 seconds')
       returning id`,
      [
        randomUUID(),
        responder.id,
        responderAuthSessionId,
        companyId,
        spaceId,
        responder.location_version,
        responder.presence_access_revision,
        spaceAccessRevision,
      ],
    );
    if (!requesterSession || !responderSession) {
      throw new Error('Failed to seed observed Knock sessions');
    }

    const missingStatusRpc = await serviceClient.rpc(
      'get_knock_request_status_observed',
      {
        p_requester_id: requesterId,
        p_auth_session_id: requesterAuthSessionId,
        p_session_id: requesterSession.id,
        p_request_id: randomUUID(),
      },
    );
    expect(missingStatusRpc.error).toBeNull();
    expect(missingStatusRpc.data).toMatchObject({
      ok: false,
      code: 'KNOCK_NOT_FOUND',
    });
    expect(missingStatusRpc.data).not.toHaveProperty('spaceId');
    expect(missingStatusRpc.data).not.toHaveProperty('requesterUserId');

    const missingCreateRpc = await serviceClient.rpc('create_knock_request_observed', {
      p_requester_id: requesterId,
      p_auth_session_id: requesterAuthSessionId,
      p_session_id: requesterSession.id,
      p_space_id: randomUUID(),
      p_request_id: randomUUID(),
    });
    expect(missingCreateRpc.error).toBeNull();
    expect(missingCreateRpc.data).toMatchObject({
      ok: false,
      code: 'SPACE_NOT_FOUND',
    });
    expect(missingCreateRpc.data).not.toHaveProperty(
      'requesterLocationVersionAfter',
    );

    const requestId = randomUUID();
    const createdRpc = await serviceClient.rpc('create_knock_request_observed', {
      p_requester_id: requesterId,
      p_auth_session_id: requesterAuthSessionId,
      p_session_id: requesterSession.id,
      p_space_id: spaceId,
      p_request_id: requestId,
    });
    expect(createdRpc.error).toBeNull();
    expect(createdRpc.data).toMatchObject({
      ok: true,
      code: 'KNOCK_CREATED',
      requestId,
      requesterLocationVersionBefore: requesterLocationVersion,
      requesterLocationVersionAfter: requesterLocationVersion + 1,
      requesterAccessRevision: Number(requesterAccessRevision),
      spaceAccessRevision: Number(spaceAccessRevision),
    });

    const pendingStatusRpc = await serviceClient.rpc(
      'get_knock_request_status_observed',
      {
        p_requester_id: requesterId,
        p_auth_session_id: requesterAuthSessionId,
        p_session_id: requesterSession.id,
        p_request_id: requestId,
      },
    );
    expect(pendingStatusRpc.error).toBeNull();
    expect(pendingStatusRpc.data).toMatchObject({
      ok: true,
      status: 'pending',
      requesterUserId: requesterId,
      spaceId,
    });
    expect(pendingStatusRpc.data).not.toHaveProperty('responderAccessRevision');

    const foreignCompanyId = randomUUID();
    const [foreignResponder] = await fixtures.sql<{ id: string }>(
      `with company as (
         insert into public.companies (id, name)
         values ($1, $2)
         returning id
       )
       insert into public.users
         (supabase_uid, email, display_name, company_id, role)
       select $3, $4, 'Foreign responder', company.id, 'member'::public.user_role
       from company
       returning id`,
      [
        foreignCompanyId,
        `Phase 4 foreign company::${NS}`,
        randomUUID(),
        `phase4-foreign-responder::${NS}@example.test`,
      ],
    );
    if (!foreignResponder) throw new Error('Failed to seed foreign responder');
    const foreignAuthSessionId = randomUUID();
    const [foreignSession] = await fixtures.sql<{ id: string }>(
      `insert into public.user_presence_sessions
         (registration_id, user_id, auth_session_id, company_id,
          connected_at, last_seen_at, expires_at)
       values ($1, $2, $3, $4, pg_catalog.clock_timestamp(),
               pg_catalog.clock_timestamp(),
               pg_catalog.clock_timestamp() + interval '90 seconds')
       returning id`,
      [randomUUID(), foreignResponder.id, foreignAuthSessionId, foreignCompanyId],
    );
    if (!foreignSession) throw new Error('Failed to seed foreign responder session');

    const crossTenantResponse = await serviceClient.rpc(
      'respond_to_knock_observed',
      {
        p_responder_id: foreignResponder.id,
        p_auth_session_id: foreignAuthSessionId,
        p_session_id: foreignSession.id,
        p_request_id: requestId,
        p_decision: 'APPROVE',
      },
    );
    expect(crossTenantResponse.error).toBeNull();
    expect(crossTenantResponse.data).toMatchObject({
      ok: false,
      code: 'SESSION_INVALID',
    });
    expect(crossTenantResponse.data).not.toHaveProperty('spaceId');
    expect(crossTenantResponse.data).not.toHaveProperty('requesterUserId');

    const respondedRpc = await serviceClient.rpc('respond_to_knock_observed', {
      p_responder_id: responder.id,
      p_auth_session_id: responderAuthSessionId,
      p_session_id: responderSession.id,
      p_request_id: requestId,
      p_decision: 'APPROVE',
    });
    expect(respondedRpc.error).toBeNull();
    expect(respondedRpc.data).toMatchObject({
      ok: true,
      code: 'KNOCK_RESPONDED',
      requesterUserId: requesterId,
      spaceId,
      requesterLocationVersionAfter: requesterLocationVersion + 1,
      requesterAccessRevision: Number(requesterAccessRevision),
      responderAccessRevision: Number(responder.presence_access_revision),
      spaceAccessRevision: Number(spaceAccessRevision),
      usable: true,
    });

    const statusRpc = await serviceClient.rpc('get_knock_request_status_observed', {
      p_requester_id: requesterId,
      p_auth_session_id: requesterAuthSessionId,
      p_session_id: requesterSession.id,
      p_request_id: requestId,
    });
    expect(statusRpc.error).toBeNull();
    expect(statusRpc.data).toMatchObject({
      ok: true,
      requesterUserId: requesterId,
      spaceId,
      requesterLocationVersionAfter: requesterLocationVersion + 1,
      requesterAccessRevision: Number(requesterAccessRevision),
      responderAccessRevision: Number(responder.presence_access_revision),
      spaceAccessRevision: Number(spaceAccessRevision),
    });

    await fixtures.sql(`delete from public.knock_requests where id = $1`, [requestId]);
  });

  it('resolves the authenticated company from Realtime JWT claims', async () => {
    await fixtures.sql('begin');
    try {
      await fixtures.sql('set local role authenticated');
      await fixtures.sql(
        `select pg_catalog.set_config('request.jwt.claims', $1, true)`,
        [JSON.stringify({ role: 'authenticated', sub: requesterSupabaseUid })],
      );
      const [result] = await fixtures.sql<{ company_id: string | null }>(
        `select private.current_presence_company_id() as company_id`,
      );

      expect(result?.company_id).toBe(companyId);
    } finally {
      await fixtures.sql('rollback');
    }
  });

  it('delivers Knock broadcasts only on the unfenced own-company topic', async () => {
    const authSessionId = randomUUID();
    const topic = `company:${companyId}:knock`;
    const otherTopic = `company:${randomUUID()}:knock`;

    await fixtures.sql('begin');
    try {
      const [message] = await fixtures.sql<{ id: string }>(
        `insert into realtime.messages (topic, extension)
         values ($1, 'broadcast')
         returning id`,
        [topic],
      );
      if (!message) throw new Error('Failed to create synthetic Knock broadcast');

      await fixtures.sql(
        `select pg_catalog.set_config('request.jwt.claims', $1, true)`,
        [JSON.stringify({
          role: 'authenticated',
          sub: requesterSupabaseUid,
          session_id: authSessionId,
        })],
      );
      await fixtures.sql(
        `select pg_catalog.set_config('realtime.topic', $1, true)`,
        [topic],
      );
      await fixtures.sql('set local role authenticated');
      expect(await fixtures.sql<{ id: string }>(
        `select id from realtime.messages where id = $1`,
        [message.id],
      )).toEqual([{ id: message.id }]);

      await fixtures.sql(
        `select pg_catalog.set_config('realtime.topic', $1, true)`,
        [otherTopic],
      );
      expect(await fixtures.sql(
        `select id from realtime.messages where id = $1`,
        [message.id],
      )).toEqual([]);

      await fixtures.sql(
        `select pg_catalog.set_config('realtime.topic', $1, true)`,
        [topic],
      );
      await fixtures.sql(
        `select pg_catalog.set_config('request.jwt.claims', $1, true)`,
        [JSON.stringify({ role: 'authenticated', sub: requesterSupabaseUid })],
      );
      expect(await fixtures.sql(
        `select id from realtime.messages where id = $1`,
        [message.id],
      )).toEqual([]);

      await fixtures.sql('reset role');
      await fixtures.sql(
        `insert into public.revoked_presence_auth_sessions
           (auth_session_id, user_id, revoked_at)
         values ($1, $2, pg_catalog.clock_timestamp())`,
        [authSessionId, requesterId],
      );
      await fixtures.sql(
        `select pg_catalog.set_config('request.jwt.claims', $1, true)`,
        [JSON.stringify({
          role: 'authenticated',
          sub: requesterSupabaseUid,
          session_id: authSessionId,
        })],
      );
      await fixtures.sql('set local role authenticated');
      expect(await fixtures.sql(
        `select id from realtime.messages where id = $1`,
        [message.id],
      )).toEqual([]);
    } finally {
      await fixtures.sql('rollback');
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
      `delete from public.knock_requests
       where requester_id = $1 and space_id = $2`,
      [requesterId, spaceId],
    );

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
