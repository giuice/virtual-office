import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuthedUser, type AuthedUser } from './auth-clients';
import { PresenceFixtures } from './fixtures';
import { LOCAL_DB_URL } from './setup';

const NS = `screen-share-lease-${randomUUID()}`;

interface Occupant {
  readonly user: AuthedUser;
  readonly authSessionId: string;
  readonly presenceSessionId: string;
}

function sessionIdFromAccessToken(token: string): string {
  const encodedPayload = token.split('.')[1];
  if (!encodedPayload) throw new Error('Local Auth token was malformed');
  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as {
    session_id?: string;
  };
  if (!payload.session_id) throw new Error('Local Auth session did not include session_id');
  return payload.session_id;
}

describe('presence-db screen-share lease authority', () => {
  let fixtures: PresenceFixtures;
  let companyId: string;
  let spaceId: string;
  let spaceAccessRevision: string;
  let owner: Occupant;
  let viewer: Occupant;

  async function createOccupant(key: string, displayName?: string): Promise<Occupant> {
    const user = await createAuthedUser(fixtures, NS, {
      key,
      companyId,
      ...(displayName ? { displayName } : {}),
    });
    const { data, error } = await user.client.auth.getSession();
    if (error || !data.session?.access_token) throw new Error('Missing local Auth session');
    const authSessionId = sessionIdFromAccessToken(data.session.access_token);

    const [placed] = await fixtures.sql<{
      location_version: number;
      presence_access_revision: string;
    }>(
      `update public.users set current_space_id = $1
       where id = $2 returning location_version, presence_access_revision`,
      [spaceId, user.appUserId],
    );
    if (!placed) throw new Error('Failed to place occupant fixture');
    const [session] = await fixtures.sql<{ id: string }>(
      `insert into public.user_presence_sessions
         (registration_id, user_id, auth_session_id, company_id, space_id,
          placement_version, user_access_revision, space_access_revision,
          connected_at, last_seen_at, expires_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8,
               pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp(),
               pg_catalog.clock_timestamp() + interval '90 seconds')
       returning id`,
      [
        randomUUID(), user.appUserId, authSessionId, companyId, spaceId,
        placed.location_version, placed.presence_access_revision, spaceAccessRevision,
      ],
    );
    if (!session) throw new Error('Failed to create qualifying Presence session');
    return { user, authSessionId, presenceSessionId: session.id };
  }

  async function observed(
    functionName: string,
    occupant: Occupant,
    shareId?: string,
  ): Promise<Record<string, unknown>> {
    const params = shareId
      ? [occupant.user.supabaseUid, occupant.authSessionId, occupant.presenceSessionId, spaceId, shareId]
      : [occupant.user.supabaseUid, occupant.authSessionId, occupant.presenceSessionId, spaceId];
    const placeholders = params.map((_, index) => `$${index + 1}`).join(', ');
    const [row] = await fixtures.sql<{ result: Record<string, unknown> }>(
      `select public.${functionName}(${placeholders}) as result`,
      params,
    );
    if (!row) throw new Error(`No result from ${functionName}`);
    return row.result;
  }

  beforeAll(async () => {
    fixtures = await PresenceFixtures.connect(NS);
    const [company] = await fixtures.sql<{ id: string }>(
      `insert into public.companies (name, settings) values ($1, '{}'::jsonb) returning id`,
      [`Screen share company::${NS}`],
    );
    if (!company) throw new Error('Failed to create company fixture');
    companyId = company.id;
    const [space] = await fixtures.sql<{ id: string; presence_access_revision: string }>(
      `insert into public.spaces (company_id, name, type, status, capacity, access_control)
       values ($1, $2, 'private_office'::public.space_type, 'active'::public.space_status, 8, '{"isPublic":true}'::jsonb)
       returning id, presence_access_revision`,
      [companyId, `Screen share room::${NS}`],
    );
    if (!space) throw new Error('Failed to create space fixture');
    spaceId = space.id;
    spaceAccessRevision = space.presence_access_revision;
    owner = await createOccupant('owner');
    viewer = await createOccupant('viewer');
  });

  afterAll(async () => {
    if (fixtures) {
      await fixtures.sql(`delete from public.users where company_id = $1`, [companyId]);
      await fixtures.cleanup();
      await fixtures.end();
    }
  });

  it('returns the documented empty-release result for a valid occupant with no lease', async () => {
    expect(await observed('release_screen_share_observed', owner, randomUUID())).toEqual({
      ok: false, code: 'LEASE_NOT_FOUND',
    });
  });

  it('claims an initially empty lease and reads no active presenter before the claim', async () => {
    expect(await observed('get_active_screen_share_observed', owner)).toMatchObject({
      ok: true, code: 'ACTIVE_READ', active: null,
    });
    const shareId = randomUUID();
    expect(await observed('claim_screen_share_observed', owner, shareId)).toMatchObject({
      ok: true, code: 'CLAIMED', shareId, presenterName: 'Phase 1 owner',
    });
    expect(await observed('get_active_screen_share_observed', viewer)).toMatchObject({
      ok: true,
      code: 'ACTIVE_READ',
      active: { presenterUserId: owner.user.appUserId, shareId, presenterName: 'Phase 1 owner' },
    });
  });

  it('permits only the exact owner release and preserves repeated-release idempotency', async () => {
    const active = await observed('get_active_screen_share_observed', owner);
    const shareId = (active.active as { shareId: string }).shareId;
    expect(await observed('release_screen_share_observed', viewer, shareId)).toEqual({
      ok: false, code: 'LEASE_NOT_OWNER',
    });
    expect(await observed('release_screen_share_observed', owner, shareId)).toEqual({
      ok: true, code: 'RELEASED', alreadyReleased: false,
    });
    expect(await observed('release_screen_share_observed', owner, shareId)).toEqual({
      ok: true, code: 'RELEASED', alreadyReleased: true,
    });
  });

  it('invalidates stale owner session and movement/revision fences without mutating Presence', async () => {
    const shareId = randomUUID();
    expect(await observed('claim_screen_share_observed', owner, shareId)).toMatchObject({ ok: true, code: 'CLAIMED' });
    await fixtures.sql(
      `update public.user_presence_sessions set retired_at = pg_catalog.clock_timestamp(), retirement_reason = 'explicit-disconnect'
       where id = $1`,
      [owner.presenceSessionId],
    );
    expect(await observed('get_active_screen_share_observed', viewer)).toMatchObject({ ok: true, code: 'ACTIVE_READ', active: null });
    const [lease] = await fixtures.sql<{ released_at: string | null }>(
      `select released_at from public.screen_share_leases where space_id = $1`, [spaceId],
    );
    expect(lease?.released_at).not.toBeNull();

    const mover = await createOccupant('mover');
    const movedShareId = randomUUID();
    expect(await observed('claim_screen_share_observed', mover, movedShareId)).toMatchObject({ ok: true, code: 'CLAIMED' });
    // Legacy-mode fixture SQL simulates a committed move: neither the old
    // placement nor its claim-time revision may keep the presenter active.
    await fixtures.sql(
      `update public.users
          set current_space_id = null, location_version = location_version + 1
        where id = $1`,
      [mover.user.appUserId],
    );
    expect(await observed('get_active_screen_share_observed', viewer)).toMatchObject({ ok: true, code: 'ACTIVE_READ', active: null });
  });

  it('returns only PROFILE_INVALID and writes no active lease when a held rename commits an invalid current name', async () => {
    const presenter = await createOccupant('invalid-name-race');
    const locker = new Client({ connectionString: LOCAL_DB_URL });
    await locker.connect();
    await locker.query(`select pg_catalog.set_config('request.jwt.claims', '{"role":"service_role"}', false)`);
    try {
      await locker.query('begin');
      await locker.query(
        `update public.users set display_name = $1 where id = $2`,
        ['  ', presenter.user.appUserId],
      );

      const claim = observed('claim_screen_share_observed', presenter, randomUUID());
      await new Promise((resolve) => setTimeout(resolve, 25));
      await locker.query('commit');

      expect(await claim).toEqual({ ok: false, code: 'PRESENTER_PROFILE_INVALID' });
      expect(await fixtures.sql(
        `select * from public.screen_share_leases
         where space_id = $1
           and presenter_user_id = $2
           and released_at is null
           and expires_at > pg_catalog.clock_timestamp()`,
        [spaceId, presenter.user.appUserId],
      )).toHaveLength(0);
    } finally {
      await locker.query('rollback').catch(() => undefined);
      await locker.end();
    }
  });

  it('canonicalizes whitespace, accepts exactly one hundred characters, and rejects overflow before mutation', async () => {
    const canonical = await createOccupant('canonical-name', '   Canonical presenter  ');
    const canonicalShareId = randomUUID();
    expect(await observed('claim_screen_share_observed', canonical, canonicalShareId)).toMatchObject({
      ok: true, code: 'CLAIMED', presenterName: 'Canonical presenter',
    });
    expect(await observed('release_screen_share_observed', canonical, canonicalShareId)).toMatchObject({
      ok: true, code: 'RELEASED',
    });

    const boundary = await createOccupant('boundary-name', 'x'.repeat(100));
    const boundaryShareId = randomUUID();
    expect(await observed('claim_screen_share_observed', boundary, boundaryShareId)).toMatchObject({
      ok: true, code: 'CLAIMED', presenterName: 'x'.repeat(100),
    });
    expect(await observed('release_screen_share_observed', boundary, boundaryShareId)).toMatchObject({
      ok: true, code: 'RELEASED',
    });
    await fixtures.sql(`update public.users set display_name = $1 where id = $2`, ['x'.repeat(101), boundary.user.appUserId]);
    expect(await observed('claim_screen_share_observed', boundary, randomUUID())).toEqual({
      ok: false, code: 'PRESENTER_PROFILE_INVALID',
    });
  });

  it('returns an active name from the same locked owner snapshot after a held rename commits', async () => {
    const presenter = await createOccupant('active-name-race', 'Before rename');
    const shareId = randomUUID();
    expect(await observed('claim_screen_share_observed', presenter, shareId)).toMatchObject({ ok: true, code: 'CLAIMED' });

    const locker = new Client({ connectionString: LOCAL_DB_URL });
    await locker.connect();
    await locker.query(`select pg_catalog.set_config('request.jwt.claims', '{"role":"service_role"}', false)`);
    try {
      await locker.query('begin');
      await locker.query(`update public.users set display_name = 'After rename' where id = $1`, [presenter.user.appUserId]);

      const active = observed('get_active_screen_share_observed', viewer);
      await new Promise((resolve) => setTimeout(resolve, 25));
      await locker.query('commit');

      expect(await active).toMatchObject({
        ok: true,
        code: 'ACTIVE_READ',
        active: { presenterUserId: presenter.user.appUserId, shareId, presenterName: 'After rename' },
      });
    } finally {
      await locker.query('rollback').catch(() => undefined);
      await locker.end();
    }
  });

  it('reads back the owner, search_path, grants, and display-name privilege from local Postgres', async () => {
    const [catalog] = await fixtures.sql<{
      owner: string;
      security_definer: boolean;
      config: string[] | null;
      service_execute: boolean;
      authenticated_execute: boolean;
      display_name_select: boolean;
    }>(
      `select pg_catalog.pg_get_userbyid(p.proowner) as owner,
              p.prosecdef as security_definer,
              p.proconfig as config,
              pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute,
              pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
              pg_catalog.has_column_privilege('presence_maintenance_owner', 'public.users', 'display_name', 'SELECT') as display_name_select
         from pg_catalog.pg_proc as p
         join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'claim_screen_share_observed'`,
    );
    expect(catalog).toEqual({
      owner: 'presence_maintenance_owner',
      security_definer: true,
      config: ['search_path=pg_catalog'],
      service_execute: true,
      authenticated_execute: false,
      display_name_select: true,
    });
  });

  it('enforces media-topic RLS for a mapped Auth UID rather than the application UUID', async () => {
    const topic = `company:${companyId}:space:${spaceId}:media`;
    await fixtures.sql('begin');
    try {
      await fixtures.sql(
        `select pg_catalog.set_config('request.jwt.claims', $1, true), pg_catalog.set_config('realtime.topic', $2, true)`,
        [JSON.stringify({ role: 'authenticated', sub: viewer.user.supabaseUid, session_id: viewer.authSessionId }), topic],
      );
      await fixtures.sql('set local role authenticated');
      expect(await fixtures.sql(`insert into realtime.messages (topic, extension) values ($1, 'broadcast') returning extension`, [topic])).toEqual([{ extension: 'broadcast' }]);
      await fixtures.sql(`select pg_catalog.set_config('realtime.topic', $1, true)`, [`company:${companyId}:space:${randomUUID()}:media`]);
      await expect(fixtures.sql(`insert into realtime.messages (topic, extension) values ($1, 'broadcast')`, [`company:${companyId}:space:${randomUUID()}:media`])).rejects.toMatchObject({ code: '42501' });
    } finally {
      await fixtures.sql('rollback');
    }
  });
});
