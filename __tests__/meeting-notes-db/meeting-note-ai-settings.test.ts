// Phase 6 T8 (FR-024, BR-009; AC-017, AC-023): company AI settings with a
// server-only encrypted key, against the real local Supabase stack. The
// /api/companies/ai-settings and /api/companies/get route handlers run
// in-process with real local sessions; the database, RLS, Vault, the RPCs, the
// member-removal/role-change RPCs, and Realtime are real. Only canary keys are
// used (no real provider key exists anywhere in this suite).
import { format } from 'node:util';

import type { RealtimeChannel } from '@supabase/supabase-js';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { GET as getAiSettings, PUT as putAiSettings } from '@/app/api/companies/ai-settings/route';
import { GET as getCompany } from '@/app/api/companies/get/route';

import { createMeetingNotesWorld, type MeetingNotesDbUser, type MeetingNotesDbWorld } from './fixtures';
import { callRoute, signInSessionCookies, useLocalSupabaseEnv, type RouteResult, type SessionCookie } from './route-session';
import { MEETING_NOTES_DB_URL } from './setup';

vi.mock('next/headers', async () => (await import('./route-session')).nextHeadersMock);

const RPCS = ['public.save_meeting_note_ai_settings(uuid,uuid,bigint,text,text,text,integer,text)', 'public.read_meeting_note_ai_key(uuid)'];
const HELPERS = ['private.meeting_note_ai_secret_name(uuid)', 'private.delete_meeting_note_ai_secret()'];
const METADATA_KEYS = [
  'company_id',
  'daily_limit',
  'key_last_four',
  'model',
  'provider',
  'reasoning_level',
  'revision',
  'updated_at',
  'updated_by_name',
  'updated_by_user_id',
];

interface SettingsBody {
  configured: boolean;
  provider: string | null;
  model: string | null;
  reasoningLevel: string | null;
  dailyLimit: number;
  revision: number | null;
  keyLastFour: string | null;
  updatedBy: { userId: string | null; name: string } | null;
  updatedAt: string | null;
}

describe('meeting-note AI settings (local Supabase)', () => {
  let world: MeetingNotesDbWorld;
  const sessions = new Map<string, SessionCookie[]>();
  /** Every console line written while this file runs (route logs included). */
  const logLines: string[] = [];
  const spies: { mockRestore(): void }[] = [];
  /** Every canary key used in this file; none may appear outside the Vault. */
  const canaries: string[] = [];

  const canary = (label: string): string => {
    const value = `mn-canary-${label}-${world.ns}-${Math.random().toString(36).slice(2, 10)}-Z9q`;
    canaries.push(value);
    return value;
  };

  const as = (user: MeetingNotesDbUser): SessionCookie[] => {
    const cookies = sessions.get(user.appUserId);
    if (!cookies) throw new Error(`no session for ${user.displayName}`);
    return cookies;
  };

  const getSettings = (user: MeetingNotesDbUser): Promise<RouteResult> =>
    callRoute(as(user), getAiSettings, { method: 'GET', path: '/api/companies/ai-settings' });

  const putSettings = (user: MeetingNotesDbUser, body: unknown): Promise<RouteResult> =>
    callRoute(as(user), putAiSettings, { method: 'PUT', path: '/api/companies/ai-settings', body });

  const settingsOf = (result: RouteResult): SettingsBody => result.body.settings as SettingsBody;

  const validBody = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    expectedRevision: null,
    provider: 'openai',
    model: 'gpt-6.1-sol',
    reasoningLevel: 'high',
    dailyLimit: 50,
    apiKey: null,
    ...overrides,
  });

  const expectNoCanary = (value: unknown): void => {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    for (const key of canaries) expect(text).not.toContain(key);
  };

  const storedRow = async (companyId: string) =>
    (
      await world.query<Record<string, unknown>>(
        `select provider, model, reasoning_level, daily_limit, revision::int as revision, key_last_four,
                updated_by_user_id::text as updated_by_user_id
         from public.meeting_note_ai_settings where company_id = $1`,
        [companyId],
      )
    )[0];

  /** The decrypted key (trusted postgres read of the Vault view). */
  const storedKey = async (companyId: string): Promise<string | undefined> =>
    (
      await world.query<{ key: string }>(
        `select decrypted_secret as key from vault.decrypted_secrets where name = 'meeting_notes_ai_key:' || $1::text`,
        [companyId],
      )
    )[0]?.key;

  const secretCount = async (companyId: string): Promise<number> =>
    Number(
      (
        await world.query<{ n: string }>(
          `select count(*)::text as n from vault.secrets where name = 'meeting_notes_ai_key:' || $1::text`,
          [companyId],
        )
      )[0].n,
    );

  /** Trusted (service-role) save through PostgREST; sent immediately (the builder is lazy). */
  const saveDirect = async (actor: MeetingNotesDbUser, companyId: string, revision: number | null, key: string | null, limit = 30) =>
    await world.service.rpc('save_meeting_note_ai_settings', {
      p_actor_user_id: actor.appUserId,
      p_company_id: companyId,
      p_expected_revision: revision,
      p_provider: 'anthropic',
      p_model: 'claude-sonnet-5-5',
      p_reasoning_level: 'high',
      p_daily_limit: limit,
      p_api_key: key,
    });

  const waitForLockWaiter = async (pattern: string): Promise<void> => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const [row] = await world.query<{ waiting: string }>(
        `select count(*)::text as waiting from pg_catalog.pg_stat_activity
         where wait_event_type = 'Lock' and query ilike $1 and pid <> pg_catalog.pg_backend_pid()`,
        [pattern],
      );
      if (Number(row.waiting) > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`No session matching ${pattern} blocked on a lock.`);
  };

  /** A postgres session acting as `service_role` (the role PostgREST uses for the service key). */
  const serviceRoleSession = async (): Promise<Client> => {
    const client = new Client({ connectionString: MEETING_NOTES_DB_URL });
    await client.connect();
    await client.query(`select pg_catalog.set_config('request.jwt.claims', '{"role":"service_role"}', false)`);
    return client;
  };

  beforeAll(async () => {
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      spies.push(
        vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
          logLines.push(format(...args));
        }),
      );
    }
    useLocalSupabaseEnv();
    world = await createMeetingNotesWorld();
    for (const user of [world.adminA, world.memberA, world.adminB, world.memberB]) {
      sessions.set(user.appUserId, await signInSessionCookies(user.email));
    }
  });

  afterAll(async () => {
    for (const spy of spies) spy.mockRestore();
    vi.unstubAllEnvs();
    await world?.cleanup();
  });

  it('catalog: metadata-only table, read grants for members, no client writes, not published, service_role-only RPCs', async () => {
    const [table] = await world.query<Record<string, boolean>>(
      `select c.relrowsecurity as rls,
              has_table_privilege('anon', c.oid, 'select') as anon_select,
              has_table_privilege('anon', c.oid, 'insert,update,delete,truncate') as anon_write,
              has_table_privilege('authenticated', c.oid, 'select') as auth_select,
              has_table_privilege('authenticated', c.oid, 'insert,update,delete,truncate,references,trigger') as auth_write,
              has_table_privilege('service_role', c.oid, 'select') as service_select,
              has_table_privilege('service_role', c.oid, 'insert,update,delete,truncate') as service_write
       from pg_catalog.pg_class as c where c.oid = 'public.meeting_note_ai_settings'::regclass`,
    );
    expect(table).toEqual({
      rls: true,
      anon_select: false,
      anon_write: false,
      auth_select: true,
      auth_write: false,
      service_select: true,
      service_write: false,
    });

    const columns = await world.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'meeting_note_ai_settings' order by column_name`,
    );
    expect(columns.map((c) => c.column_name)).toEqual(METADATA_KEYS);

    // Neither the settings nor the Vault tables are in any publication.
    const published = await world.query<{ pubname: string; tablename: string }>(
      `select pubname, schemaname || '.' || tablename as tablename from pg_catalog.pg_publication_tables
       where (schemaname, tablename) in (('public', 'meeting_note_ai_settings'), ('vault', 'secrets'))`,
    );
    expect(published).toEqual([]);
    const allTables = await world.query<{ n: string }>(
      `select count(*)::text as n from pg_catalog.pg_publication where puballtables`,
    );
    expect(allTables[0].n).toBe('0');

    // Vault: no anon/authenticated access at all.
    const [vault] = await world.query<Record<string, boolean>>(
      `select has_schema_privilege('anon', 'vault', 'usage') as anon_usage,
              has_schema_privilege('authenticated', 'vault', 'usage') as auth_usage,
              has_table_privilege('authenticated', 'vault.secrets', 'select') as auth_secrets,
              has_table_privilege('authenticated', 'vault.decrypted_secrets', 'select') as auth_decrypted,
              has_table_privilege('anon', 'vault.decrypted_secrets', 'select') as anon_decrypted`,
    );
    expect(vault).toEqual({ anon_usage: false, auth_usage: false, auth_secrets: false, auth_decrypted: false, anon_decrypted: false });

    const fns = await world.query<{
      fn: string;
      owner: string;
      definer: boolean;
      config: string[] | null;
      anon: boolean;
      authenticated: boolean;
      service_role: boolean;
      public_grant: boolean;
    }>(
      `select p.oid::regprocedure::text as fn,
              pg_catalog.pg_get_userbyid(p.proowner) as owner,
              p.prosecdef as definer,
              p.proconfig as config,
              pg_catalog.has_function_privilege('anon', p.oid, 'execute') as anon,
              pg_catalog.has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
              pg_catalog.has_function_privilege('service_role', p.oid, 'execute') as service_role,
              exists (select 1 from pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) as a
                      where a.grantee = 0) as public_grant
       from pg_catalog.pg_proc as p
       where p.oid = any ($1::regprocedure[])
       order by 1`,
      [[...RPCS, ...HELPERS]],
    );
    expect(fns).toHaveLength(4);
    for (const fn of fns) {
      const isRpc = !fn.fn.startsWith('private.');
      expect(fn, fn.fn).toMatchObject({
        owner: 'postgres',
        config: ['search_path=""'],
        anon: false,
        authenticated: false,
        service_role: isRpc,
        public_grant: false,
      });
      if (fn.fn !== 'private.meeting_note_ai_secret_name(uuid)') expect(fn.definer, fn.fn).toBe(true);
    }
  });

  it('AC-017: a company that never saved settings reads as not configured with limit 20', async () => {
    for (const user of [world.adminB, world.memberB]) {
      const result = await getSettings(user);
      expect(result.status).toBe(200);
      expect(settingsOf(result)).toEqual({
        configured: false,
        provider: null,
        model: null,
        reasoningLevel: null,
        dailyLimit: 20,
        revision: null,
        keyLastFour: null,
        updatedBy: null,
        updatedAt: null,
      });
      expect(result.body.canManage).toBe(user === world.adminB);
      const providers = result.body.providers as { id: string; models: { id: string; reasoningLevels: { id: string }[] }[] }[];
      expect(providers.map((p) => p.id)).toEqual(['anthropic', 'openai', 'kimi', 'glm']);
      for (const provider of providers) expect(provider.models.length).toBeGreaterThan(0);
      // Options carry no wire parameters, URLs, or rejection data.
      expect(JSON.stringify(providers)).not.toMatch(/wire|docUrl|baseUrl|reasoning_effort|output_config/);
    }
  });

  it('AC-017: an admin saves provider, model, reasoning, key, and limit 50; the key is shown only as its last four characters', async () => {
    const key = canary('first');
    const saved = await putSettings(world.adminA, validBody({ apiKey: key }));
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expectNoCanary(saved.body);
    expect(settingsOf(saved)).toMatchObject({
      configured: true,
      provider: 'openai',
      model: 'gpt-6.1-sol',
      reasoningLevel: 'high',
      dailyLimit: 50,
      revision: 1,
      keyLastFour: key.slice(-4),
      updatedBy: { userId: world.adminA.appUserId, name: world.adminA.displayName },
    });

    // Persisted: every member of the company reads the same metadata.
    for (const user of [world.adminA, world.memberA]) {
      const read = await getSettings(user);
      expect(read.status).toBe(200);
      expectNoCanary(read.body);
      expect(settingsOf(read)).toEqual(settingsOf(saved));
    }
    expect(await storedRow(world.companyA)).toMatchObject({ provider: 'openai', daily_limit: 50, revision: 1 });
    expect(await storedKey(world.companyA)).toBe(key);
    expect(await secretCount(world.companyA)).toBe(1);

    // The ciphertext column never holds the plaintext.
    const [cipher] = await world.query<{ secret: string }>(
      `select secret from vault.secrets where name = 'meeting_notes_ai_key:' || $1::text`,
      [world.companyA],
    );
    expect(cipher.secret).not.toContain(key);

    // The service-role read RPC (server code only) returns one consistent snapshot with the key.
    const { data, error } = await world.service.rpc('read_meeting_note_ai_key', { p_company_id: world.companyA });
    expect(error).toBeNull();
    expect(data).toEqual({
      revision: 1,
      provider: 'openai',
      model: 'gpt-6.1-sol',
      reasoning_level: 'high',
      daily_limit: 50,
      api_key: key,
    });
    expect((await world.service.rpc('read_meeting_note_ai_key', { p_company_id: world.companyB })).data).toBeNull();
  });

  it('AC-017: a blank key keeps the stored key; a new key replaces it in the same save; each save bumps the revision', async () => {
    const before = await storedKey(world.companyA);
    const kept = await putSettings(world.adminA, validBody({ expectedRevision: 1, reasoningLevel: 'low', dailyLimit: 60 }));
    expect(kept.status, JSON.stringify(kept.body)).toBe(200);
    expect(settingsOf(kept)).toMatchObject({ revision: 2, reasoningLevel: 'low', dailyLimit: 60, keyLastFour: before?.slice(-4) });
    expect(await storedKey(world.companyA)).toBe(before);

    const replacement = canary('replace');
    const replaced = await putSettings(
      world.adminA,
      validBody({ expectedRevision: 2, provider: 'anthropic', model: 'claude-opus-5-5', reasoningLevel: 'xhigh', dailyLimit: 50, apiKey: replacement }),
    );
    expect(replaced.status, JSON.stringify(replaced.body)).toBe(200);
    expectNoCanary(replaced.body);
    expect(settingsOf(replaced)).toMatchObject({ revision: 3, provider: 'anthropic', keyLastFour: replacement.slice(-4) });
    expect(await storedKey(world.companyA)).toBe(replacement);
    expect(await secretCount(world.companyA)).toBe(1);
  });

  it('a stale revision is a 409 with the current settings and changes nothing', async () => {
    const before = await storedRow(world.companyA);
    const keyBefore = await storedKey(world.companyA);
    const stale = await putSettings(world.adminA, validBody({ expectedRevision: 1, dailyLimit: 5, apiKey: canary('stale') }));
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('MEETING_NOTE_AI_SETTINGS_STALE_REVISION');
    expect(stale.body.currentRevision).toBe(before.revision);
    expect(settingsOf(stale)).toMatchObject({ revision: before.revision, dailyLimit: before.daily_limit });
    expectNoCanary(stale.body);
    // A first-save request (expectedRevision null) on a configured company is stale too.
    const firstAgain = await putSettings(world.adminA, validBody({ apiKey: canary('first-again') }));
    expect(firstAgain.status).toBe(409);
    expectNoCanary(firstAgain.body);
    expect(await storedRow(world.companyA)).toEqual(before);
    expect(await storedKey(world.companyA)).toBe(keyBefore);
  });

  it('AC-017: members are denied, limits 0/201 and off-matrix choices are rejected, and nothing changes', async () => {
    const beforeA = await storedRow(world.companyA);
    const memberAttempt = await putSettings(world.memberA, validBody({ expectedRevision: beforeA.revision, apiKey: canary('member') }));
    expect(memberAttempt.status).toBe(403);
    expect(memberAttempt.body.code).toBe('MEETING_NOTE_AI_SETTINGS_FORBIDDEN');
    expectNoCanary(memberAttempt.body);
    expect(await storedRow(world.companyA)).toEqual(beforeA);

    const cases: [Record<string, unknown>, string][] = [
      [{ dailyLimit: 0 }, 'MEETING_NOTE_AI_DAILY_LIMIT_INVALID'],
      [{ dailyLimit: 201 }, 'MEETING_NOTE_AI_DAILY_LIMIT_INVALID'],
      [{ dailyLimit: 1.5 }, 'MEETING_NOTE_AI_DAILY_LIMIT_INVALID'],
      [{ provider: 'mistral' }, 'MEETING_NOTE_AI_PROVIDER_INVALID'],
      [{ provider: 'glm', model: 'gpt-6.1-sol' }, 'MEETING_NOTE_AI_MODEL_INVALID'],
      [{ provider: 'openai', model: 'gpt-6.1-sol', reasoningLevel: 'none' }, 'MEETING_NOTE_AI_REASONING_INVALID'],
      [{ apiKey: null }, 'MEETING_NOTE_AI_KEY_REQUIRED'],
      [{ apiKey: `${canary('spaced')} tail` }, 'MEETING_NOTE_AI_KEY_INVALID'],
    ];
    for (const [overrides, code] of cases) {
      const result = await putSettings(world.adminB, validBody({ apiKey: canary('invalid'), ...overrides }));
      expect(result.status, `${JSON.stringify(overrides)} → ${JSON.stringify(result.body)}`).toBe(400);
      expect(result.body.code).toBe(code);
      expectNoCanary(result.body);
    }
    expect(await storedRow(world.companyB)).toBeUndefined();
    expect(await secretCount(world.companyB)).toBe(0);

    // The database enforces the same bounds for trusted callers.
    for (const limit of [0, 201]) {
      const direct = await saveDirect(world.adminB, world.companyB, null, canary('direct-limit'), limit);
      expect(direct.error?.code).toBe('22023');
      expect(direct.error?.message).toBe('MEETING_NOTE_AI_DAILY_LIMIT_INVALID');
      expectNoCanary(direct.error);
    }
    const noKey = await saveDirect(world.adminB, world.companyB, null, null);
    expect(noKey.error?.message).toBe('MEETING_NOTE_AI_KEY_REQUIRED');
    expect(await storedRow(world.companyB)).toBeUndefined();
  });

  it('AC-017/AC-023: no client path reads a key — direct selects by every role, Vault access, and RPC calls as anon/authenticated', async () => {
    const before = await storedRow(world.companyA);
    const keyBefore = await storedKey(world.companyA);

    // Settings rows: members of A see metadata only; B and anon see nothing of A.
    for (const user of [world.adminA, world.memberA]) {
      const { data, error } = await user.client.from('meeting_note_ai_settings').select('*');
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(Object.keys(data?.[0] ?? {}).sort()).toEqual(METADATA_KEYS);
      expectNoCanary(data);
    }
    for (const user of [world.adminB, world.memberB]) {
      const { data, error } = await user.client.from('meeting_note_ai_settings').select('*').eq('company_id', world.companyA);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
    const anonRead = await world.anon.from('meeting_note_ai_settings').select('*');
    expect(anonRead.data ?? []).toEqual([]);
    expectNoCanary(anonRead);
    const serviceRead = await world.service.from('meeting_note_ai_settings').select('*').eq('company_id', world.companyA);
    expectNoCanary(serviceRead.data);

    // No client write path, even for an admin of the company.
    const directUpdate = await world.adminA.client
      .from('meeting_note_ai_settings')
      .update({ daily_limit: 199 })
      .eq('company_id', world.companyA)
      .select();
    expect(directUpdate.error?.code).toBe('42501');
    const directInsert = await world.adminB.client.from('meeting_note_ai_settings').insert({
      company_id: world.companyB, provider: 'openai', model: 'gpt-6.1-sol', reasoning_level: 'high',
      daily_limit: 20, revision: 1, key_last_four: 'abcd', updated_by_name: 'x',
    });
    expect(directInsert.error?.code).toBe('42501');

    // Vault is not exposed through the Data API, and the database denies the client roles.
    for (const client of [world.anon, world.memberA.client, world.adminA.client]) {
      for (const relation of ['secrets', 'decrypted_secrets']) {
        const { data, error } = await client.schema('vault').from(relation).select('*');
        expect(error).not.toBeNull();
        expect(data).toBeNull();
      }
    }
    const pgSession = new Client({ connectionString: MEETING_NOTES_DB_URL });
    await pgSession.connect();
    try {
      for (const role of ['anon', 'authenticated']) {
        for (const sql of ['select decrypted_secret from vault.decrypted_secrets', 'select secret from vault.secrets']) {
          await pgSession.query('begin');
          await pgSession.query(`set local role ${role}`);
          await expect(pgSession.query(sql)).rejects.toMatchObject({ code: '42501' });
          await pgSession.query('rollback');
        }
      }
    } finally {
      await pgSession.end();
    }

    // The save and read RPCs are denied to anon and authenticated (any member, any company).
    const saveArgs = {
      p_actor_user_id: world.adminA.appUserId,
      p_company_id: world.companyA,
      p_expected_revision: before.revision,
      p_provider: 'openai',
      p_model: 'gpt-6.1-sol',
      p_reasoning_level: 'high',
      p_daily_limit: 77,
      p_api_key: canary('rpc-direct'),
    };
    for (const client of [world.anon, world.adminA.client, world.memberA.client, world.adminB.client, world.memberB.client]) {
      const save = await client.rpc('save_meeting_note_ai_settings', saveArgs);
      expect(save.error?.code).toBe('42501');
      expect(save.data).toBeNull();
      const read = await client.rpc('read_meeting_note_ai_key', { p_company_id: world.companyA });
      expect(read.error?.code).toBe('42501');
      expect(read.data).toBeNull();
      expectNoCanary(save);
      expectNoCanary(read);
    }

    // Company reads (company row and the company route) never carry the key.
    const companyRow = await world.memberA.client.from('companies').select('*').eq('id', world.companyA);
    expect(companyRow.data).toHaveLength(1);
    expectNoCanary(companyRow.data);
    const companyRoute = await callRoute(as(world.memberA), getCompany, {
      method: 'GET',
      path: `/api/companies/get?id=${world.companyA}`,
    });
    expect(companyRoute.status).toBe(200);
    expectNoCanary(companyRoute.body);

    expect(await storedRow(world.companyA)).toEqual(before);
    expect(await storedKey(world.companyA)).toBe(keyBefore);
  });

  it('AC-023: an admin of company B cannot read or change company A settings or key through the route or the RPC', async () => {
    const before = await storedRow(world.companyA);
    const keyBefore = await storedKey(world.companyA);

    // The route always uses the caller's own company (B), never A.
    const readB = await getSettings(world.adminB);
    expect(settingsOf(readB).configured).toBe(false);
    expectNoCanary(readB.body);

    // A trusted call naming B's admin as the actor for company A is refused by the database.
    const crossActor = await saveDirect(world.adminB, world.companyA, before.revision as number, canary('cross'));
    expect(crossActor.error?.code).toBe('42501');
    expect(crossActor.error?.message).toBe('MEETING_NOTE_AI_SETTINGS_FORBIDDEN');
    const memberActor = await saveDirect(world.memberA, world.companyA, before.revision as number, canary('member-actor'));
    expect(memberActor.error?.message).toBe('MEETING_NOTE_AI_SETTINGS_FORBIDDEN');

    expect(await storedRow(world.companyA)).toEqual(before);
    expect(await storedKey(world.companyA)).toBe(keyBefore);
  });

  it('concurrent first saves: exactly one creates the settings, the other is stale; keeping a missing key is refused; company deletion removes the key', async () => {
    const companyC = await world.createCompany('Company C');
    const adminC1 = await world.createUser('admin-c1', companyC, 'admin');
    const adminC2 = await world.createUser('admin-c2', companyC, 'admin');
    const [first, second] = await Promise.all([
      saveDirect(adminC1, companyC, null, canary('c1')),
      saveDirect(adminC2, companyC, null, canary('c2')),
    ]);
    const outcomes = [first, second].map((r) => r.error?.message ?? 'ok').sort();
    expect(outcomes).toEqual(['MEETING_NOTE_AI_SETTINGS_STALE_REVISION', 'ok']);
    expect(await secretCount(companyC)).toBe(1);
    const winnerKey = (first.error ? canaries.at(-1) : canaries.at(-2)) as string;
    expect(await storedKey(companyC)).toBe(winnerKey);

    // "Keep the current key" needs a stored key: with the secret gone, a save without a key is refused.
    const winner = first.error ? adminC2 : adminC1;
    await world.query(`delete from vault.secrets where name = 'meeting_notes_ai_key:' || $1::text`, [companyC]);
    const keepMissing = await saveDirect(winner, companyC, 1, null);
    expect(keepMissing.error?.message).toBe('MEETING_NOTE_AI_KEY_REQUIRED');
    expect(await storedRow(companyC)).toMatchObject({ revision: 1 });
    const restored = canary('c-restore');
    expect((await saveDirect(winner, companyC, 1, restored)).error).toBeNull();
    expect(await storedKey(companyC)).toBe(restored);

    // Deleting the company deletes its settings and its Vault secret.
    await world.query('delete from public.users where company_id = $1', [companyC]);
    await world.query('delete from public.companies where id = $1', [companyC]);
    expect(await storedRow(companyC)).toBeUndefined();
    expect(await secretCount(companyC)).toBe(0);
  });

  describe('an admin removed or demoted concurrently with their save', () => {
    const removalSql = 'select public.remove_company_member_and_presence($1, $2, $3) as result';
    const demotionSql = `select public.update_company_member_role($1, $2, $3, 'member'::public.user_role) as result`;

    for (const [label, sql] of [
      ['removal', removalSql],
      ['demotion', demotionSql],
    ] as const) {
      it(`${label} committed first: the save waits, then changes nothing`, async () => {
        const target = await world.createUser(`${label}-first`, world.companyA, 'admin');
        const before = await storedRow(world.companyA);
        const keyBefore = await storedKey(world.companyA);
        const actor = await serviceRoleSession();
        try {
          await actor.query('begin');
          const change = await actor.query<{ result: { ok: boolean } }>(sql, [world.adminA.appUserId, target.appUserId, world.companyA]);
          expect(change.rows[0].result.ok).toBe(true);
          const pendingSave = saveDirect(target, world.companyA, before.revision as number, canary(`${label}-first`), 99);
          await waitForLockWaiter('%save_meeting_note_ai_settings%');
          await actor.query('commit');
          const save = await pendingSave;
          expect(save.error?.code).toBe('42501');
          expect(save.error?.message).toBe('MEETING_NOTE_AI_SETTINGS_FORBIDDEN');
        } finally {
          await actor.end().catch(() => undefined);
        }
        expect(await storedRow(world.companyA)).toEqual(before);
        expect(await storedKey(world.companyA)).toBe(keyBefore);
      });

      it(`save committed first: the ${label} waits for it and both complete without a deadlock`, async () => {
        const target = await world.createUser(`${label}-second`, world.companyA, 'admin');
        const before = await storedRow(world.companyA);
        const key = canary(`${label}-second`);
        const saver = await serviceRoleSession();
        const remover = await serviceRoleSession();
        try {
          await saver.query('begin');
          await saver.query('set local role service_role');
          await saver.query(
            `select public.save_meeting_note_ai_settings($1, $2, $3, 'glm', 'glm-5.3', 'low', 42, $4)`,
            [target.appUserId, world.companyA, before.revision, key],
          );
          const pendingChange = remover.query<{ result: { ok: boolean } }>(sql, [world.adminA.appUserId, target.appUserId, world.companyA]);
          await waitForLockWaiter(label === 'removal' ? '%remove_company_member_and_presence%' : '%update_company_member_role%');
          await saver.query('commit');
          expect((await pendingChange).rows[0].result.ok).toBe(true);
        } finally {
          await saver.end().catch(() => undefined);
          await remover.end().catch(() => undefined);
        }
        expect(await storedRow(world.companyA)).toMatchObject({
          provider: 'glm',
          model: 'glm-5.3',
          daily_limit: 42,
          revision: (before.revision as number) + 1,
          updated_by_user_id: target.appUserId,
        });
        expect(await storedKey(world.companyA)).toBe(key);
        // The removed/demoted admin can no longer save.
        const after = await saveDirect(target, world.companyA, (before.revision as number) + 1, canary(`${label}-after`));
        expect(after.error?.message).toBe('MEETING_NOTE_AI_SETTINGS_FORBIDDEN');
      });
    }
  });

  it('AC-017: a member subscribed to every published table receives no payload carrying the canary while settings are saved', async () => {
    const tables = await world.query<{ schemaname: string; tablename: string }>(
      `select schemaname, tablename from pg_catalog.pg_publication_tables where pubname = 'supabase_realtime' order by 1, 2`,
    );
    expect(tables.length).toBeGreaterThan(0);
    const payloads: string[] = [];
    let channel: RealtimeChannel | null = null;
    try {
      // Wait for the server's "Subscribed to PostgreSQL" confirmation: the
      // bindings are live only after it.
      await new Promise<void>((resolve, reject) => {
        let builder = world.memberA.client.channel(`t8-ai-canary-${world.ns}`);
        for (const { schemaname, tablename } of tables) {
          builder = builder.on('postgres_changes', { event: '*', schema: schemaname, table: tablename }, (payload) => {
            payloads.push(JSON.stringify(payload));
          });
        }
        builder = builder.on('system', {}, (payload: { extension?: string; status?: string }) => {
          if (payload.extension === 'postgres_changes') {
            if (payload.status === 'ok') resolve();
            else reject(new Error(`postgres_changes subscription failed: ${JSON.stringify(payload)}`));
          }
        });
        channel = builder.subscribe((status, err) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(err ?? new Error(status));
        });
      });
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Positive control: a change the member may see on a published table arrives.
      const marker = `MN DB realtime marker ${world.ns}`;
      await world.query('update public.spaces set name = $1 where id = $2', [marker, world.spaceA]);
      const deadline = Date.now() + 15_000;
      while (!payloads.some((p) => p.includes(marker)) && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(payloads.some((p) => p.includes(marker))).toBe(true);

      const before = await storedRow(world.companyA);
      const key = canary('realtime');
      const saved = await putSettings(world.adminA, validBody({ expectedRevision: before.revision, apiKey: key, dailyLimit: 70 }));
      expect(saved.status, JSON.stringify(saved.body)).toBe(200);
      expect(await storedKey(world.companyA)).toBe(key);
      // Second control after the save: anything the save published would have arrived before it.
      const marker2 = `${marker} after`;
      await world.query('update public.spaces set name = $1 where id = $2', [marker2, world.spaceA]);
      const deadline2 = Date.now() + 15_000;
      while (!payloads.some((p) => p.includes(marker2)) && Date.now() < deadline2) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(payloads.some((p) => p.includes(marker2))).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      for (const payload of payloads) expectNoCanary(payload);
    } finally {
      if (channel) await (channel as RealtimeChannel).unsubscribe();
    }
  });

  it('AC-017: no captured server log line contains a canary key', () => {
    expect(canaries.length).toBeGreaterThan(5);
    // The routes ran (and logged their refusals) in this file.
    expect(logLines.some((line) => line.includes('/api/companies/ai-settings') || line.includes('aiSettings'))).toBe(true);
    for (const line of logLines) expectNoCanary(line);
  });
});
