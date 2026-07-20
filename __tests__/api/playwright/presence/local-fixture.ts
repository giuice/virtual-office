import { createClient, type User } from '@supabase/supabase-js';
import { Client } from 'pg';

const LOCAL_FIXTURE_FLAG = 'PRESENCE_E2E_PROVISION_LOCAL';
const LOCAL_PASSWORD = 'Presence-E2E-Local-2026!';

const IDS = {
  primaryCompany: 'eeeeeeee-0000-4000-8000-000000000001',
  externalCompany: 'eeeeeeee-0000-4000-8000-000000000002',
  adminUser: 'eeeeeeee-0000-4000-8000-000000000101',
  memberUser: 'eeeeeeee-0000-4000-8000-000000000102',
  externalUser: 'eeeeeeee-0000-4000-8000-000000000103',
  publicSpaceA: 'eeeeeeee-0000-4000-8000-000000000201',
  publicSpaceB: 'eeeeeeee-0000-4000-8000-000000000202',
  privateSpace: 'eeeeeeee-0000-4000-8000-000000000203',
  externalSpace: 'eeeeeeee-0000-4000-8000-000000000204',
  publicConversationA: 'eeeeeeee-0000-4000-8000-000000000401',
  publicConversationB: 'eeeeeeee-0000-4000-8000-000000000402',
  privateConversation: 'eeeeeeee-0000-4000-8000-000000000403',
  externalConversation: 'eeeeeeee-0000-4000-8000-000000000404',
} as const;

const LOCAL_ACCOUNTS = {
  admin: {
    email: 'presence-admin@local.test',
    password: LOCAL_PASSWORD,
    displayName: 'Presence Local Admin',
    appUserId: IDS.adminUser,
  },
  member: {
    email: 'presence-member@local.test',
    password: LOCAL_PASSWORD,
    displayName: 'Presence Local Member',
    appUserId: IDS.memberUser,
  },
  external: {
    email: 'presence-external@local.test',
    password: LOCAL_PASSWORD,
    displayName: 'Presence Local External',
    appUserId: IDS.externalUser,
  },
} as const;

export interface PresenceE2EAccount {
  email: string;
  password: string;
  displayName?: string;
  appUserId?: string;
}

export interface PresenceE2EEnvironment {
  admin: PresenceE2EAccount;
  member: PresenceE2EAccount;
  external: PresenceE2EAccount;
  localFixture: boolean;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for the Presence E2E suite.`);
  }
  return value;
}

function assertLoopbackUrl(value: string, label: string): URL {
  const parsed = new URL(value);
  if (!['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)) {
    throw new Error(`${label} must target loopback when ${LOCAL_FIXTURE_FLAG}=1.`);
  }
  return parsed;
}

async function ensureAuthUser(
  authAdmin: ReturnType<typeof createClient>['auth']['admin'],
  account: (typeof LOCAL_ACCOUNTS)[keyof typeof LOCAL_ACCOUNTS]
): Promise<User> {
  const { data: listed, error: listError } = await authAdmin.listUsers({
    page: 1,
    perPage: 1_000,
  });
  if (listError) throw listError;

  const existing = listed.users.find(
    (candidate) => candidate.email?.toLowerCase() === account.email.toLowerCase()
  );
  const attributes = {
    password: account.password,
    user_metadata: {
      full_name: account.displayName,
      name: account.displayName,
    },
  };

  if (existing) {
    const { data, error } = await authAdmin.updateUserById(
      existing.id,
      attributes
    );
    if (error) throw error;
    return data.user;
  }

  const { data, error } = await authAdmin.createUser({
    email: account.email,
    email_confirm: true,
    ...attributes,
  });
  if (error) throw error;
  return data.user;
}

async function provisionLocalFixture(): Promise<PresenceE2EEnvironment> {
  const apiUrl = requiredEnvironment('NEXT_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY');
  const databaseUrl = requiredEnvironment('PRESENCE_E2E_LOCAL_DB_URL');
  assertLoopbackUrl(apiUrl, 'NEXT_PUBLIC_SUPABASE_URL');
  assertLoopbackUrl(databaseUrl, 'PRESENCE_E2E_LOCAL_DB_URL');

  const adminClient = createClient(apiUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
  const authUsers = {
    admin: await ensureAuthUser(adminClient.auth.admin, LOCAL_ACCOUNTS.admin),
    member: await ensureAuthUser(adminClient.auth.admin, LOCAL_ACCOUNTS.member),
    external: await ensureAuthUser(adminClient.auth.admin, LOCAL_ACCOUNTS.external),
  };

  const database = new Client({ connectionString: databaseUrl });
  await database.connect();
  try {
    await database.query('begin');
    await database.query(
      "select pg_catalog.set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true)"
    );
    const runtime = await database.query<{ mode: string }>(
      'select mode from private.presence_runtime_control where singleton_id'
    );
    if (runtime.rows[0]?.mode === 'atomic') {
      await database.query(
        "select pg_catalog.set_config('app.presence_internal_writer', 'atomic-reconciliation', true)"
      );
    }

    await database.query(
      `delete from public.location_transition_requests
       where user_id = any($1::uuid[])`,
      [[IDS.adminUser, IDS.memberUser, IDS.externalUser]]
    );
    await database.query(
      `delete from public.knock_requests
       where requester_id = any($1::uuid[]) or responder_id = any($1::uuid[])`,
      [[IDS.adminUser, IDS.memberUser, IDS.externalUser]]
    );
    await database.query(
      `delete from public.space_presence_log
       where user_id = any($1::uuid[])`,
      [[IDS.adminUser, IDS.memberUser, IDS.externalUser]]
    );
    await database.query(
      `delete from public.user_presence_sessions
       where user_id = any($1::uuid[])`,
      [[IDS.adminUser, IDS.memberUser, IDS.externalUser]]
    );
    await database.query(
      `delete from public.revoked_presence_auth_sessions
       where user_id = any($1::uuid[])`,
      [[IDS.adminUser, IDS.memberUser, IDS.externalUser]]
    );

    await database.query(
      `insert into public.companies (id, name, admin_ids, settings)
       values
         ($1, 'Presence E2E Company', array[$3::uuid], jsonb_build_object('defaultSpaceId', $5::text)),
         ($2, 'Presence E2E External Company', array[$4::uuid], jsonb_build_object('defaultSpaceId', $6::text))
       on conflict (id) do update set
         name = excluded.name,
         admin_ids = excluded.admin_ids,
         settings = excluded.settings`,
      [
        IDS.primaryCompany,
        IDS.externalCompany,
        IDS.adminUser,
        IDS.externalUser,
        IDS.publicSpaceA,
        IDS.externalSpace,
      ]
    );

    const users = [
      [IDS.adminUser, authUsers.admin.id, IDS.primaryCompany, LOCAL_ACCOUNTS.admin, 'admin'],
      [IDS.memberUser, authUsers.member.id, IDS.primaryCompany, LOCAL_ACCOUNTS.member, 'member'],
      [IDS.externalUser, authUsers.external.id, IDS.externalCompany, LOCAL_ACCOUNTS.external, 'admin'],
    ] as const;
    for (const [id, supabaseUid, companyId, account, role] of users) {
      await database.query(
        `insert into public.users (
           id, supabase_uid, company_id, email, display_name, role, status, current_space_id
         ) values ($1, $2, $3, $4, $5, $6::public.user_role, 'online', null)
         on conflict (id) do update set
           supabase_uid = excluded.supabase_uid,
           company_id = excluded.company_id,
           email = excluded.email,
           display_name = excluded.display_name,
           role = excluded.role,
           status = 'online',
           current_space_id = null`,
        [id, supabaseUid, companyId, account.email, account.displayName, role]
      );
    }

    const spaces = [
      [IDS.publicSpaceA, IDS.primaryCompany, 'Presence Public Alpha', true],
      [IDS.publicSpaceB, IDS.primaryCompany, 'Presence Public Beta', true],
      [IDS.privateSpace, IDS.primaryCompany, 'Presence Private Shared', false],
      [IDS.externalSpace, IDS.externalCompany, 'Presence External Room', true],
    ] as const;
    for (const [index, [id, companyId, name, isPublic]] of spaces.entries()) {
      const accessControl = isPublic
        ? { isPublic: true }
        : { isPublic: false, allowedRoles: ['admin', 'member'] };
      await database.query(
        `insert into public.spaces (
           id, company_id, name, type, status, capacity, features, position,
           description, access_control, created_by
         ) values (
           $1, $2, $3, 'workspace', 'active', 8, array[]::text[],
           jsonb_build_object('x', $6::int, 'y', 0, 'width', 320, 'height', 180),
           'Presence E2E fixture', $4::jsonb, $5
         )
         on conflict (id) do update set
           company_id = excluded.company_id,
           name = excluded.name,
           type = excluded.type,
           status = excluded.status,
           capacity = excluded.capacity,
           features = excluded.features,
           position = excluded.position,
           description = excluded.description,
           access_control = excluded.access_control,
           created_by = excluded.created_by`,
        [
          id,
          companyId,
          name,
          JSON.stringify(accessControl),
          companyId === IDS.primaryCompany ? IDS.adminUser : IDS.externalUser,
          index * 360,
        ]
      );
    }

    const conversations = [
      [IDS.publicConversationA, IDS.publicSpaceA, 'Presence Public Alpha', [IDS.adminUser, IDS.memberUser], 'public'],
      [IDS.publicConversationB, IDS.publicSpaceB, 'Presence Public Beta', [IDS.adminUser, IDS.memberUser], 'public'],
      [IDS.privateConversation, IDS.privateSpace, 'Presence Private Shared', [IDS.adminUser, IDS.memberUser], 'private'],
      [IDS.externalConversation, IDS.externalSpace, 'Presence External Room', [IDS.externalUser], 'public'],
    ] as const;
    for (const [id, roomId, name, participants, visibility] of conversations) {
      await database.query(
        `insert into public.conversations (
           id, type, participants, name, room_id, visibility
         ) values ($1, 'room', $2::uuid[], $3, $4, $5::public.conversation_visibility_type)
         on conflict (id) do update set
           participants = excluded.participants,
           name = excluded.name,
           room_id = excluded.room_id,
           visibility = excluded.visibility`,
        [id, participants, name, roomId, visibility]
      );
    }
    await database.query('commit');

    const refreshedRuntime = await database.query<{ mode: string; cutover_id: string | null }>(
      'select mode, cutover_id from private.presence_runtime_control where singleton_id'
    );
    if (refreshedRuntime.rows[0]?.mode === 'legacy') {
      const cutoverId = 'eeeeeeee-0000-4000-8000-000000000301';
      await database.query(
        'select public.enter_presence_maintenance($1::uuid)',
        [cutoverId]
      );
      await database.query('select public.repair_presence_logs_for_cutover($1::uuid)', [cutoverId]);
      await database.query(
        `create unique index if not exists ux_space_presence_log_one_open_per_user
         on public.space_presence_log (user_id)
         where exited_at is null`
      );
      await database.query('select public.activate_atomic_presence_writer($1::uuid)', [cutoverId]);
    } else if (refreshedRuntime.rows[0]?.mode !== 'atomic') {
      throw new Error(
        `Disposable local Presence runtime must be legacy or atomic, received ${refreshedRuntime.rows[0]?.mode ?? 'missing'}.`
      );
    }
  } catch (error) {
    try {
      await database.query('rollback');
    } catch {
      // Preserve the original setup error.
    }
    throw error;
  } finally {
    await database.end();
  }

  return {
    admin: LOCAL_ACCOUNTS.admin,
    member: LOCAL_ACCOUNTS.member,
    external: LOCAL_ACCOUNTS.external,
    localFixture: true,
  };
}

export async function resolvePresenceE2EEnvironment(): Promise<PresenceE2EEnvironment> {
  if (process.env[LOCAL_FIXTURE_FLAG] === '1') {
    const environment = await provisionLocalFixture();
    process.env.AUTH_E2E_EMAIL = environment.admin.email;
    process.env.AUTH_E2E_PASSWORD = environment.admin.password;
    process.env.AUTH_E2E_MEMBER_EMAIL = environment.member.email;
    process.env.AUTH_E2E_MEMBER_PASSWORD = environment.member.password;
    process.env.AUTH_E2E_EXTERNAL_EMAIL = environment.external.email;
    process.env.AUTH_E2E_EXTERNAL_PASSWORD = environment.external.password;
    return environment;
  }

  return {
    admin: {
      email: requiredEnvironment('AUTH_E2E_EMAIL'),
      password: requiredEnvironment('AUTH_E2E_PASSWORD'),
    },
    member: {
      email: requiredEnvironment('AUTH_E2E_MEMBER_EMAIL'),
      password: requiredEnvironment('AUTH_E2E_MEMBER_PASSWORD'),
    },
    external: {
      email: requiredEnvironment('AUTH_E2E_EXTERNAL_EMAIL'),
      password: requiredEnvironment('AUTH_E2E_EXTERNAL_PASSWORD'),
    },
    localFixture: false,
  };
}
