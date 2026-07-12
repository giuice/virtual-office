import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PresenceFixtures } from './fixtures';
import {
  createAuthedUser,
  createServiceClient,
  type AuthedUser,
} from './auth-clients';

const NS = `transition-idempotency-${randomUUID()}`;
const COMPANY_NAME = `phase3-company::${NS}`;
const SPACE_NAME = `phase3-space::${NS}`;

type CompanyRow = {
  readonly id: string;
};

type SpaceRow = {
  readonly id: string;
};

type CountRow = {
  readonly count: string;
};

type TransitionRow = {
  readonly user_id: string;
  readonly transition_id: string;
  readonly auth_session_id: string;
  readonly requested_space_id: string | null;
  readonly reason: string;
  readonly result: unknown;
};

const KNOCK_PHASE3_COLUMNS = [
  'company_id',
  'expires_at',
  'consumed_at',
  'requester_location_version',
  'requester_access_revision',
  'space_access_revision',
  'responder_access_revision',
] as const;

describe('presence-db transition idempotency', () => {
  let fixtures: PresenceFixtures;
  let serviceClient: ReturnType<typeof createServiceClient>;
  let companyId: string;
  let authBackedUser: AuthedUser;

  beforeAll(async () => {
    fixtures = await PresenceFixtures.connect(NS);
    serviceClient = createServiceClient();

    const [company] = await fixtures.sql<CompanyRow>(
      `insert into public.companies (name, settings)
       values ($1, '{}'::jsonb)
       returning id`,
      [COMPANY_NAME],
    );
    if (!company) {
      throw new Error('Failed to create the Phase 3 test company');
    }
    companyId = company.id;

    const [space] = await fixtures.sql<SpaceRow>(
      `insert into public.spaces
         (company_id, name, type, status, capacity, access_control)
       values ($1, $2, 'workspace'::public.space_type, 'active'::public.space_status, 10, '{"isPublic": true}'::jsonb)
       returning id`,
      [companyId, SPACE_NAME],
    );
    if (!space) {
      throw new Error('Failed to create the Phase 3 test space');
    }

    authBackedUser = await createAuthedUser(fixtures, NS, {
      key: 'transition-member',
      companyId,
      displayName: 'Phase 3 Transition Member',
      role: 'member',
    });
  });

  afterAll(async () => {
    if (fixtures) {
      if (authBackedUser) {
        await fixtures.sql(
          `delete from public.location_transition_requests where user_id = $1`,
          [authBackedUser.appUserId],
        );
        await fixtures.sql(
          `delete from public.revoked_presence_auth_sessions where user_id = $1`,
          [authBackedUser.appUserId],
        );
      }
      await fixtures.cleanup();
      await fixtures.end();
    }
  });

  async function seedTransition(opts: {
    readonly userId?: string;
    readonly transitionId?: string;
    readonly authSessionId?: string;
    readonly requestedSpaceId?: string | null;
    readonly reason?: string;
    readonly resultSql?: string;
    readonly createdAtSql?: string;
  }): Promise<{
    readonly userId: string;
    readonly transitionId: string;
    readonly authSessionId: string;
  }> {
    const userId = opts.userId ?? authBackedUser.appUserId;
    const transitionId = opts.transitionId ?? randomUUID();
    const authSessionId = opts.authSessionId ?? randomUUID();

    await fixtures.sql(
      `insert into public.location_transition_requests
         (
           user_id,
           transition_id,
           auth_session_id,
           requested_space_id,
           reason,
           result,
           created_at
         )
       values (
         $1,
         $2,
         $3,
         $4,
         $5,
         ${opts.resultSql ?? "jsonb_build_object('ok', true)"},
         ${opts.createdAtSql ?? 'pg_catalog.clock_timestamp()'}
       )`,
      [
        userId,
        transitionId,
        authSessionId,
        opts.requestedSpaceId ?? null,
        opts.reason ?? 'manual-enter',
      ],
    );

    return { userId, transitionId, authSessionId };
  }

  it('a: real authenticated JWT cannot access or poison transition requests', async () => {
    const seeded = await seedTransition({});

    const { error: selectError } = await authBackedUser.client
      .from('location_transition_requests')
      .select('*')
      .eq('transition_id', seeded.transitionId)
      .maybeSingle();
    expect(selectError, 'authenticated SELECT should be denied').not.toBeNull();

    const poisonTransitionId = randomUUID();
    const { error: insertError } = await authBackedUser.client
      .from('location_transition_requests')
      .insert({
        user_id: authBackedUser.appUserId,
        transition_id: poisonTransitionId,
        auth_session_id: randomUUID(),
        requested_space_id: randomUUID(),
        reason: 'manual-enter',
      });
    expect(insertError, 'authenticated INSERT should be denied').not.toBeNull();

    const { error: updateError } = await authBackedUser.client
      .from('location_transition_requests')
      .update({ result: { ok: false, code: 'POISONED' } })
      .eq('transition_id', seeded.transitionId);
    expect(updateError, 'authenticated UPDATE should be denied').not.toBeNull();

    const { error: deleteError } = await authBackedUser.client
      .from('location_transition_requests')
      .delete()
      .eq('transition_id', seeded.transitionId);
    expect(deleteError, 'authenticated DELETE should be denied').not.toBeNull();

    const [poisoned] = await fixtures.sql<CountRow>(
      `select count(*)::text as count
       from public.location_transition_requests
       where user_id = $1
         and transition_id = $2`,
      [authBackedUser.appUserId, poisonTransitionId],
    );
    expect(poisoned?.count).toBe('0');

    const [retained] = await fixtures.sql<CountRow>(
      `select count(*)::text as count
       from public.location_transition_requests
       where user_id = $1
         and transition_id = $2
         and result = jsonb_build_object('ok', true)`,
      [seeded.userId, seeded.transitionId],
    );
    expect(retained?.count).toBe('1');
  });

  it('b: service role can insert and read transition requests', async () => {
    const transitionId = randomUUID();
    const requestedSpaceId = randomUUID();
    const authSessionId = randomUUID();

    const { error: insertError } = await serviceClient
      .from('location_transition_requests')
      .insert({
        user_id: authBackedUser.appUserId,
        transition_id: transitionId,
        auth_session_id: authSessionId,
        requested_space_id: requestedSpaceId,
        reason: 'manual-enter',
        result: { ok: true, source: 'service-role-test' },
      });
    expect(insertError).toBeNull();

    const { data, error: selectError } = await serviceClient
      .from('location_transition_requests')
      .select(
        'user_id, transition_id, auth_session_id, requested_space_id, reason, result',
      )
      .eq('user_id', authBackedUser.appUserId)
      .eq('transition_id', transitionId)
      .single();
    expect(selectError).toBeNull();
    expect(data as TransitionRow).toMatchObject({
      user_id: authBackedUser.appUserId,
      transition_id: transitionId,
      auth_session_id: authSessionId,
      requested_space_id: requestedSpaceId,
      reason: 'manual-enter',
    });
  });

  it('c: catalog readback matches the transition table contract', async () => {
    const [rls] = await fixtures.sql<{
      readonly relrowsecurity: boolean;
      readonly relforcerowsecurity: boolean;
    }>(
      `select c.relrowsecurity, c.relforcerowsecurity
       from pg_catalog.pg_class as c
       join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname = 'location_transition_requests'`,
    );
    expect(rls).toMatchObject({
      relrowsecurity: true,
      relforcerowsecurity: true,
    });

    const [browserGrants] = await fixtures.sql<{ readonly grants: string[] }>(
      `select coalesce(
         array_agg(
           case
             when acl.grantee = 0 then 'PUBLIC'
             else grantee.rolname
           end || ':' || acl.privilege_type
           order by
             case
               when acl.grantee = 0 then 'PUBLIC'
               else grantee.rolname
             end,
             acl.privilege_type
         ) filter (
           where acl.grantee is not null
             and acl.grantee <> c.relowner
             and (
               acl.grantee = 0
               or grantee.rolname in ('anon', 'authenticated')
             )
         ),
         '{}'::text[]
       ) as grants
       from pg_catalog.pg_class as c
       join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
       left join lateral pg_catalog.aclexplode(c.relacl) as acl on true
       left join pg_catalog.pg_roles as grantee on grantee.oid = acl.grantee
       where n.nspname = 'public'
         and c.relname = 'location_transition_requests'
       group by c.oid`,
    );
    expect(browserGrants?.grants).toEqual([]);

    const browserPolicies = await fixtures.sql<{ readonly polname: string }>(
      `select p.polname
       from pg_catalog.pg_policy as p
       join pg_catalog.pg_class as c on c.oid = p.polrelid
       join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname = 'location_transition_requests'
         and p.polroles && array[
           (select oid from pg_catalog.pg_roles where rolname = 'anon'),
           (select oid from pg_catalog.pg_roles where rolname = 'authenticated')
         ]::oid[]`,
    );
    expect(browserPolicies).toEqual([]);

    await expect(
      fixtures.sql(
        `insert into public.location_transition_requests
           (user_id, transition_id, auth_session_id, reason)
         values ($1, $2, $3, 'invalid-reason')`,
        [authBackedUser.appUserId, randomUUID(), randomUUID()],
      ),
    ).rejects.toThrow();

    const realtimeRows = await fixtures.sql<{ readonly tablename: string }>(
      `select tablename
       from pg_catalog.pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'location_transition_requests'`,
    );
    expect(realtimeRows).toEqual([]);
  });

  it('d: supporting schema backfills and knock additions are present', async () => {
    // The Phase 1 backfill (20260710120000, WHERE IS NULL guard) cannot be
    // observed at runtime: every suite user is created after migrations run.
    // Post-migration users must default to NULL until their first successful
    // placement; a cross-file zero-null count would race other test files.
    const [freshUser] = await fixtures.sql<{
      readonly initial_placement_completed_at: string | null;
    }>(
      `insert into public.users (supabase_uid, email, display_name)
       values ($1, $2, 'Phase 3 Fresh Marker User')
       returning initial_placement_completed_at`,
      [randomUUID(), `phase3-fresh-marker::${NS}@example.test`],
    );
    expect(freshUser?.initial_placement_completed_at).toBeNull();

    const knockColumns = await fixtures.sql<{
      readonly column_name: string;
      readonly is_nullable: 'YES' | 'NO';
    }>(
      `select column_name, is_nullable
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'knock_requests'
         and column_name = any($1::text[])
       order by column_name`,
      [[...KNOCK_PHASE3_COLUMNS]],
    );
    expect(knockColumns.map((column) => column.column_name).sort()).toEqual(
      [...KNOCK_PHASE3_COLUMNS].sort(),
    );
    // Phase 1 hardening (20260710121000) set 5 of the 7 columns NOT NULL.
    const nullabilityByColumn = Object.fromEntries(
      knockColumns.map((column) => [column.column_name, column.is_nullable]),
    );
    expect(nullabilityByColumn).toEqual({
      company_id: 'NO',
      expires_at: 'NO',
      consumed_at: 'YES',
      requester_location_version: 'NO',
      requester_access_revision: 'NO',
      space_access_revision: 'NO',
      responder_access_revision: 'YES',
    });

    const [liveKnocks] = await fixtures.sql<CountRow>(
      `select count(*)::text as count
       from public.knock_requests
       where status in ('pending', 'approved')`,
    );
    expect(liveKnocks?.count).toBe('0');
  });

  it('e: purge_presence_history v2 purges only eligible transition rows', async () => {
    const completedManual = await seedTransition({
      reason: 'manual-enter',
      resultSql: "jsonb_build_object('ok', true, 'case', 'completed-manual')",
      createdAtSql: "pg_catalog.clock_timestamp() - interval '31 days'",
    });
    const nullResultManual = await seedTransition({
      reason: 'manual-enter',
      resultSql: 'null',
      createdAtSql: "pg_catalog.clock_timestamp() - interval '31 days'",
    });
    const logoutWithFenceAuthSessionId = randomUUID();
    const logoutWithFence = await seedTransition({
      authSessionId: logoutWithFenceAuthSessionId,
      reason: 'logout',
      resultSql: "jsonb_build_object('ok', true, 'case', 'logout-live-fence')",
      createdAtSql: "pg_catalog.clock_timestamp() - interval '31 days'",
    });
    const logoutWithoutFence = await seedTransition({
      reason: 'logout',
      resultSql: "jsonb_build_object('ok', true, 'case', 'logout-no-fence')",
      createdAtSql: "pg_catalog.clock_timestamp() - interval '31 days'",
    });

    await fixtures.sql(
      `insert into public.revoked_presence_auth_sessions
         (auth_session_id, user_id, revoked_at)
       values ($1, $2, pg_catalog.clock_timestamp())`,
      [logoutWithFenceAuthSessionId, authBackedUser.appUserId],
    );

    const [purge] = await fixtures.sql<{
      readonly result: { readonly transitionsDeleted: number };
    }>(`select public.purge_presence_history() as result`);
    expect(purge?.result.transitionsDeleted).toBeGreaterThanOrEqual(2);

    const rows = await fixtures.sql<{
      readonly transition_id: string;
      readonly present: boolean;
    }>(
      `select input.transition_id, (r.transition_id is not null) as present
       from (
         values
           ($1::uuid),
           ($2::uuid),
           ($3::uuid),
           ($4::uuid)
       ) as input(transition_id)
       left join public.location_transition_requests as r
         on r.user_id = $5
        and r.transition_id = input.transition_id
       order by input.transition_id`,
      [
        completedManual.transitionId,
        nullResultManual.transitionId,
        logoutWithFence.transitionId,
        logoutWithoutFence.transitionId,
        authBackedUser.appUserId,
      ],
    );
    const presenceByTransition = new Map(
      rows.map((row) => [row.transition_id, row.present]),
    );

    expect(presenceByTransition.get(completedManual.transitionId)).toBe(false);
    expect(presenceByTransition.get(nullResultManual.transitionId)).toBe(true);
    expect(presenceByTransition.get(logoutWithFence.transitionId)).toBe(true);
    expect(presenceByTransition.get(logoutWithoutFence.transitionId)).toBe(
      false,
    );
  });
});
