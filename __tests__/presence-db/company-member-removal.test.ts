import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PresenceFixtures } from "./fixtures";
import { createServiceClient } from "./auth-clients";

const NS = `company-removal-${randomUUID()}`;
const serviceClient = createServiceClient();

type IdRow = { readonly id: string };

async function callServiceRpc<T>(
  functionName: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await serviceClient.rpc(functionName, args);
  if (error) throw new Error(error.message);
  return data as T;
}

describe("presence-db Phase 7 atomic company member removal", () => {
  let fixtures: PresenceFixtures;
  let companyId: string;
  let spaceId: string;
  let actorId: string;
  let targetId: string;
  let targetInvitationId: string;
  let targetStartingLocationVersion: number;
  let targetStartingAccessRevision: number;

  beforeAll(async () => {
    fixtures = await PresenceFixtures.connect(NS);

    [companyId] = (
      await fixtures.sql<IdRow>(
        `insert into public.companies (name, settings, admin_ids)
         values ($1, '{}'::jsonb, '{}'::uuid[])
         returning id`,
        [`Phase 7 company::${NS}`],
      )
    ).map((row) => row.id);

    [spaceId] = (
      await fixtures.sql<IdRow>(
        `insert into public.spaces
           (company_id, name, type, status, capacity, access_control)
         values ($1, $2, 'workspace', 'active', 10, '{"isPublic":true}'::jsonb)
         returning id`,
        [companyId, `Phase 7 space::${NS}`],
      )
    ).map((row) => row.id);

    [actorId] = (
      await fixtures.sql<IdRow>(
        `insert into public.users
           (supabase_uid, email, display_name, company_id, role)
         values ($1, $2, 'Phase 7 actor', $3, 'admin')
         returning id`,
        [randomUUID(), `actor::${NS}@example.test`, companyId],
      )
    ).map((row) => row.id);

    const [target] = await fixtures.sql<{
      readonly id: string;
      readonly location_version: number;
      readonly presence_access_revision: string;
    }>(
      `insert into public.users
         (supabase_uid, email, display_name, company_id, role, current_space_id)
       values ($1, $2, 'Phase 7 target', $3, 'admin', $4)
       returning id, location_version, presence_access_revision::text`,
      [randomUUID(), `target::${NS}@example.test`, companyId, spaceId],
    );
    if (!target) throw new Error("Failed to create target fixture");
    targetId = target.id;
    targetStartingLocationVersion = target.location_version;
    targetStartingAccessRevision = Number(target.presence_access_revision);

    await fixtures.sql(
      `update public.companies
       set admin_ids = array[$1, $2]::uuid[]
       where id = $3`,
      [actorId, targetId, companyId],
    );
    await fixtures.sql(
      `insert into public.user_presence_sessions (
         registration_id,
         user_id,
         auth_session_id,
         company_id,
         space_id,
         placement_version,
         user_access_revision,
         space_access_revision,
         expires_at
       )
       select
         $1,
         $2,
         $3,
         $4,
         $5,
         u.location_version,
         u.presence_access_revision,
         s.presence_access_revision,
         pg_catalog.clock_timestamp() + interval '5 minutes'
       from public.users as u
       join public.spaces as s on s.id = $5
       where u.id = $2`,
      [randomUUID(), targetId, randomUUID(), companyId, spaceId],
    );
    await fixtures.sql(
      `insert into public.space_presence_log
         (space_id, user_id, entered_at)
       values ($1, $2, pg_catalog.clock_timestamp() - interval '1 minute')`,
      [spaceId, targetId],
    );
    [targetInvitationId] = (
      await fixtures.sql<IdRow>(
        `insert into public.invitations
           (token, email, company_id, role, expires_at, status)
         values ($1, $2, $3, 'admin', pg_catalog.clock_timestamp() + interval '1 day', 'pending')
         returning id`,
        [randomUUID(), `target::${NS}@example.test`, companyId],
      )
    ).map((row) => row.id);
  });

  afterAll(async () => {
    if (fixtures) {
      await fixtures.cleanup();
      await fixtures.end();
    }
  });

  it("exposes the function only to service_role", async () => {
    const [privileges] = await fixtures.sql<{
      readonly anon: boolean;
      readonly authenticated: boolean;
      readonly service_role: boolean;
    }>(
      `select
         pg_catalog.has_function_privilege(
           'anon',
           'public.remove_company_member_and_presence(uuid,uuid,uuid)',
           'EXECUTE'
         ) as anon,
         pg_catalog.has_function_privilege(
           'authenticated',
           'public.remove_company_member_and_presence(uuid,uuid,uuid)',
           'EXECUTE'
         ) as authenticated,
         pg_catalog.has_function_privilege(
           'service_role',
           'public.remove_company_member_and_presence(uuid,uuid,uuid)',
           'EXECUTE'
         ) as service_role`,
    );

    expect(privileges).toEqual({
      anon: false,
      authenticated: false,
      service_role: true,
    });
  });

  it("exposes invitation creation only to service_role and reauthorizes the actor", async () => {
    const [privileges] = await fixtures.sql<{
      readonly anon: boolean;
      readonly authenticated: boolean;
      readonly service_role: boolean;
    }>(
      `select
         pg_catalog.has_function_privilege(
           'anon',
           'public.create_company_invitation(uuid,uuid,text,public.user_role,text,timestamptz)',
           'EXECUTE'
         ) as anon,
         pg_catalog.has_function_privilege(
           'authenticated',
           'public.create_company_invitation(uuid,uuid,text,public.user_role,text,timestamptz)',
           'EXECUTE'
         ) as authenticated,
         pg_catalog.has_function_privilege(
           'service_role',
           'public.create_company_invitation(uuid,uuid,text,public.user_role,text,timestamptz)',
           'EXECUTE'
         ) as service_role`,
    );
    expect(privileges).toEqual({
      anon: false,
      authenticated: false,
      service_role: true,
    });

    const [nonAdmin] = await fixtures.sql<IdRow>(
      `insert into public.users
         (supabase_uid, email, display_name, company_id, role)
       values ($1, $2, 'Phase 7 non-admin', $3, 'member')
       returning id`,
      [randomUUID(), `invite-non-admin::${NS}@example.test`, companyId],
    );
    if (!nonAdmin)
      throw new Error("Failed to create invitation non-admin fixture");

    await expect(
      callServiceRpc("create_company_invitation", {
        p_actor_user_id: nonAdmin.id,
        p_company_id: companyId,
        p_email: `denied::${NS}@example.test`,
        p_role: "member",
        p_token: "a".repeat(64),
        p_expires_at: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      }),
    ).rejects.toThrow("INVITATION_CREATE_FORBIDDEN");
  });

  it("fails closed for legacy direct service-role invitation and membership writes", async () => {
    const { error: invitationError } = await serviceClient
      .from("invitations")
      .insert({
        token: randomUUID(),
        email: `legacy-direct::${NS}@example.test`,
        company_id: companyId,
        role: "member",
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        status: "pending",
      });
    expect(invitationError?.message).toContain(
      "DIRECT_SERVICE_ROLE_INVITATION_INSERT_FORBIDDEN",
    );

    const { error: membershipError } = await serviceClient
      .from("users")
      .update({ role: "member" })
      .eq("id", actorId);
    expect(membershipError?.message).toContain(
      "DIRECT_SERVICE_ROLE_MEMBERSHIP_UPDATE_FORBIDDEN",
    );
  });

  it("creates or reuses an invitation under the company lock", async () => {
    const email = `atomic-invite::${NS}@example.test`;
    const created = await callServiceRpc<Record<string, unknown>>(
      "create_company_invitation",
      {
        p_actor_user_id: actorId,
        p_company_id: companyId,
        p_email: email,
        p_role: "member",
        p_token: "b".repeat(64),
        p_expires_at: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      },
    );
    expect(created).toMatchObject({
      code: "COMPANY_INVITATION_CREATED",
      created: true,
      companyId,
      email,
      token: "b".repeat(64),
    });

    const reused = await callServiceRpc<Record<string, unknown>>(
      "create_company_invitation",
      {
        p_actor_user_id: actorId,
        p_company_id: companyId,
        p_email: email,
        p_role: "admin",
        p_token: "c".repeat(64),
        p_expires_at: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      },
    );
    expect(reused).toMatchObject({
      code: "COMPANY_INVITATION_REUSED",
      created: false,
      companyId,
      email,
      role: "member",
      token: "b".repeat(64),
    });
  });

  it("atomically creates a platform-admin tenant and its initial invitation", async () => {
    const serviceClient = createServiceClient();
    const email = `platform-admin-${randomUUID()}@example.test`;
    const { data: authData, error: authError } =
      await serviceClient.auth.admin.createUser({
        email,
        password: "phase7-platform-admin-password",
        email_confirm: true,
      });
    if (authError || !authData.user)
      throw new Error("Failed to create platform admin Auth fixture");

    try {
      await fixtures.sql(
        `insert into public.platform_admins (user_id) values ($1)`,
        [authData.user.id],
      );
      const invitationEmail = `initial-admin::${NS}@example.test`;
      const { data, error } = await serviceClient.rpc(
        "create_company_with_initial_admin_invitation",
        {
          p_platform_admin_auth_user_id: authData.user.id,
          p_name: `Phase 7 platform tenant::${NS}`,
          p_settings: { theme: "neon", planType: "free" },
          p_email: invitationEmail,
          p_token: "e".repeat(64),
          p_expires_at: new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000,
          ).toISOString(),
        },
      );
      if (error) throw new Error(error.message);
      const created = data as Record<string, unknown>;
      expect(created).toMatchObject({
        code: "PLATFORM_COMPANY_AND_INVITATION_CREATED",
        companyName: `Phase 7 platform tenant::${NS}`,
        email: invitationEmail,
        role: "admin",
        token: "e".repeat(64),
      });

      const [state] = await fixtures.sql<{
        readonly company_count: string;
        readonly invitation_count: string;
      }>(
        `select
           (select pg_catalog.count(*)::text from public.companies where id = $1) as company_count,
           (select pg_catalog.count(*)::text from public.invitations where company_id = $1) as invitation_count`,
        [created.companyId],
      );
      expect(state).toEqual({ company_count: "1", invitation_count: "1" });
    } finally {
      await fixtures.sql(
        `delete from public.platform_admins where user_id = $1`,
        [authData.user.id],
      );
      await serviceClient.auth.admin.deleteUser(authData.user.id);
    }
  });

  it("rejects accepting a legacy reservation that would exceed ten members", async () => {
    const [fullCompany] = await fixtures.sql<IdRow>(
      `insert into public.companies (name, settings, admin_ids)
       values ($1, '{}'::jsonb, '{}'::uuid[])
       returning id`,
      [`Phase 7 full company::${NS}`],
    );
    if (!fullCompany) throw new Error("Failed to create full company");

    await fixtures.sql(
      `insert into public.users
         (supabase_uid, email, display_name, company_id, role)
       select pg_catalog.gen_random_uuid(),
              'capacity-' || ordinal::text || $1,
              'Capacity member ' || ordinal::text,
              $2,
              'member'::public.user_role
       from pg_catalog.generate_series(1, 10) as ordinal`,
      [`::${NS}@example.test`, fullCompany.id],
    );

    const invitedEmail = `capacity-invited::${NS}@example.test`;
    const [invitedUser] = await fixtures.sql<IdRow>(
      `insert into public.users
         (supabase_uid, email, display_name, company_id, role)
       values ($1, $2, 'Capacity invited user', null, 'member')
       returning id`,
      [randomUUID(), invitedEmail],
    );
    const [invitation] = await fixtures.sql<IdRow>(
      `insert into public.invitations
         (token, email, company_id, role, expires_at, status)
       values ($1, $2, $3, 'member', pg_catalog.clock_timestamp() + interval '1 day', 'pending')
       returning id`,
      [randomUUID(), invitedEmail, fullCompany.id],
    );
    if (!invitedUser || !invitation)
      throw new Error("Failed to create capacity fixtures");

    await expect(
      callServiceRpc("accept_company_invitation_membership", {
        p_user_id: invitedUser.id,
        p_invitation_id: invitation.id,
        p_company_id: fullCompany.id,
        p_display_name: null,
      }),
    ).rejects.toThrow("INVITATION_ACCEPT_LIMIT_REACHED");

    const [state] = await fixtures.sql<{
      readonly company_id: string | null;
      readonly invitation_status: string;
    }>(
      `select member.company_id,
              invitation.status::text as invitation_status
       from public.users as member
       join public.invitations as invitation on invitation.id = $2
       where member.id = $1`,
      [invitedUser.id, invitation.id],
    );
    expect(state).toEqual({ company_id: null, invitation_status: "pending" });
  });

  it("rejects self-removal in the database without changing membership", async () => {
    await expect(
      callServiceRpc("remove_company_member_and_presence", {
        p_actor_user_id: actorId,
        p_target_user_id: actorId,
        p_company_id: companyId,
      }),
    ).rejects.toThrow("COMPANY_REMOVAL_SELF_FORBIDDEN");

    const [actor] = await fixtures.sql<{
      readonly company_id: string;
      readonly role: string;
    }>(
      `select company_id, role::text
       from public.users
       where id = $1`,
      [actorId],
    );
    expect(actor).toEqual({ company_id: companyId, role: "admin" });
  });

  it("keeps role update and member removal operational in atomic mode", async () => {
    await fixtures.sql("begin");
    try {
      await fixtures.sql("grant presence_maintenance_owner to postgres");
      await fixtures.sql("set local role presence_maintenance_owner");
      await fixtures.sql(
        `update private.presence_runtime_control
         set mode = 'atomic',
             cutover_id = $1,
             changed_at = pg_catalog.clock_timestamp(),
             changed_by = 'phase7-atomic-mode-test',
             legacy_adapter_enabled = true,
             legacy_adapter_disabled_at = null
         where singleton_id`,
        [randomUUID()],
      );
      await fixtures.sql("reset role");
      await fixtures.sql("revoke presence_maintenance_owner from postgres");

      await fixtures.sql("grant service_role to postgres");
      await fixtures.sql("set local role service_role");
      const [roleUpdate] = await fixtures.sql<{
        readonly result: { readonly code: string };
      }>(
        `select public.update_company_member_role(
           $1, $2, $3, 'member'::public.user_role
         ) as result`,
        [actorId, targetId, companyId],
      );
      expect(roleUpdate?.result.code).toBe("COMPANY_MEMBER_ROLE_UPDATED");

      const [removal] = await fixtures.sql<{
        readonly result: { readonly code: string };
      }>(
        `select public.remove_company_member_and_presence($1, $2, $3) as result`,
        [actorId, targetId, companyId],
      );
      expect(removal?.result.code).toBe("COMPANY_MEMBER_REMOVED");
    } finally {
      await fixtures.sql("rollback").catch(() => undefined);
      await fixtures.sql("reset role").catch(() => undefined);
    }
  });

  it("role changes invalidate placement and pre-minted invitations atomically", async () => {
    const roleTargetEmail = `role-target::${NS}@example.test`;
    const [roleTarget] = await fixtures.sql<{
      readonly id: string;
      readonly location_version: number;
      readonly presence_access_revision: string;
    }>(
      `insert into public.users
         (supabase_uid, email, display_name, company_id, role, current_space_id)
       values ($1, $2, 'Phase 7 role target', $3, 'admin', $4)
       returning id, location_version, presence_access_revision::text`,
      [randomUUID(), roleTargetEmail, companyId, spaceId],
    );
    if (!roleTarget) throw new Error("Failed to create role target");

    await fixtures.sql(
      `update public.companies
       set admin_ids = pg_catalog.array_append(admin_ids, $1)
       where id = $2`,
      [roleTarget.id, companyId],
    );
    await fixtures.sql(
      `insert into public.user_presence_sessions (
         registration_id, user_id, auth_session_id, company_id, space_id,
         placement_version, user_access_revision, space_access_revision, expires_at
       )
       select $1, $2, $3, $4, $5, u.location_version,
              u.presence_access_revision, s.presence_access_revision,
              pg_catalog.clock_timestamp() + interval '5 minutes'
       from public.users as u
       join public.spaces as s on s.id = $5
       where u.id = $2`,
      [randomUUID(), roleTarget.id, randomUUID(), companyId, spaceId],
    );
    await fixtures.sql(
      `insert into public.space_presence_log (space_id, user_id, entered_at)
       values ($1, $2, pg_catalog.clock_timestamp() - interval '1 minute')`,
      [spaceId, roleTarget.id],
    );
    const [invitation] = await fixtures.sql<IdRow>(
      `insert into public.invitations
         (token, email, company_id, role, expires_at, status)
       values ($1, $2, $3, 'admin', pg_catalog.clock_timestamp() + interval '1 day', 'pending')
       returning id`,
      [randomUUID(), roleTargetEmail, companyId],
    );
    if (!invitation) throw new Error("Failed to create role target invitation");

    const row = await callServiceRpc<Record<string, unknown>>(
      "update_company_member_role",
      {
        p_actor_user_id: actorId,
        p_target_user_id: roleTarget.id,
        p_company_id: companyId,
        p_role: "member",
      },
    );
    expect(row).toMatchObject({
      code: "COMPANY_MEMBER_ROLE_UPDATED",
      role: "member",
      previousSpaceId: spaceId,
      locationVersion: roleTarget.location_version + 1,
      presenceAccessRevision: Number(roleTarget.presence_access_revision) + 1,
      retiredSessionCount: 1,
      closedLogCount: 1,
      invalidatedInvitationCount: 1,
    });

    const [state] = await fixtures.sql<{
      readonly role: string;
      readonly current_space_id: string | null;
      readonly retirement_reason: string;
      readonly invitation_status: string;
    }>(
      `select u.role::text as role,
              u.current_space_id,
              s.retirement_reason,
              i.status::text as invitation_status
       from public.users as u
       join public.user_presence_sessions as s on s.user_id = u.id
       join public.invitations as i on i.id = $2
       where u.id = $1`,
      [roleTarget.id, invitation.id],
    );
    expect(state).toEqual({
      role: "member",
      current_space_id: null,
      retirement_reason: "role-change",
      invitation_status: "expired",
    });

    await expect(
      callServiceRpc("accept_company_invitation_membership", {
        p_user_id: roleTarget.id,
        p_invitation_id: invitation.id,
        p_company_id: companyId,
        p_display_name: null,
      }),
    ).rejects.toThrow();

    const [afterRejectedAcceptance] = await fixtures.sql<{
      readonly role: string;
    }>(`select role::text as role from public.users where id = $1`, [
      roleTarget.id,
    ]);
    expect(afterRejectedAcceptance?.role).toBe("member");
  });

  it("atomically clears membership, placement, leases, logs, and adminIds", async () => {
    const row = await callServiceRpc<Record<string, unknown>>(
      "remove_company_member_and_presence",
      {
        p_actor_user_id: actorId,
        p_target_user_id: targetId,
        p_company_id: companyId,
      },
    );

    expect(row).toMatchObject({
      ok: true,
      code: "COMPANY_MEMBER_REMOVED",
      actorUserId: actorId,
      targetUserId: targetId,
      companyId,
      previousSpaceId: spaceId,
      locationVersion: targetStartingLocationVersion + 1,
      presenceAccessRevision: targetStartingAccessRevision + 1,
      retiredSessionCount: 1,
      closedLogCount: 1,
      invalidatedInvitationCount: 1,
      removedAdminReference: true,
    });

    const [target] = await fixtures.sql<{
      readonly company_id: string | null;
      readonly role: string;
      readonly current_space_id: string | null;
      readonly location_version: number;
      readonly presence_access_revision: string;
    }>(
      `select
         company_id,
         role::text,
         current_space_id,
         location_version,
         presence_access_revision::text
       from public.users
       where id = $1`,
      [targetId],
    );
    expect(target).toEqual({
      company_id: null,
      role: "member",
      current_space_id: null,
      location_version: targetStartingLocationVersion + 1,
      presence_access_revision: String(targetStartingAccessRevision + 1),
    });

    const [session] = await fixtures.sql<{
      readonly retired: boolean;
      readonly expiry_matches_retirement: boolean;
      readonly retirement_reason: string;
      readonly space_id: string | null;
      readonly placement_version: number | null;
    }>(
      `select
         retired_at is not null as retired,
         expires_at = retired_at as expiry_matches_retirement,
         retirement_reason,
         space_id,
         placement_version
       from public.user_presence_sessions
       where user_id = $1`,
      [targetId],
    );
    expect(session).toEqual({
      retired: true,
      expiry_matches_retirement: true,
      retirement_reason: "company-removal",
      space_id: null,
      placement_version: null,
    });

    const [log] = await fixtures.sql<{ readonly closed: boolean }>(
      `select exited_at is not null as closed
       from public.space_presence_log
       where user_id = $1`,
      [targetId],
    );
    expect(log?.closed).toBe(true);

    const [company] = await fixtures.sql<{ readonly admin_ids: string[] }>(
      `select admin_ids from public.companies where id = $1`,
      [companyId],
    );
    expect(company?.admin_ids).toEqual([actorId]);

    const [invitation] = await fixtures.sql<{ readonly status: string }>(
      `select status::text as status from public.invitations where id = $1`,
      [targetInvitationId],
    );
    expect(invitation?.status).toBe("expired");
  });

  it("clears companyless legacy placement before accepting a new membership", async () => {
    const [legacyCompany] = await fixtures.sql<IdRow>(
      `insert into public.companies (name, settings, admin_ids)
       values ($1, '{}'::jsonb, '{}'::uuid[])
       returning id`,
      [`Phase 7 legacy accept company::${NS}`],
    );
    if (!legacyCompany) throw new Error("Failed to create legacy company");
    const [legacySpace] = await fixtures.sql<IdRow>(
      `insert into public.spaces
         (company_id, name, type, status, capacity, access_control)
       values ($1, $2, 'workspace', 'active', 10, '{"isPublic":true}'::jsonb)
       returning id`,
      [legacyCompany.id, `Phase 7 legacy accept space::${NS}`],
    );
    if (!legacySpace) throw new Error("Failed to create legacy space");

    const email = `dirty-accept::${NS}@example.test`;
    const [member] = await fixtures.sql<{
      readonly id: string;
      readonly location_version: number;
    }>(
      `insert into public.users
         (supabase_uid, email, display_name, company_id, role, current_space_id)
       values ($1, $2, 'Dirty accept member', null, 'member', $3)
       returning id, location_version`,
      [randomUUID(), email, legacySpace.id],
    );
    if (!member) throw new Error("Failed to create dirty acceptance member");
    await fixtures.sql(
      `insert into public.user_presence_sessions (
         registration_id, user_id, auth_session_id, company_id, space_id,
         placement_version, user_access_revision, space_access_revision, expires_at
       )
       select $1, $2, $3, $4, $5, u.location_version,
              u.presence_access_revision, s.presence_access_revision,
              pg_catalog.clock_timestamp() + interval '5 minutes'
       from public.users as u
       join public.spaces as s on s.id = $5
       where u.id = $2`,
      [randomUUID(), member.id, randomUUID(), legacyCompany.id, legacySpace.id],
    );
    await fixtures.sql(
      `insert into public.space_presence_log (space_id, user_id, entered_at)
       values ($1, $2, pg_catalog.clock_timestamp() - interval '1 minute')`,
      [legacySpace.id, member.id],
    );
    const [invitation] = await fixtures.sql<IdRow>(
      `insert into public.invitations
         (token, email, company_id, role, expires_at, status)
       values ($1, $2, $3, 'member', pg_catalog.clock_timestamp() + interval '1 day', 'pending')
       returning id`,
      [randomUUID(), email, companyId],
    );
    if (!invitation)
      throw new Error("Failed to create dirty acceptance invitation");

    const accepted = await callServiceRpc<Record<string, unknown>>(
      "accept_company_invitation_membership",
      {
        p_user_id: member.id,
        p_invitation_id: invitation.id,
        p_company_id: companyId,
        p_display_name: null,
      },
    );
    expect(accepted).toMatchObject({
      code: "COMPANY_INVITATION_ACCEPTED",
      companyId,
      previousSpaceId: legacySpace.id,
      locationVersion: member.location_version + 1,
      retiredSessionCount: 1,
      closedLogCount: 1,
    });

    const [state] = await fixtures.sql<{
      readonly company_id: string;
      readonly current_space_id: string | null;
      readonly retirement_reason: string;
      readonly log_closed: boolean;
    }>(
      `select u.company_id,
              u.current_space_id,
              s.retirement_reason,
              l.exited_at is not null as log_closed
       from public.users as u
       join public.user_presence_sessions as s on s.user_id = u.id
       join public.space_presence_log as l on l.user_id = u.id
       where u.id = $1`,
      [member.id],
    );
    expect(state).toEqual({
      company_id: companyId,
      current_space_id: null,
      retirement_reason: "membership-entry-reset",
      log_closed: true,
    });
  });

  it("clears companyless legacy placement before creating a company", async () => {
    const [legacyCompany] = await fixtures.sql<IdRow>(
      `insert into public.companies (name, settings, admin_ids)
       values ($1, '{}'::jsonb, '{}'::uuid[])
       returning id`,
      [`Phase 7 legacy create company::${NS}`],
    );
    if (!legacyCompany)
      throw new Error("Failed to create legacy creation company");
    const [legacySpace] = await fixtures.sql<IdRow>(
      `insert into public.spaces
         (company_id, name, type, status, capacity, access_control)
       values ($1, $2, 'workspace', 'active', 10, '{"isPublic":true}'::jsonb)
       returning id`,
      [legacyCompany.id, `Phase 7 legacy create space::${NS}`],
    );
    if (!legacySpace) throw new Error("Failed to create legacy creation space");
    const [member] = await fixtures.sql<{
      readonly id: string;
      readonly location_version: number;
    }>(
      `insert into public.users
         (supabase_uid, email, display_name, company_id, role, current_space_id)
       values ($1, $2, 'Dirty creation member', null, 'member', $3)
       returning id, location_version`,
      [randomUUID(), `dirty-create::${NS}@example.test`, legacySpace.id],
    );
    if (!member) throw new Error("Failed to create dirty company creator");
    await fixtures.sql(
      `insert into public.user_presence_sessions (
         registration_id, user_id, auth_session_id, company_id, space_id,
         placement_version, user_access_revision, space_access_revision, expires_at
       )
       select $1, $2, $3, $4, $5, u.location_version,
              u.presence_access_revision, s.presence_access_revision,
              pg_catalog.clock_timestamp() + interval '5 minutes'
       from public.users as u
       join public.spaces as s on s.id = $5
       where u.id = $2`,
      [randomUUID(), member.id, randomUUID(), legacyCompany.id, legacySpace.id],
    );
    await fixtures.sql(
      `insert into public.space_presence_log (space_id, user_id, entered_at)
       values ($1, $2, pg_catalog.clock_timestamp() - interval '1 minute')`,
      [legacySpace.id, member.id],
    );

    const created = await callServiceRpc<Record<string, unknown>>(
      "create_company_for_user",
      {
        p_user_id: member.id,
        p_name: `Phase 7 created from dirty user::${NS}`,
        p_settings: {},
      },
    );
    expect(created).toMatchObject({
      code: "COMPANY_CREATED",
      previousSpaceId: legacySpace.id,
      locationVersion: member.location_version + 1,
      retiredSessionCount: 1,
      closedLogCount: 1,
    });

    const [state] = await fixtures.sql<{
      readonly company_id: string;
      readonly current_space_id: string | null;
      readonly retirement_reason: string;
      readonly log_closed: boolean;
    }>(
      `select u.company_id,
              u.current_space_id,
              s.retirement_reason,
              l.exited_at is not null as log_closed
       from public.users as u
       join public.user_presence_sessions as s on s.user_id = u.id
       join public.space_presence_log as l on l.user_id = u.id
       where u.id = $1`,
      [member.id],
    );
    expect(state.company_id).toBe(created.companyId);
    expect(state).toMatchObject({
      current_space_id: null,
      retirement_reason: "membership-entry-reset",
      log_closed: true,
    });
  });
});
