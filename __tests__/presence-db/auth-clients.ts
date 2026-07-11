// Phase 1 local Supabase Auth clients and namespaced Auth-user cleanup.
import { afterAll } from 'vitest';
import {
  createClient,
  type SupabaseClient,
} from '@supabase/supabase-js';
import {
  LOCAL_ANON_KEY,
  LOCAL_API_URL,
  LOCAL_SERVICE_ROLE_KEY,
} from './setup';
import { PresenceFixtures } from './fixtures';

export interface CreateAuthedUserOptions {
  readonly key: string;
  readonly companyId: string;
  readonly displayName?: string;
  readonly password?: string;
  readonly role?: 'admin' | 'member';
}

export interface AuthedUser {
  readonly client: SupabaseClient;
  readonly appUserId: string;
  readonly supabaseUid: string;
}

const DEFAULT_PASSWORD = 'phase1-presence-password';
const createdAuthUserIds = new Set<string>();
const createdAppUserIds = new Set<string>();

export function createServiceClient(): SupabaseClient {
  return createClient(LOCAL_API_URL, LOCAL_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createAnonClient(): SupabaseClient {
  return createClient(LOCAL_API_URL, LOCAL_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function createAuthedUser(
  fixtures: PresenceFixtures,
  ns: string,
  opts: CreateAuthedUserOptions,
): Promise<AuthedUser> {
  // GoTrue rejects `::` in the local part, so the fixtures' `%::<ns>` email
  // cleanup cannot apply to auth-backed users; they are tracked and deleted
  // by id in the afterAll below instead.
  const email = `phase1-${opts.key}-${ns}@example.test`;
  const password = opts.password ?? DEFAULT_PASSWORD;
  const displayName = opts.displayName ?? `Phase 1 ${opts.key}`;
  const role = opts.role ?? 'member';
  const serviceClient = createServiceClient();

  const { data: authData, error: authError } =
    await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (authError || !authData.user) {
    throw new Error(
      `Failed to create namespaced auth user ${email}: ${
        authError?.message ?? 'Supabase Auth returned no user'
      }`,
    );
  }

  const supabaseUid = authData.user.id;
  createdAuthUserIds.add(supabaseUid);

  const [appUser] = await fixtures.sql<{ id: string }>(
    `insert into public.users
       (supabase_uid, email, display_name, company_id, role)
     values ($1, $2, $3, $4, $5::public.user_role)
     returning id`,
    [supabaseUid, email, displayName, opts.companyId, role],
  );

  if (!appUser) {
    throw new Error(`Failed to create public.users row for ${email}`);
  }
  createdAppUserIds.add(appUser.id);

  const client = createAnonClient();
  const { data: signInData, error: signInError } =
    await client.auth.signInWithPassword({ email, password });

  if (signInError || !signInData.user) {
    throw new Error(
      `Failed to sign in namespaced auth user ${email}: ${
        signInError?.message ?? 'Supabase Auth returned no signed-in user'
      }`,
    );
  }

  return {
    client,
    appUserId: appUser.id,
    supabaseUid,
  };
}

afterAll(async () => {
  const serviceClient = createServiceClient();
  const cleanupErrors: string[] = [];

  if (createdAppUserIds.size > 0) {
    const ids = [...createdAppUserIds];
    // knock_requests.responder_id has no ON DELETE action, so knock rows must
    // go before their users (requester_id cascades, responder_id does not).
    const { error: knockError } = await serviceClient
      .from('knock_requests')
      .delete()
      .or(`requester_id.in.(${ids.join(',')}),responder_id.in.(${ids.join(',')})`);
    if (knockError) {
      cleanupErrors.push(`public.knock_requests: ${knockError.message}`);
    }
    const { error } = await serviceClient
      .from('users')
      .delete()
      .in('id', ids);
    if (error) {
      cleanupErrors.push(`public.users: ${error.message}`);
    }
  }

  for (const authUserId of createdAuthUserIds) {
    const { error } = await serviceClient.auth.admin.deleteUser(authUserId);
    if (error) {
      cleanupErrors.push(`${authUserId}: ${error.message}`);
    }
  }

  if (cleanupErrors.length > 0) {
    throw new Error(
      `Failed to clean up namespaced Auth users: ${cleanupErrors.join('; ')}`,
    );
  }
});
