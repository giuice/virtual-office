import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuthedUser, type AuthedUser } from './auth-clients';
import { PresenceFixtures } from './fixtures';

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

  async function createOccupant(key: string): Promise<Occupant> {
    const user = await createAuthedUser(fixtures, NS, { key, companyId });
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
      ok: true, code: 'CLAIMED', shareId,
    });
    expect(await observed('get_active_screen_share_observed', viewer)).toMatchObject({
      ok: true,
      code: 'ACTIVE_READ',
      active: { presenterUserId: owner.user.appUserId, shareId },
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
