// Phase 1 exit-gate coverage for knock RLS and presence access revisions.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PresenceFixtures } from './fixtures';
import {
  createAnonClient,
  createAuthedUser,
  createServiceClient,
  type AuthedUser,
} from './auth-clients';

const NS = `knock-rls-${randomUUID()}`;
const COMPANY_NAME = `phase1-company::${NS}`;
const SPACE_NAME = `phase1-private-space::${NS}`;

// type aliases (not interfaces): fixtures.sql<T> requires Record<string, unknown>,
// which interfaces fail for lack of an implicit index signature.
type CompanyRow = {
  readonly id: string;
};

type SpaceRow = {
  readonly id: string;
};

type RevisionRow = {
  readonly presence_access_revision: string;
};

type Phase1KnockState = {
  readonly company_id: string;
  readonly location_version: number;
  readonly requester_access_revision: string;
  readonly space_access_revision: string;
  readonly responder_access_revision: string;
};

describe('presence-db knock RLS hardening', () => {
  let fixtures: PresenceFixtures;
  let serviceClient: ReturnType<typeof createServiceClient>;
  let companyId: string;
  let spaceId: string;
  let hasPhase1KnockColumns: boolean;
  let member: AuthedUser;
  let companyAdmin: AuthedUser;

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
      throw new Error('Failed to create the Phase 1 test company');
    }
    companyId = company.id;

    const [space] = await fixtures.sql<SpaceRow>(
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
       returning id`,
      [companyId, SPACE_NAME],
    );
    if (!space) {
      throw new Error('Failed to create the Phase 1 private test space');
    }
    spaceId = space.id;

    member = await createAuthedUser(fixtures, NS, {
      key: 'member',
      companyId,
      displayName: 'Phase 1 Member',
      role: 'member',
    });
    companyAdmin = await createAuthedUser(fixtures, NS, {
      key: 'admin',
      companyId,
      displayName: 'Phase 1 Admin',
      role: 'admin',
    });

    await fixtures.sql(
      `update public.users
       set current_space_id = $1, status = 'online'::public.user_status
       where id = $2`,
      [spaceId, companyAdmin.appUserId],
    );

    const [{ exists }] = await fixtures.sql<{ exists: boolean }>(
      `select (
         exists (
           select 1 from information_schema.columns
           where table_schema = 'public'
             and table_name = 'knock_requests'
             and column_name = 'company_id'
         )
         and exists (
           select 1 from information_schema.columns
           where table_schema = 'public'
             and table_name = 'knock_requests'
             and column_name = 'expires_at'
         )
       ) as exists`,
    );
    hasPhase1KnockColumns = exists;
  });

  afterAll(async () => {
    if (fixtures) {
      await fixtures.cleanup();
      await fixtures.end();
    }
  });

  async function seedKnock(
    requesterId: string = member.appUserId,
  ): Promise<string> {
    const id = randomUUID();
    // The Phase 1 partial unique index allows one live row per (requester, space);
    // expire any prior live seed the way production's create function does.
    await fixtures.sql(
      `update public.knock_requests
          set status = 'expired', updated_at = now()
        where requester_id = $1 and space_id = $2
          and status in ('pending','approved') and consumed_at is null`,
      [requesterId, spaceId],
    );
    const state = hasPhase1KnockColumns
      ? (
          await fixtures.sql<Phase1KnockState>(
            `select
               s.company_id,
               u.location_version,
               u.presence_access_revision as requester_access_revision,
               s.presence_access_revision as space_access_revision,
               responder.presence_access_revision as responder_access_revision
             from public.spaces as s
             join public.users as u on u.id = $1
             join public.users as responder on responder.id = $2
             where s.id = $3`,
            [requesterId, companyAdmin.appUserId, spaceId],
          )
        )[0]
      : undefined;

    const { error } = hasPhase1KnockColumns
      ? await serviceClient.from('knock_requests').insert({
          id,
          space_id: spaceId,
          requester_id: requesterId,
          requester_name: 'Seeded requester',
          status: 'pending',
          company_id: state?.company_id,
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          requester_location_version: state?.location_version,
          requester_access_revision: state?.requester_access_revision,
          space_access_revision: state?.space_access_revision,
        })
      : await serviceClient.from('knock_requests').insert({
          id,
          space_id: spaceId,
          requester_id: requesterId,
          requester_name: 'Seeded requester',
          status: 'pending',
        });

    if (error) {
      throw new Error(`Failed to seed knock request ${id}: ${error.message}`);
    }
    return id;
  }

  it('a / SEC-01: authenticated requester cannot insert a pre-approved knock row', async () => {
    const { error } = await member.client.from('knock_requests').insert({
      id: randomUUID(),
      space_id: spaceId,
      requester_id: member.appUserId,
      requester_name: 'x',
      status: 'approved',
      decision: 'APPROVE',
      responder_id: member.appUserId,
      responder_name: 'x',
    });

    expect(error).not.toBeNull();
  });

  it('b: authenticated requester cannot insert a plain pending knock row', async () => {
    const { error } = await member.client.from('knock_requests').insert({
      id: randomUUID(),
      space_id: spaceId,
      requester_id: member.appUserId,
      requester_name: 'x',
      status: 'pending',
    });

    expect(error).not.toBeNull();
  });

  it('c: authenticated user cannot SELECT any knock_requests row', async () => {
    const id = await seedKnock(companyAdmin.appUserId);
    const { error } = await member.client
      .from('knock_requests')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    expect(error).not.toBeNull();
  });

  it('d: authenticated occupant cannot UPDATE a pending row to approved', async () => {
    const id = await seedKnock();
    const { error } = await companyAdmin.client
      .from('knock_requests')
      .update({
        status: 'approved',
        decision: 'APPROVE',
        responder_id: companyAdmin.appUserId,
        responder_name: 'x',
      })
      .eq('id', id);

    expect(error).not.toBeNull();
  });

  it('e: authenticated occupant cannot DELETE a knock_requests row', async () => {
    const id = await seedKnock();
    const { error } = await companyAdmin.client
      .from('knock_requests')
      .delete()
      .eq('id', id);

    expect(error).not.toBeNull();
  });

  it('f: anonymous client SELECT and INSERT on knock_requests are both rejected', async () => {
    const id = await seedKnock();
    const anonClient = createAnonClient();

    const { error: selectError } = await anonClient
      .from('knock_requests')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    expect(selectError).not.toBeNull();

    const { error: insertError } = await anonClient
      .from('knock_requests')
      .insert({
        id: randomUUID(),
        space_id: spaceId,
        requester_id: member.appUserId,
        requester_name: 'anonymous',
        status: 'pending',
      });
    expect(insertError).not.toBeNull();
  });

  it('g: service role can INSERT and UPDATE knock_requests rows', async () => {
    const id = await seedKnock();
    expect(id).toEqual(expect.any(String));

    const { error: updateError } = hasPhase1KnockColumns
      ? await serviceClient
          .from('knock_requests')
          .update({
            status: 'approved',
            decision: 'APPROVE',
            responder_id: companyAdmin.appUserId,
            responder_name: 'Service responder',
            responder_access_revision: (
              await fixtures.sql<{ presence_access_revision: string }>(
                `select presence_access_revision
                 from public.users
                 where id = $1`,
                [companyAdmin.appUserId],
              )
            )[0]?.presence_access_revision,
          })
          .eq('id', id)
      : await serviceClient
          .from('knock_requests')
          .update({
            status: 'approved',
            decision: 'APPROVE',
            responder_id: companyAdmin.appUserId,
            responder_name: 'Service responder',
          })
          .eq('id', id);
    expect(updateError).toBeNull();
  });

  it(
    'h / P1: authenticated updates to server-owned presence columns are rejected or guarded',
    async () => {
      const [{ exists: usersHaveP1Columns }] = await fixtures.sql<{
        exists: boolean;
      }>(
        `select (
           exists (
             select 1 from information_schema.columns
             where table_schema = 'public'
               and table_name = 'users'
               and column_name = 'location_version'
           )
           and exists (
             select 1 from information_schema.columns
             where table_schema = 'public'
               and table_name = 'users'
               and column_name = 'presence_access_revision'
           )
           and exists (
             select 1 from information_schema.columns
             where table_schema = 'public'
               and table_name = 'spaces'
               and column_name = 'presence_access_revision'
           )
         ) as exists`,
      );
      expect(usersHaveP1Columns).toBe(true);

      const { error: locationVersionError } = await member.client
        .from('users')
        .update({ location_version: 99 })
        .eq('id', member.appUserId);
      expect(locationVersionError).not.toBeNull();

      const { error: userRevisionError } = await member.client
        .from('users')
        .update({ presence_access_revision: 99 })
        .eq('id', member.appUserId);
      expect(userRevisionError).not.toBeNull();

      // Privilege-escalation / route-bypass columns: a member must not be able
      // to self-update role, company_id, current_space_id, or email — the
      // row-scoped users RLS policy limits WHICH row, not WHICH values, so the
      // column grant is the only guard (regression: Phase 1 review blocker).
      for (const forbiddenPatch of [
        { role: 'admin' },
        { company_id: randomUUID() },
        { current_space_id: spaceId },
        { email: 'escalated@example.test' },
      ] as const) {
        const { error: forbiddenColumnError } = await member.client
          .from('users')
          .update(forbiddenPatch)
          .eq('id', member.appUserId);
        expect(
          forbiddenColumnError,
          `expected column grant to reject ${Object.keys(forbiddenPatch)[0]}`,
        ).not.toBeNull();
      }

      const [beforeSpace] = await fixtures.sql<RevisionRow>(
        `select presence_access_revision
         from public.spaces
         where id = $1`,
        [spaceId],
      );
      const { error: spaceRevisionError } = await companyAdmin.client
        .from('spaces')
        .update({ presence_access_revision: 99 })
        .eq('id', spaceId);

      if (spaceRevisionError) {
        expect(spaceRevisionError).not.toBeNull();
      } else {
        const [afterSpace] = await fixtures.sql<RevisionRow>(
          `select presence_access_revision
           from public.spaces
           where id = $1`,
          [spaceId],
        );
        expect(afterSpace.presence_access_revision).toBe(
          beforeSpace.presence_access_revision,
        );
      }
    },
  );

  it('i / P1: user and space revision triggers increment only on watched changes', async () => {
    const [{ role: originalRole, presence_access_revision: userBefore }] =
      await fixtures.sql<{
        role: 'admin' | 'member';
        presence_access_revision: string;
      }>(
        `select role, presence_access_revision
         from public.users
         where id = $1`,
        [member.appUserId],
      );

    try {
      const changedRole = originalRole === 'member' ? 'admin' : 'member';
      await fixtures.sql(
        `update public.users
         set role = $1::public.user_role
         where id = $2`,
        [changedRole, member.appUserId],
      );
      const [{ presence_access_revision: userAfterRole }] =
        await fixtures.sql<RevisionRow>(
          `select presence_access_revision
           from public.users
           where id = $1`,
          [member.appUserId],
        );
      expect(Number(userAfterRole)).toBe(Number(userBefore) + 1);

      await fixtures.sql(
        `update public.users
         set display_name = $1
         where id = $2`,
        ['Phase 1 Member Cosmetic', member.appUserId],
      );
      const [{ presence_access_revision: userAfterCosmetic }] =
        await fixtures.sql<RevisionRow>(
          `select presence_access_revision
           from public.users
           where id = $1`,
          [member.appUserId],
        );
      expect(Number(userAfterCosmetic)).toBe(Number(userAfterRole));

      await fixtures.sql(
        `update public.users
         set display_name = $1, presence_access_revision = 99
         where id = $2`,
        ['Phase 1 Member Cosmetic 2', member.appUserId],
      );
      const [{ presence_access_revision: userAfterAttempt }] =
        await fixtures.sql<RevisionRow>(
          `select presence_access_revision
           from public.users
           where id = $1`,
          [member.appUserId],
        );
      expect(Number(userAfterAttempt)).toBe(Number(userAfterRole));

      const [{ presence_access_revision: spaceBefore }] =
        await fixtures.sql<RevisionRow>(
          `select presence_access_revision
           from public.spaces
           where id = $1`,
          [spaceId],
        );
      await fixtures.sql(
        `update public.spaces
         set access_control = '{"isPublic": false, "allowedRoles": ["member"]}'::jsonb
         where id = $1`,
        [spaceId],
      );
      const [{ presence_access_revision: spaceAfterAccessControl }] =
        await fixtures.sql<RevisionRow>(
          `select presence_access_revision
           from public.spaces
           where id = $1`,
          [spaceId],
        );
      expect(Number(spaceAfterAccessControl)).toBe(Number(spaceBefore) + 1);

      await fixtures.sql(
        `update public.spaces
         set name = $1
         where id = $2`,
        [`${SPACE_NAME}-cosmetic`, spaceId],
      );
      const [{ presence_access_revision: spaceAfterCosmetic }] =
        await fixtures.sql<RevisionRow>(
          `select presence_access_revision
           from public.spaces
           where id = $1`,
          [spaceId],
        );
      expect(Number(spaceAfterCosmetic)).toBe(Number(spaceAfterAccessControl));

      await fixtures.sql(
        `update public.spaces
         set name = $1, presence_access_revision = 99
         where id = $2`,
        [`${SPACE_NAME}-cosmetic-2`, spaceId],
      );
      const [{ presence_access_revision: spaceAfterAttempt }] =
        await fixtures.sql<RevisionRow>(
          `select presence_access_revision
           from public.spaces
           where id = $1`,
          [spaceId],
        );
      expect(Number(spaceAfterAttempt)).toBe(Number(spaceAfterAccessControl));
    } finally {
      await fixtures.sql(
        `update public.users
         set role = $1::public.user_role, display_name = $2
         where id = $3`,
        [originalRole, 'Phase 1 Member', member.appUserId],
      );
      await fixtures.sql(
        `update public.spaces
         set name = $1, access_control = '{"isPublic": false}'::jsonb
         where id = $2`,
        [SPACE_NAME, spaceId],
      );
    }
  });
});
