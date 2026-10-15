// Phase 6 T9 (FR-022, FR-023, FR-031, BR-008, BR-013; AC-016, AC-025, AC-028,
// AC-034 DB side): AI usage accounting, admission, settlement, replay,
// maintenance jobs, and signed processing tickets, against the real local
// Supabase stack. The admission/settlement RPCs run through the server
// repository on the service-role PostgREST client (as server code will), the
// ticket route runs in-process with real local sessions, and RLS, grants,
// Vault, the settings save, member removal, and the jobs are real. No provider
// exists yet (T11/T12); transcripts are set with trusted SQL (T10 owns
// upload). Canary keys only; the ticket secrets are random per run.
import { randomBytes, randomUUID } from 'node:crypto';

import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as postTicket } from '@/app/api/meeting-notes/[id]/ai/ticket/route';
import { MeetingNoteDbError } from '@/lib/meeting-notes/errors';
import {
  MeetingNoteAiTicketConfigError,
  meetingNoteAiTicketIssuedAt,
  verifyMeetingNoteAiTicket,
  type MeetingNoteAiTicketPayload,
} from '@/lib/meeting-notes/ai/ticket';
import { SupabaseMeetingNoteAiOperationRepository } from '@/repositories/implementations/supabase/SupabaseMeetingNoteAiOperationRepository';
import type {
  AdmitMeetingNoteAiOperationParams,
  MeetingNoteAiAdmission,
  MeetingNoteAiReplay,
} from '@/repositories/interfaces/IMeetingNoteAiOperationRepository';

import { createMeetingNotesWorld, type MeetingNotesDbUser, type MeetingNotesDbWorld } from './fixtures';
import { callRoute, signInSessionCookies, useLocalSupabaseEnv, type RouteResult, type SessionCookie } from './route-session';
import { MEETING_NOTES_DB_URL } from './setup';

vi.mock('next/headers', async () => (await import('./route-session')).nextHeadersMock);

const SERVICE_RPCS = [
  'public.admit_meeting_note_ai_operation(uuid,uuid,uuid,uuid,timestamp with time zone,bigint,uuid,bigint)',
  'public.mark_meeting_note_ai_operation_dispatched(uuid)',
  'public.settle_meeting_note_ai_operation(uuid,text)',
  'public.finalize_meeting_note_ai_success(uuid,uuid)',
  'public.fail_stale_meeting_note_ai_operations()',
  'public.purge_meeting_note_ai_operations()',
];
const AUTHENTICATED_RPCS = ['public.get_meeting_note_ai_usage()'];
const PRIVATE_HELPERS = [
  'private.meeting_note_lock_actor(uuid)',
  'private.meeting_note_lock_note_for_actor(uuid,text,uuid,uuid,boolean)',
  'private.meeting_note_lock_for_change(uuid,text)',
  'private.meeting_note_ai_usage_day(timestamp with time zone)',
  'private.meeting_note_ai_reset_at(date)',
  'private.meeting_note_ai_used_count(uuid,date)',
];
const OPERATION_COLUMNS = [
  'admission_day',
  'admitted_at',
  'company_id',
  'dispatched_at',
  'id',
  'idempotency_key',
  'kind',
  'model',
  'note_id',
  'provider',
  'reasoning_level',
  'settings_revision',
  'settled_at',
  'source_revision',
  'status',
  'ticket_issued_at',
  'transcript_id',
  'user_id',
];

interface NoteSource {
  noteId: string;
  revision: number;
  transcriptId: string;
}

interface Refusal {
  sqlstate: string | undefined;
  token: string | null;
  detail: Record<string, unknown> | null;
}

describe('meeting-note AI usage, admission, and tickets (local Supabase)', () => {
  let world: MeetingNotesDbWorld;
  let ops: SupabaseMeetingNoteAiOperationRepository;
  let note: NoteSource;
  let keyA: string;
  const sessions = new Map<string, SessionCookie[]>();
  const secret = randomBytes(48).toString('base64url');

  const canary = (label: string): string =>
    `mn-canary-t9-${label}-${world.ns}-${Math.random().toString(36).slice(2, 10)}-Z9q`;

  const as = (user: MeetingNotesDbUser): SessionCookie[] => {
    const cookies = sessions.get(user.appUserId);
    if (!cookies) throw new Error(`no session for ${user.displayName}`);
    return cookies;
  };

  const issueTicket = (user: MeetingNotesDbUser, noteId: string): Promise<RouteResult> =>
    callRoute(as(user), postTicket, {
      method: 'POST',
      path: `/api/meeting-notes/${noteId}/ai/ticket`,
      params: { id: noteId },
    });

  const settingsOf = async (companyId: string) =>
    (
      await world.query<{ revision: number; provider: string; model: string; reasoning_level: string; daily_limit: number }>(
        `select revision::int as revision, provider, model, reasoning_level, daily_limit
         from public.meeting_note_ai_settings where company_id = $1`,
        [companyId],
      )
    )[0];

  const saveSettings = async (
    actor: MeetingNotesDbUser,
    companyId: string,
    input: { provider: string; model: string; reasoning: string; limit: number; key: string | null },
  ) => {
    const current = await settingsOf(companyId);
    const { data, error } = await world.service.rpc('save_meeting_note_ai_settings', {
      p_actor_user_id: actor.appUserId,
      p_company_id: companyId,
      p_expected_revision: current?.revision ?? null,
      p_provider: input.provider,
      p_model: input.model,
      p_reasoning_level: input.reasoning,
      p_daily_limit: input.limit,
      p_api_key: input.key,
    });
    if (error) throw new Error(`settings save failed: ${error.code} ${error.message}`);
    return data as { revision: number };
  };

  /** A note of `companyId` with a stored transcript (trusted SQL; T10 owns upload). */
  const noteWithTranscript = async (
    companyId: string,
    roomId: string | null,
    author: MeetingNotesDbUser,
    participants: MeetingNotesDbUser[] = [],
  ): Promise<NoteSource> => {
    const seeded = await world.seedNote({ companyId, roomId, author, participants });
    return attachTranscript(seeded.noteId, `Ana: we ship on Friday ${randomUUID()}`);
  };

  const attachTranscript = async (noteId: string, text: string): Promise<NoteSource> => {
    const [row] = await world.query<{ revision: number; transcript_id: string }>(
      `update public.meeting_notes
       set transcript = $2, transcript_id = gen_random_uuid(), revision = revision + 1
       where id = $1
       returning revision::int as revision, transcript_id::text as transcript_id`,
      [noteId, text],
    );
    return { noteId, revision: row.revision, transcriptId: row.transcript_id };
  };

  const params = async (
    actor: MeetingNotesDbUser,
    source: NoteSource,
    overrides: Partial<AdmitMeetingNoteAiOperationParams> = {},
  ): Promise<AdmitMeetingNoteAiOperationParams> => {
    const companyId = overrides.companyId ?? world.companyA;
    const settings = await settingsOf(companyId);
    return {
      actorUserId: actor.appUserId,
      companyId,
      noteId: source.noteId,
      idempotencyKey: randomUUID(),
      ticketIssuedAt: new Date().toISOString(),
      sourceRevision: source.revision,
      transcriptId: source.transcriptId,
      settingsRevision: settings?.revision ?? 1,
      ...overrides,
    };
  };

  const admitNew = async (input: AdmitMeetingNoteAiOperationParams): Promise<MeetingNoteAiAdmission> => {
    const result = await ops.admit(input);
    if (result.replay) throw new Error('expected a new admission');
    return result;
  };

  const refusal = async (promise: Promise<unknown>): Promise<Refusal> => {
    try {
      await promise;
    } catch (error) {
      if (error instanceof MeetingNoteDbError) {
        return { sqlstate: error.sqlstate, token: error.token, detail: error.detail };
      }
      throw error;
    }
    throw new Error('expected a refusal');
  };

  const usedToday = async (companyId: string): Promise<number> =>
    (
      await world.query<{ n: number }>(
        `select private.meeting_note_ai_used_count($1, private.meeting_note_ai_usage_day(now())) as n`,
        [companyId],
      )
    )[0].n;

  const usedOn = async (companyId: string, day: string): Promise<number> =>
    (await world.query<{ n: number }>(`select private.meeting_note_ai_used_count($1, $2::date) as n`, [companyId, day]))[0].n;

  const operationCount = async (companyId: string): Promise<number> =>
    Number(
      (
        await world.query<{ n: string }>(
          `select count(*)::text as n from public.meeting_note_ai_operations where company_id = $1`,
          [companyId],
        )
      )[0].n,
    );

  const operation = async (id: string) =>
    (
      await world.query<Record<string, unknown>>(
        `select status, admission_day::text as admission_day, provider, model, reasoning_level,
                settings_revision::int as settings_revision, dispatched_at, settled_at
         from public.meeting_note_ai_operations where id = $1`,
        [id],
      )
    )[0];

  /** `count` counted (succeeded) operations of `companyId` on `day` (trusted SQL). */
  const seedUsage = async (companyId: string, count: number, day: 'today' | 'yesterday'): Promise<void> => {
    await world.query(
      `insert into public.meeting_note_ai_operations
         (idempotency_key, company_id, user_id, note_id, source_revision, transcript_id, settings_revision,
          ticket_issued_at, provider, model, reasoning_level, admission_day, status, admitted_at,
          dispatched_at, settled_at)
       select gen_random_uuid(), $1, gen_random_uuid(), gen_random_uuid(), 1, gen_random_uuid(), 1,
              now() - $3::interval, 'openai', 'gpt-6.1-sol', 'high',
              private.meeting_note_ai_usage_day(now() - $3::interval), 'succeeded',
              now() - $3::interval, now() - $3::interval, now() - $3::interval
       from generate_series(1, $2::int)`,
      [companyId, count, day === 'today' ? '0 seconds' : '1 day'],
    );
  };

  const waitForLockWaiters = async (pattern: string, count: number): Promise<void> => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const [row] = await world.query<{ waiting: string }>(
        `select count(*)::text as waiting from pg_catalog.pg_stat_activity
         where wait_event_type = 'Lock' and query ilike $1 and pid <> pg_catalog.pg_backend_pid()`,
        [pattern],
      );
      if (Number(row.waiting) >= count) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`Fewer than ${count} sessions matching ${pattern} blocked on a lock.`);
  };

  const waitForLockWaiter = (pattern: string): Promise<void> => waitForLockWaiters(pattern, 1);

  const serviceRoleSession = async (): Promise<Client> => {
    const client = new Client({ connectionString: MEETING_NOTES_DB_URL });
    await client.connect();
    await client.query(`select pg_catalog.set_config('request.jwt.claims', '{"role":"service_role"}', false)`);
    return client;
  };

  /** Re-encodes a ticket's payload with one field changed, keeping the original MAC. */
  const tamper = (ticket: string, change: Partial<Record<keyof MeetingNoteAiTicketPayload, unknown>>): string => {
    const [prefix, payload, mac] = ticket.split('.');
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
    const changed = Buffer.from(JSON.stringify({ ...decoded, ...change }), 'utf8').toString('base64url');
    return `${prefix}.${changed}.${mac}`;
  };

  beforeAll(async () => {
    useLocalSupabaseEnv();
    vi.stubEnv('MEETING_NOTES_TICKET_SECRET', secret);
    vi.stubEnv('MEETING_NOTES_TICKET_SECRET_PREVIOUS', '');
    world = await createMeetingNotesWorld();
    ops = new SupabaseMeetingNoteAiOperationRepository(world.service);
    for (const user of [world.adminA, world.authorA, world.participantA, world.memberA, world.adminB, world.memberB]) {
      sessions.set(user.appUserId, await signInSessionCookies(user.email));
    }
    keyA = canary('a');
    await saveSettings(world.adminA, world.companyA, {
      provider: 'openai',
      model: 'gpt-6.1-sol',
      reasoning: 'high',
      limit: 20,
      key: keyA,
    });
    note = await noteWithTranscript(world.companyA, world.spaceA, world.authorA, [world.participantA]);
  });

  beforeEach(async () => {
    await world.query('delete from public.meeting_note_ai_operations where company_id = any($1::uuid[])', [
      [world.companyA, world.companyB],
    ]);
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await world?.cleanup();
  });

  it('catalog: content-free operations table, no client access, service_role-only RPCs, member usage read, cron jobs', async () => {
    const [table] = await world.query<Record<string, boolean>>(
      `select c.relrowsecurity as rls,
              has_table_privilege('anon', c.oid, 'select,insert,update,delete,truncate') as anon_any,
              has_table_privilege('authenticated', c.oid, 'select') as auth_select,
              has_table_privilege('authenticated', c.oid, 'insert,update,delete,truncate,references,trigger') as auth_write,
              has_table_privilege('service_role', c.oid, 'select') as service_select,
              has_table_privilege('service_role', c.oid, 'insert,update,delete,truncate') as service_write
       from pg_catalog.pg_class as c where c.oid = 'public.meeting_note_ai_operations'::regclass`,
    );
    expect(table).toEqual({
      rls: true,
      anon_any: false,
      auth_select: false,
      auth_write: false,
      service_select: true,
      service_write: false,
    });
    const columns = await world.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'meeting_note_ai_operations' order by column_name`,
    );
    expect(columns.map((c) => c.column_name)).toEqual(OPERATION_COLUMNS);
    // No foreign key to notes or users: deleting either never touches usage.
    const fks = await world.query<{ target: string }>(
      `select confrelid::regclass::text as target from pg_catalog.pg_constraint
       where conrelid = 'public.meeting_note_ai_operations'::regclass and contype = 'f'`,
    );
    expect(fks.map((fk) => fk.target)).toEqual(['companies']);
    const published = await world.query(
      `select 1 from pg_catalog.pg_publication_tables where schemaname = 'public' and tablename = 'meeting_note_ai_operations'`,
    );
    expect(published).toEqual([]);

    const fns = await world.query<{
      fn: string;
      owner: string;
      config: string[] | null;
      anon: boolean;
      authenticated: boolean;
      service_role: boolean;
      public_grant: boolean;
      expect_service: boolean;
      expect_authenticated: boolean;
    }>(
      `select p.oid::regprocedure::text as fn,
              pg_catalog.pg_get_userbyid(p.proowner) as owner,
              p.proconfig as config,
              pg_catalog.has_function_privilege('anon', p.oid, 'execute') as anon,
              pg_catalog.has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
              pg_catalog.has_function_privilege('service_role', p.oid, 'execute') as service_role,
              exists (select 1 from pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) as a
                      where a.grantee = 0) as public_grant,
              p.oid = any ($2::regprocedure[]) as expect_service,
              p.oid = any ($3::regprocedure[]) as expect_authenticated
       from pg_catalog.pg_proc as p
       where p.oid = any ($1::regprocedure[])`,
      [[...SERVICE_RPCS, ...AUTHENTICATED_RPCS, ...PRIVATE_HELPERS], SERVICE_RPCS, AUTHENTICATED_RPCS],
    );
    expect(fns).toHaveLength(SERVICE_RPCS.length + AUTHENTICATED_RPCS.length + PRIVATE_HELPERS.length);
    for (const fn of fns) {
      expect(fn.owner, fn.fn).toBe('postgres');
      expect(fn.config, fn.fn).toEqual(['search_path=""']);
      expect(fn.public_grant, fn.fn).toBe(false);
      expect(fn.anon, fn.fn).toBe(false);
      expect(fn.authenticated, fn.fn).toBe(fn.expect_authenticated);
      expect(fn.service_role, fn.fn).toBe(fn.expect_service);
    }

    const jobs = await world.query<{ jobname: string; schedule: string; command: string; username: string; active: boolean }>(
      `select jobname, schedule, command, username, active from cron.job
       where jobname like 'meeting-notes-ai-%' order by jobname`,
    );
    expect(jobs).toEqual([
      {
        jobname: 'meeting-notes-ai-fail-stale-v1',
        schedule: '* * * * *',
        command: 'select public.fail_stale_meeting_note_ai_operations();',
        username: 'postgres',
        active: true,
      },
      {
        jobname: 'meeting-notes-ai-purge-operations-v1',
        schedule: '40 3 * * *',
        command: 'select public.purge_meeting_note_ai_operations();',
        username: 'postgres',
        active: true,
      },
    ]);
  });

  it('AC-028: anon and authenticated cannot call admission, settlement, or the jobs, nor touch the operations table', async () => {
    const op = await admitNew(await params(world.authorA, note));
    const calls: [string, Record<string, unknown>][] = [
      [
        'admit_meeting_note_ai_operation',
        {
          p_actor_user_id: world.adminA.appUserId,
          p_company_id: world.companyA,
          p_note_id: note.noteId,
          p_idempotency_key: randomUUID(),
          p_ticket_issued_at: new Date().toISOString(),
          p_source_revision: note.revision,
          p_transcript_id: note.transcriptId,
          p_settings_revision: (await settingsOf(world.companyA)).revision,
        },
      ],
      ['mark_meeting_note_ai_operation_dispatched', { p_operation_id: op.operationId }],
      ['settle_meeting_note_ai_operation', { p_operation_id: op.operationId, p_outcome: 'released' }],
      ['fail_stale_meeting_note_ai_operations', {}],
      ['purge_meeting_note_ai_operations', {}],
    ];
    for (const client of [world.anon, world.adminA.client, world.memberA.client]) {
      for (const [fn, args] of calls) {
        const { data, error } = await client.rpc(fn, args);
        expect(data, fn).toBeNull();
        expect(error?.code, fn).toBe('42501');
      }
      const select = await client.from('meeting_note_ai_operations').select('*');
      expect(select.error?.code).toBe('42501');
      const update = await client.from('meeting_note_ai_operations').update({ status: 'refunded' }).eq('id', op.operationId);
      expect(update.error?.code).toBe('42501');
      const del = await client.from('meeting_note_ai_operations').delete().eq('id', op.operationId);
      expect(del.error?.code).toBe('42501');
      const insert = await client.from('meeting_note_ai_operations').insert({
        idempotency_key: randomUUID(),
        company_id: world.companyA,
        user_id: world.adminA.appUserId,
        note_id: note.noteId,
        source_revision: 1,
        transcript_id: randomUUID(),
        settings_revision: 1,
        ticket_issued_at: new Date().toISOString(),
        provider: 'openai',
        model: 'x',
        reasoning_level: 'high',
        admission_day: '2026-01-01',
        status: 'released',
      });
      expect(insert.error?.code).toBe('42501');
    }
    // service_role reads but cannot write directly either.
    const serviceUpdate = await world.service.from('meeting_note_ai_operations').update({ status: 'refunded' }).eq('id', op.operationId);
    expect(serviceUpdate.error?.code).toBe('42501');
    const anonUsage = await world.anon.rpc('get_meeting_note_ai_usage');
    expect(anonUsage.error?.code).toBe('42501');
    expect((await operation(op.operationId)).status).toBe('admitted');
    expect(await usedToday(world.companyA)).toBe(1);
  });

  it('a new admission returns one consistent snapshot, the key, and the bound transcript; the record holds no content', async () => {
    const input = await params(world.participantA, note);
    const admitted = await admitNew(input);
    const settings = await settingsOf(world.companyA);
    const [stored] = await world.query<{ transcript: string }>('select transcript from public.meeting_notes where id = $1', [note.noteId]);
    expect(admitted).toMatchObject({
      replay: false,
      status: 'admitted',
      provider: settings.provider,
      model: settings.model,
      reasoningLevel: settings.reasoning_level,
      settingsRevision: settings.revision,
      sourceRevision: note.revision,
      transcriptId: note.transcriptId,
      apiKey: keyA,
      transcript: stored.transcript,
      usage: { limit: 20, used: 1 },
    });
    expect(await operation(admitted.operationId)).toMatchObject({
      status: 'admitted',
      provider: settings.provider,
      model: settings.model,
      reasoning_level: settings.reasoning_level,
      settings_revision: settings.revision,
      dispatched_at: null,
      settled_at: null,
    });
    const [raw] = await world.query<{ row: string }>(
      'select row_to_json(o)::text as row from public.meeting_note_ai_operations as o where id = $1',
      [admitted.operationId],
    );
    expect(raw.row).not.toContain(keyA);
    expect(raw.row).not.toContain(stored.transcript);
    // An admin who is neither author nor participant is an editor too.
    expect((await admitNew(await params(world.adminA, note))).usage.used).toBe(2);
  });

  it('AC-028: five concurrent admissions on five different notes by five editors at 19/20 → exactly one reserved, four refused with the limit', async () => {
    // Distinct notes and actors, so no note or actor lock serializes them:
    // only the company-level settings lock can keep the count at 20.
    const fifth = await world.createUser('t9-race-fifth', world.companyA, 'member');
    const editors = [world.authorA, world.participantA, world.adminA, world.memberA, fifth];
    const inputs: AdmitMeetingNoteAiOperationParams[] = [];
    for (const editor of editors) {
      // Each editor authors their own note (an author is an editor).
      inputs.push(await params(editor, await noteWithTranscript(world.companyA, world.spaceA, editor)));
    }
    expect(new Set(inputs.map((input) => input.noteId)).size).toBe(5);
    expect(new Set(inputs.map((input) => input.actorUserId)).size).toBe(5);
    await seedUsage(world.companyA, 19, 'today');

    // Forced overlap: hold the company's settings row, start all five
    // admissions, wait until all five are blocked behind it, then release.
    const holder = await serviceRoleSession();
    let results: PromiseSettledResult<unknown>[];
    try {
      await holder.query('begin');
      await holder.query('select 1 from public.meeting_note_ai_settings where company_id = $1 for update', [world.companyA]);
      const pending = Promise.allSettled(inputs.map((input) => ops.admit(input)));
      await waitForLockWaiters('%admit_meeting_note_ai_operation%', 5);
      await holder.query('commit');
      results = await pending;
    } finally {
      await holder.end().catch(() => undefined);
    }
    const admitted = results.filter((r) => r.status === 'fulfilled');
    const refused = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(admitted).toHaveLength(1);
    expect(refused).toHaveLength(4);
    for (const r of refused) {
      expect(r.reason).toBeInstanceOf(MeetingNoteDbError);
      expect((r.reason as MeetingNoteDbError).token).toBe('MEETING_NOTE_AI_LIMIT_REACHED');
      expect((r.reason as MeetingNoteDbError).detail).toMatchObject({ limit: 20, used: 20 });
    }
    expect(await usedToday(world.companyA)).toBe(20);
    expect(await operationCount(world.companyA)).toBe(20);
  });

  it('AC-016 / FR-023: limit-reached data names the limit and the next 00:00 America/Sao_Paulo; yesterday does not count', async () => {
    await seedUsage(world.companyA, 20, 'yesterday');
    // A new day: yesterday's 20 do not count.
    const first = await admitNew(await params(world.authorA, note));
    expect(first.usage.used).toBe(1);
    await seedUsage(world.companyA, 19, 'today');
    const refused = await refusal(ops.admit(await params(world.authorA, note)));
    expect(refused).toMatchObject({ sqlstate: 'P0001', token: 'MEETING_NOTE_AI_LIMIT_REACHED' });
    expect(refused.detail).toMatchObject({ limit: 20, used: 20 });

    const now = Date.now();
    const resetAt = new Date(String(refused.detail?.reset_at));
    const spTime = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).format(resetAt);
    expect(spTime).toBe('00:00:00');
    expect(resetAt.getTime()).toBeGreaterThan(now);
    expect(resetAt.getTime() - now).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
    const spToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(now));
    expect(refused.detail?.usage_day).toBe(spToday);
    expect(first.usage.usageDay).toBe(spToday);
    expect(first.usage.resetAt).toBe(resetAt.toISOString());

    // The member-facing read shows the same count, own company only.
    const usage = await world.memberA.client.rpc('get_meeting_note_ai_usage');
    expect(usage.error).toBeNull();
    expect(usage.data).toMatchObject({ configured: true, daily_limit: 20, used: 20, usage_day: spToday });
    const other = await world.memberB.client.rpc('get_meeting_note_ai_usage');
    expect(other.data).toMatchObject({ configured: false, daily_limit: 20, used: 0 });
  });

  it('FR-031: the same key and binding returns the existing operation without a new reservation — also across midnight and after settings/source changes', async () => {
    const input = await params(world.authorA, note);
    const admitted = await admitNew(input);
    await ops.markDispatched(admitted.operationId);
    const replay = (await ops.admit(input)) as MeetingNoteAiReplay;
    expect(replay).toEqual({
      replay: true,
      operationId: admitted.operationId,
      status: 'dispatched',
      admissionDay: admitted.admissionDay,
      provider: admitted.provider,
      model: admitted.model,
      reasoningLevel: admitted.reasoningLevel,
      settingsRevision: admitted.settingsRevision,
    });
    expect(replay).not.toHaveProperty('apiKey');
    expect(replay).not.toHaveProperty('transcript');
    expect(await usedToday(world.companyA)).toBe(1);

    // The admission happened "yesterday" (São Paulo): the replay after midnight
    // still finds it, and today's usage is untouched.
    // (dispatched_at stays recent so the every-minute stale job leaves it alone.)
    await world.query(
      `update public.meeting_note_ai_operations
       set admission_day = admission_day - 1, admitted_at = admitted_at - interval '1 day'
       where id = $1`,
      [admitted.operationId],
    );
    const yesterday = (await operation(admitted.operationId)).admission_day as string;
    const acrossMidnight = (await ops.admit(input)) as MeetingNoteAiReplay;
    expect(acrossMidnight).toMatchObject({ replay: true, operationId: admitted.operationId, admissionDay: yesterday });
    expect(await usedToday(world.companyA)).toBe(0);
    expect(await usedOn(world.companyA, yesterday)).toBe(1);

    // Settlement after midnight counts against the admission day.
    const settled = await ops.settle(admitted.operationId, 'refunded');
    expect(settled).toMatchObject({ status: 'refunded', changed: true, counted: false, admissionDay: yesterday });
    expect(await usedOn(world.companyA, yesterday)).toBe(0);
    expect(await usedToday(world.companyA)).toBe(0);

    // Later settings and source changes do not affect a replay.
    const own = await noteWithTranscript(world.companyA, world.spaceA, world.authorA);
    const ownInput = await params(world.authorA, own);
    const ownOp = await admitNew(ownInput);
    await saveSettings(world.adminA, world.companyA, { provider: 'openai', model: 'gpt-6.1-sol', reasoning: 'low', limit: 20, key: null });
    await attachTranscript(own.noteId, 'Bruno: a new transcript');
    expect(await ops.admit(ownInput)).toMatchObject({
      replay: true,
      operationId: ownOp.operationId,
      status: 'admitted',
      reasoningLevel: 'high',
    });
    expect(await usedToday(world.companyA)).toBe(1);
    await saveSettings(world.adminA, world.companyA, { provider: 'openai', model: 'gpt-6.1-sol', reasoning: 'high', limit: 20, key: null });
  });

  it('FR-031: the same key with a different binding is rejected and reserves nothing', async () => {
    const input = await params(world.authorA, note);
    await admitNew(input);
    const other = await noteWithTranscript(world.companyA, world.spaceA, world.authorA);
    const variants: Partial<AdmitMeetingNoteAiOperationParams>[] = [
      { noteId: other.noteId, sourceRevision: other.revision, transcriptId: other.transcriptId },
      { transcriptId: randomUUID() },
      { sourceRevision: input.sourceRevision + 1 },
      { settingsRevision: input.settingsRevision + 1 },
      { ticketIssuedAt: new Date(Date.parse(input.ticketIssuedAt) - 1000).toISOString() },
      { actorUserId: world.adminA.appUserId },
    ];
    for (const change of variants) {
      const refused = await refusal(ops.admit({ ...input, ...change }));
      expect(refused, JSON.stringify(Object.keys(change))).toMatchObject({ sqlstate: 'P0001', token: 'MEETING_NOTE_AI_BINDING_MISMATCH' });
    }
    expect(await usedToday(world.companyA)).toBe(1);
    expect(await operationCount(world.companyA)).toBe(1);
  });

  it('FR-031 / AC-034: a ticket older than 24 h (or from the future) is expired before any lookup, with or without a record', async () => {
    const fresh = await params(world.authorA, note, { ticketIssuedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString() });
    const admitted = await admitNew(fresh);
    // The record still exists, but its ticket has aged past 24 h.
    const aged = new Date(Date.now() - 24 * 60 * 60 * 1000 - 5_000).toISOString();
    await world.query('update public.meeting_note_ai_operations set ticket_issued_at = $2 where id = $1', [admitted.operationId, aged]);
    expect(await refusal(ops.admit({ ...fresh, ticketIssuedAt: aged }))).toMatchObject({ token: 'MEETING_NOTE_AI_TICKET_EXPIRED' });
    // After the record is gone, too.
    await world.query('delete from public.meeting_note_ai_operations where id = $1', [admitted.operationId]);
    expect(await refusal(ops.admit({ ...fresh, ticketIssuedAt: aged }))).toMatchObject({ token: 'MEETING_NOTE_AI_TICKET_EXPIRED' });
    // A new key with an aged or future issue time.
    expect(await refusal(ops.admit(await params(world.authorA, note, { ticketIssuedAt: aged })))).toMatchObject({
      token: 'MEETING_NOTE_AI_TICKET_EXPIRED',
    });
    const future = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    expect(await refusal(ops.admit(await params(world.authorA, note, { ticketIssuedAt: future })))).toMatchObject({
      token: 'MEETING_NOTE_AI_TICKET_EXPIRED',
    });
    expect(await operationCount(world.companyA)).toBe(0);
  });

  it('admission and replay re-authorize: non-editors are forbidden, outsiders and removed members see not found', async () => {
    expect(await refusal(ops.admit(await params(world.memberA, note)))).toMatchObject({ sqlstate: '42501', token: 'MEETING_NOTE_FORBIDDEN' });
    // Another company's member, claiming company A or their own company.
    expect(await refusal(ops.admit(await params(world.memberB, note)))).toMatchObject({ sqlstate: 'P0002', token: 'MEETING_NOTE_NOT_FOUND' });
    expect(await refusal(ops.admit(await params(world.adminB, note, { companyId: world.companyB })))).toMatchObject({
      sqlstate: 'P0002',
      token: 'MEETING_NOTE_NOT_FOUND',
    });

    // A participant admitted an operation, then is removed: the replay is refused.
    const leaver = await world.createUser('t9-leaver', world.companyA, 'member');
    const source = await noteWithTranscript(world.companyA, world.spaceA, world.authorA, [leaver]);
    const input = await params(leaver, source);
    await admitNew(input);
    const remover = await serviceRoleSession();
    try {
      const removed = await remover.query<{ result: { ok: boolean } }>(
        'select public.remove_company_member_and_presence($1, $2, $3) as result',
        [world.adminA.appUserId, leaver.appUserId, world.companyA],
      );
      expect(removed.rows[0].result.ok).toBe(true);
    } finally {
      await remover.end();
    }
    expect(await refusal(ops.admit(input))).toMatchObject({ sqlstate: 'P0002', token: 'MEETING_NOTE_NOT_FOUND' });
    expect(await refusal(ops.admit({ ...input, idempotencyKey: randomUUID() }))).toMatchObject({ token: 'MEETING_NOTE_NOT_FOUND' });
    expect(await usedToday(world.companyA)).toBe(1);
  });

  it('a removal that commits first makes a waiting admission refuse with nothing reserved', async () => {
    const target = await world.createUser('t9-removed-first', world.companyA, 'member');
    const source = await noteWithTranscript(world.companyA, world.spaceA, world.authorA, [target]);
    const remover = await serviceRoleSession();
    try {
      await remover.query('begin');
      await remover.query('select public.remove_company_member_and_presence($1, $2, $3)', [
        world.adminA.appUserId,
        target.appUserId,
        world.companyA,
      ]);
      const pending = refusal(ops.admit(await params(target, source)));
      await waitForLockWaiter('%admit_meeting_note_ai_operation%');
      await remover.query('commit');
      expect(await pending).toMatchObject({ token: 'MEETING_NOTE_NOT_FOUND' });
    } finally {
      await remover.end().catch(() => undefined);
    }
    expect(await operationCount(world.companyA)).toBe(0);
  });

  it('NOT_CONFIGURED: a company without AI settings admits nothing', async () => {
    const companyC = await world.createCompany('T9 C');
    const adminC = await world.createUser('t9-admin-c', companyC, 'admin');
    const source = await noteWithTranscript(companyC, null, adminC);
    expect(await refusal(ops.admit(await params(adminC, source, { companyId: companyC, settingsRevision: 1 })))).toMatchObject({
      sqlstate: 'P0001',
      token: 'MEETING_NOTE_AI_NOT_CONFIGURED',
    });
    expect(await operationCount(companyC)).toBe(0);
  });

  it('SOURCE_STALE: a transcript replaced (or a note edited) after the ticket was issued is a conflict with nothing reserved', async () => {
    const source = await noteWithTranscript(world.companyA, world.spaceA, world.authorA);
    const input = await params(world.authorA, source);
    const replaced = await attachTranscript(source.noteId, 'Carla: replaced after the notice');
    const refused = await refusal(ops.admit(input));
    expect(refused).toMatchObject({ sqlstate: 'P0001', token: 'MEETING_NOTE_AI_SOURCE_STALE' });
    expect(refused.detail).toEqual({ current_revision: replaced.revision, transcript_id: replaced.transcriptId });

    // A note edit through the real RPC bumps the revision.
    const edit = await world.authorA.client.rpc('update_meeting_note', {
      p_note_id: source.noteId,
      p_expected_revision: replaced.revision,
      p_title: 'Edited after the notice',
      p_meeting_date: new Date().toISOString(),
      p_content: '<p>edited</p>',
      p_participant_ids: [],
    });
    expect(edit.error).toBeNull();
    expect(await refusal(ops.admit(await params(world.authorA, replaced)))).toMatchObject({ token: 'MEETING_NOTE_AI_SOURCE_STALE' });
    expect(await usedToday(world.companyA)).toBe(0);
  });

  describe('AC-025: a settings save racing an admission', () => {
    it('admission holds the settings lock first: it completes on the old snapshot, then the save lands', async () => {
      const before = await settingsOf(world.companyA);
      const newKey = canary('race-after');
      const admitter = await serviceRoleSession();
      let snapshot: { provider: string; model: string; reasoning_level: string; settings_revision: number; api_key: string; operation_id: string };
      try {
        await admitter.query('begin');
        await admitter.query('set local role service_role');
        const input = await params(world.authorA, note);
        const { rows } = await admitter.query<{ result: typeof snapshot }>(
          'select public.admit_meeting_note_ai_operation($1, $2, $3, $4, $5, $6, $7, $8) as result',
          [
            input.actorUserId,
            input.companyId,
            input.noteId,
            input.idempotencyKey,
            input.ticketIssuedAt,
            input.sourceRevision,
            input.transcriptId,
            input.settingsRevision,
          ],
        );
        snapshot = rows[0].result;
        const pendingSave = saveSettings(world.adminA, world.companyA, {
          provider: 'anthropic',
          model: 'claude-sonnet-5-5',
          reasoning: 'high',
          limit: 20,
          key: newKey,
        });
        await waitForLockWaiter('%save_meeting_note_ai_settings%');
        await admitter.query('commit');
        expect((await pendingSave).revision).toBe(before.revision + 1);
      } finally {
        await admitter.end().catch(() => undefined);
      }
      // The admitted operation carries the OLD snapshot, never a mix.
      expect(snapshot).toMatchObject({
        provider: before.provider,
        model: before.model,
        reasoning_level: before.reasoning_level,
        settings_revision: before.revision,
        api_key: keyA,
      });
      expect(await operation(snapshot.operation_id)).toMatchObject({
        provider: before.provider,
        model: before.model,
        settings_revision: before.revision,
      });
      // Restore for later tests.
      await saveSettings(world.adminA, world.companyA, { provider: 'openai', model: 'gpt-6.1-sol', reasoning: 'high', limit: 20, key: keyA });
    });

    it('the save holds the lock first: the waiting admission is refused as stale with the new provider, nothing reserved', async () => {
      const before = await settingsOf(world.companyA);
      const input = await params(world.authorA, note);
      const newKey = canary('race-before');
      const saver = await serviceRoleSession();
      try {
        await saver.query('begin');
        await saver.query('set local role service_role');
        await saver.query(
          `select public.save_meeting_note_ai_settings($1, $2, $3, 'glm', 'glm-5.3', 'low', 20, $4)`,
          [world.adminA.appUserId, world.companyA, before.revision, newKey],
        );
        const pending = refusal(ops.admit(input));
        await waitForLockWaiter('%admit_meeting_note_ai_operation%');
        await saver.query('commit');
        const refused = await pending;
        expect(refused).toMatchObject({ sqlstate: 'P0001', token: 'MEETING_NOTE_AI_SETTINGS_STALE' });
        expect(refused.detail).toEqual({
          current_revision: before.revision + 1,
          provider: 'glm',
          model: 'glm-5.3',
          reasoning_level: 'low',
        });
      } finally {
        await saver.end().catch(() => undefined);
      }
      expect(await operationCount(world.companyA)).toBe(0);
      // A ticket for the new revision is admitted on the new snapshot and key.
      const fresh = await admitNew(await params(world.authorA, note));
      expect(fresh).toMatchObject({ provider: 'glm', model: 'glm-5.3', reasoningLevel: 'low', apiKey: newKey });
      await saveSettings(world.adminA, world.companyA, { provider: 'openai', model: 'gpt-6.1-sol', reasoning: 'high', limit: 20, key: keyA });
    });
  });

  it('settlement: released (never sent) is not counted, and settlement happens once', async () => {
    const admitted = await admitNew(await params(world.authorA, note));
    expect(await usedToday(world.companyA)).toBe(1);
    expect(await ops.settle(admitted.operationId, 'released')).toMatchObject({ status: 'released', changed: true, counted: false });
    expect(await usedToday(world.companyA)).toBe(0);
    for (const outcome of ['released', 'succeeded', 'failed'] as const) {
      expect(await ops.settle(admitted.operationId, outcome)).toMatchObject({ status: 'released', changed: false, counted: false });
    }
    expect(await usedToday(world.companyA)).toBe(0);
    // A released operation can never be dispatched afterwards.
    expect(await refusal(ops.markDispatched(admitted.operationId))).toMatchObject({
      token: 'MEETING_NOTE_AI_OPERATION_INVALID_TRANSITION',
      detail: { status: 'released' },
    });
  });

  it('settlement: dispatched operations stay counted except listed pre-processing rejections; transitions are enforced', async () => {
    const outcomes = ['succeeded', 'failed', 'discarded', 'refunded'] as const;
    const ids: string[] = [];
    for (const outcome of outcomes) {
      const admitted = await admitNew(await params(world.authorA, note));
      // A counted outcome needs a recorded dispatch; release needs none.
      expect(await refusal(ops.settle(admitted.operationId, outcome))).toMatchObject({
        token: 'MEETING_NOTE_AI_OPERATION_INVALID_TRANSITION',
        detail: { status: 'admitted' },
      });
      expect(await ops.markDispatched(admitted.operationId)).toMatchObject({ status: 'dispatched', changed: true });
      expect(await ops.markDispatched(admitted.operationId)).toMatchObject({ status: 'dispatched', changed: false });
      expect(await refusal(ops.settle(admitted.operationId, 'released'))).toMatchObject({
        token: 'MEETING_NOTE_AI_OPERATION_INVALID_TRANSITION',
        detail: { status: 'dispatched' },
      });
      expect(await ops.settle(admitted.operationId, outcome)).toMatchObject({
        status: outcome,
        changed: true,
        counted: outcome !== 'refunded',
      });
      ids.push(admitted.operationId);
    }
    expect(await usedToday(world.companyA)).toBe(3);
    // Idempotent: a second settlement with any outcome changes nothing.
    for (const id of ids) {
      const again = await ops.settle(id, 'refunded');
      expect(again.changed).toBe(false);
    }
    expect(await usedToday(world.companyA)).toBe(3);
    expect(await refusal(ops.settle(ids[0], 'cancelled' as never))).toMatchObject({ sqlstate: '22023', token: 'MEETING_NOTE_AI_OUTCOME_INVALID' });
    expect(await refusal(ops.settle(randomUUID(), 'failed'))).toMatchObject({ sqlstate: 'P0002', token: 'MEETING_NOTE_AI_OPERATION_NOT_FOUND' });
  });

  it('AC-034: a discarded operation replays as "discarded" without a new admission', async () => {
    const input = await params(world.authorA, note);
    const admitted = await admitNew(input);
    await ops.markDispatched(admitted.operationId);
    await ops.settle(admitted.operationId, 'discarded');
    expect(await ops.admit(input)).toMatchObject({ replay: true, operationId: admitted.operationId, status: 'discarded' });
    expect(await usedToday(world.companyA)).toBe(1);
    expect(await operationCount(world.companyA)).toBe(1);
  });

  it('AC-034: the stale-operation job fails operations with no outcome 10 minutes after dispatch (or admission); they stay counted', async () => {
    const staleDispatched = await admitNew(await params(world.authorA, note));
    await ops.markDispatched(staleDispatched.operationId);
    const recentDispatched = await admitNew(await params(world.authorA, note));
    await ops.markDispatched(recentDispatched.operationId);
    const staleAdmitted = await admitNew(await params(world.authorA, note));
    const recentAdmitted = await admitNew(await params(world.authorA, note));
    await world.query(
      `update public.meeting_note_ai_operations set dispatched_at = now() - interval '11 minutes', admitted_at = now() - interval '11 minutes' where id = $1`,
      [staleDispatched.operationId],
    );
    await world.query(
      `update public.meeting_note_ai_operations set dispatched_at = now() - interval '9 minutes', admitted_at = now() - interval '12 minutes' where id = $1`,
      [recentDispatched.operationId],
    );
    await world.query(`update public.meeting_note_ai_operations set admitted_at = now() - interval '11 minutes' where id = $1`, [
      staleAdmitted.operationId,
    ]);

    // (The every-minute pg_cron run of the same job may get there first.)
    const { data, error } = await world.service.rpc('fail_stale_meeting_note_ai_operations');
    expect(error).toBeNull();
    expect(typeof data).toBe('number');
    expect((await operation(staleDispatched.operationId)).status).toBe('failed');
    expect((await operation(staleAdmitted.operationId)).status).toBe('failed');
    expect((await operation(recentDispatched.operationId)).status).toBe('dispatched');
    expect((await operation(recentAdmitted.operationId)).status).toBe('admitted');
    expect(await usedToday(world.companyA)).toBe(4);
    // A late outcome changes nothing; a failed operation is never dispatched.
    expect(await ops.settle(staleDispatched.operationId, 'refunded')).toMatchObject({ status: 'failed', changed: false, counted: true });
    expect(await refusal(ops.markDispatched(staleAdmitted.operationId))).toMatchObject({ token: 'MEETING_NOTE_AI_OPERATION_INVALID_TRANSITION' });
  });

  it('the cleanup job removes operation records older than 30 days and keeps newer ones', async () => {
    const old = await admitNew(await params(world.authorA, note));
    const recent = await admitNew(await params(world.authorA, note));
    await world.query(
      `update public.meeting_note_ai_operations set admitted_at = now() - interval '31 days', admission_day = admission_day - 31 where id = $1`,
      [old.operationId],
    );
    await world.query(
      `update public.meeting_note_ai_operations set admitted_at = now() - interval '29 days', admission_day = admission_day - 29 where id = $1`,
      [recent.operationId],
    );
    const { data, error } = await world.service.rpc('purge_meeting_note_ai_operations');
    expect(error).toBeNull();
    expect(data).toBeGreaterThanOrEqual(1);
    expect(await operation(old.operationId)).toBeUndefined();
    expect(await operation(recent.operationId)).toBeDefined();
  });

  it('AC-034: deleting the note or the requesting user leaves usage unchanged', async () => {
    const requester = await world.createUser('t9-deleted-user', world.companyA, 'member');
    const source = await noteWithTranscript(world.companyA, world.spaceA, requester);
    const admitted = await admitNew(await params(requester, source));
    await ops.markDispatched(admitted.operationId);
    await ops.settle(admitted.operationId, 'succeeded');
    const second = await admitNew(await params(world.authorA, note));
    expect(await usedToday(world.companyA)).toBe(2);

    const deleted = await requester.client.rpc('delete_meeting_note', { p_note_id: source.noteId, p_expected_revision: source.revision });
    expect(deleted.error).toBeNull();
    expect(await usedToday(world.companyA)).toBe(2);
    await world.query('delete from public.users where id = $1', [requester.appUserId]);
    expect(await usedToday(world.companyA)).toBe(2);
    expect((await operation(admitted.operationId)).status).toBe('succeeded');
    expect((await operation(second.operationId)).status).toBe('admitted');
  });

  describe('ticket-issue route POST /api/meeting-notes/[id]/ai/ticket', () => {
    it('an editor receives the notice data and a signed ticket with a server-generated key that admission accepts', async () => {
      const settings = await settingsOf(world.companyA);
      const first = await issueTicket(world.authorA, note.noteId);
      expect(first.status, JSON.stringify(first.body)).toBe(200);
      expect(first.body).toMatchObject({
        provider: settings.provider,
        model: settings.model,
        reasoningLevel: settings.reasoning_level,
        settingsRevision: settings.revision,
        noteRevision: note.revision,
        transcriptId: note.transcriptId,
        usage: { limit: 20, used: 0, limitReached: false },
      });
      expect(JSON.stringify(first.body)).not.toContain(keyA);
      const verified = verifyMeetingNoteAiTicket(first.body.ticket);
      if (!verified.ok) throw new Error(`ticket rejected: ${verified.reason}`);
      expect(verified.payload).toMatchObject({
        v: 1,
        userId: world.authorA.appUserId,
        companyId: world.companyA,
        noteId: note.noteId,
        sourceRevision: note.revision,
        transcriptId: note.transcriptId,
        settingsRevision: settings.revision,
      });
      expect(verified.payload.idempotencyKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(first.body.expiresAt).toBe(verified.expiresAt);
      expect(Date.parse(verified.expiresAt) - verified.payload.iat * 1000).toBe(24 * 60 * 60 * 1000);

      // Every issuance has its own key (a client cannot choose or reuse one).
      const second = await issueTicket(world.participantA, note.noteId);
      const admin = await issueTicket(world.adminA, note.noteId);
      expect(second.status).toBe(200);
      expect(admin.status).toBe(200);
      const keys = [first, second, admin].map((r) => {
        const v = verifyMeetingNoteAiTicket(r.body.ticket);
        if (!v.ok) throw new Error(v.reason);
        return v.payload.idempotencyKey;
      });
      expect(new Set(keys).size).toBe(3);

      // The ticket's binding is what admission takes.
      const p = verified.payload;
      const admitted = await admitNew({
        actorUserId: p.userId,
        companyId: p.companyId,
        noteId: p.noteId,
        idempotencyKey: p.idempotencyKey,
        ticketIssuedAt: meetingNoteAiTicketIssuedAt(p),
        sourceRevision: p.sourceRevision,
        transcriptId: p.transcriptId,
        settingsRevision: p.settingsRevision,
      });
      expect(admitted.apiKey).toBe(keyA);
      const after = await issueTicket(world.authorA, note.noteId);
      expect(after.body.usage).toMatchObject({ used: 1, limit: 20 });
    });

    it('denies a non-editor (403), another company (404), and a removed member (404); requires a transcript', async () => {
      const nonEditor = await issueTicket(world.memberA, note.noteId);
      expect(nonEditor.status).toBe(403);
      expect(nonEditor.body.code).toBe('MEETING_NOTE_FORBIDDEN');
      expect(nonEditor.body).not.toHaveProperty('ticket');
      for (const outsider of [world.memberB, world.adminB]) {
        const res = await issueTicket(outsider, note.noteId);
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('MEETING_NOTE_NOT_FOUND');
      }
      expect((await issueTicket(world.authorA, randomUUID())).status).toBe(404);
      expect((await issueTicket(world.authorA, 'not-a-uuid')).status).toBe(404);

      const leaver = await world.createUser('t9-route-leaver', world.companyA, 'member');
      sessions.set(leaver.appUserId, await signInSessionCookies(leaver.email));
      const source = await noteWithTranscript(world.companyA, world.spaceA, world.authorA, [leaver]);
      expect((await issueTicket(leaver, source.noteId)).status).toBe(200);
      const remover = await serviceRoleSession();
      try {
        await remover.query('select public.remove_company_member_and_presence($1, $2, $3)', [
          world.adminA.appUserId,
          leaver.appUserId,
          world.companyA,
        ]);
      } finally {
        await remover.end();
      }
      const removed = await issueTicket(leaver, source.noteId);
      expect(removed.status).toBe(404);
      expect(removed.body).not.toHaveProperty('ticket');

      const bare = await world.seedNote({ companyId: world.companyA, roomId: world.spaceA, author: world.authorA });
      const noTranscript = await issueTicket(world.authorA, bare.noteId);
      expect(noTranscript.status).toBe(409);
      expect(noTranscript.body.code).toBe('MEETING_NOTE_AI_TRANSCRIPT_REQUIRED');
    });

    it('refuses with NOT_CONFIGURED (admin hint for admins only) when the company has no AI settings', async () => {
      const companyC = await world.createCompany('T9 route C');
      const adminC = await world.createUser('t9-route-admin-c', companyC, 'admin');
      const memberC = await world.createUser('t9-route-member-c', companyC, 'member');
      for (const user of [adminC, memberC]) sessions.set(user.appUserId, await signInSessionCookies(user.email));
      const source = await noteWithTranscript(companyC, null, memberC);
      const forMember = await issueTicket(memberC, source.noteId);
      expect(forMember.status).toBe(409);
      expect(forMember.body).toMatchObject({ code: 'MEETING_NOTE_AI_NOT_CONFIGURED', canConfigure: false });
      const forAdmin = await issueTicket(adminC, source.noteId);
      expect(forAdmin.body).toMatchObject({ code: 'MEETING_NOTE_AI_NOT_CONFIGURED', canConfigure: true });
      expect(forAdmin.body).not.toHaveProperty('ticket');
    });

    it('tickets: any changed field, a foreign signature, or a malformed token is rejected; expiry and future issue times are enforced', async () => {
      const issued = await issueTicket(world.authorA, note.noteId);
      const ticket = issued.body.ticket as string;
      const verified = verifyMeetingNoteAiTicket(ticket);
      if (!verified.ok) throw new Error(verified.reason);
      const p = verified.payload;

      const changes: Partial<Record<keyof MeetingNoteAiTicketPayload, unknown>>[] = [
        { iat: p.iat + 1 },
        { idempotencyKey: randomUUID() },
        { userId: world.memberA.appUserId },
        { companyId: world.companyB },
        { noteId: randomUUID() },
        { sourceRevision: p.sourceRevision + 1 },
        { transcriptId: randomUUID() },
        { settingsRevision: p.settingsRevision + 1 },
        { v: 2 },
      ];
      for (const change of changes) {
        expect(verifyMeetingNoteAiTicket(tamper(ticket, change)), JSON.stringify(change)).toEqual({ ok: false, reason: 'invalid_signature' });
      }
      const [prefix, payload, mac] = ticket.split('.');
      const flipped = `${mac.slice(0, -2)}${mac.endsWith('AA') ? 'BA' : 'AA'}`;
      expect(verifyMeetingNoteAiTicket(`${prefix}.${payload}.${flipped}`).ok).toBe(false);
      for (const bad of ['', 'x', `${prefix}.${payload}`, `mnt2.${payload}.${mac}`, `${prefix}.${payload}.${mac}.x`, `${prefix}.${payload}!.${mac}`, 42, null]) {
        expect(verifyMeetingNoteAiTicket(bad).ok, String(bad)).toBe(false);
      }

      // Expiry: valid until 24 h after issuance; an issue time in the future is not valid.
      const iatMs = p.iat * 1000;
      expect(verifyMeetingNoteAiTicket(ticket, iatMs + 24 * 60 * 60 * 1000 - 1000).ok).toBe(true);
      expect(verifyMeetingNoteAiTicket(ticket, iatMs + 24 * 60 * 60 * 1000)).toEqual({ ok: false, reason: 'expired' });
      expect(verifyMeetingNoteAiTicket(ticket, iatMs - 5 * 60 * 1000)).toEqual({ ok: false, reason: 'not_yet_valid' });

      // A ticket signed with another secret (another deployment) is rejected.
      vi.stubEnv('MEETING_NOTES_TICKET_SECRET', randomBytes(48).toString('base64url'));
      try {
        expect(verifyMeetingNoteAiTicket(ticket)).toEqual({ ok: false, reason: 'invalid_signature' });
      } finally {
        vi.stubEnv('MEETING_NOTES_TICKET_SECRET', secret);
      }
    });

    it('rotation: the previous secret still verifies outstanding tickets; a missing or short secret is a configuration error', async () => {
      const issued = await issueTicket(world.authorA, note.noteId);
      const ticket = issued.body.ticket as string;
      const next = randomBytes(48).toString('base64url');
      try {
        vi.stubEnv('MEETING_NOTES_TICKET_SECRET', next);
        vi.stubEnv('MEETING_NOTES_TICKET_SECRET_PREVIOUS', secret);
        expect(verifyMeetingNoteAiTicket(ticket).ok).toBe(true);
        // New tickets are signed with the new secret only.
        const rotated = await issueTicket(world.authorA, note.noteId);
        vi.stubEnv('MEETING_NOTES_TICKET_SECRET_PREVIOUS', '');
        expect(verifyMeetingNoteAiTicket(rotated.body.ticket).ok).toBe(true);
        expect(verifyMeetingNoteAiTicket(ticket)).toEqual({ ok: false, reason: 'invalid_signature' });

        vi.stubEnv('MEETING_NOTES_TICKET_SECRET', '');
        expect(() => verifyMeetingNoteAiTicket(ticket)).toThrow(MeetingNoteAiTicketConfigError);
        const missing = await issueTicket(world.authorA, note.noteId);
        expect(missing.status).toBe(503);
        expect(missing.body.code).toBe('MEETING_NOTE_AI_UNAVAILABLE');
        expect(missing.body).not.toHaveProperty('ticket');

        vi.stubEnv('MEETING_NOTES_TICKET_SECRET', 'too-short-secret');
        expect(() => verifyMeetingNoteAiTicket(ticket)).toThrow(MeetingNoteAiTicketConfigError);
        expect((await issueTicket(world.authorA, note.noteId)).status).toBe(503);

        // Long enough but not random (a placeholder or repeated characters).
        vi.stubEnv('MEETING_NOTES_TICKET_SECRET', 'a'.repeat(64));
        expect(() => verifyMeetingNoteAiTicket(ticket)).toThrow(MeetingNoteAiTicketConfigError);

        vi.stubEnv('MEETING_NOTES_TICKET_SECRET', secret);
        vi.stubEnv('MEETING_NOTES_TICKET_SECRET_PREVIOUS', 'short');
        expect(() => verifyMeetingNoteAiTicket(ticket)).toThrow(MeetingNoteAiTicketConfigError);
      } finally {
        vi.stubEnv('MEETING_NOTES_TICKET_SECRET', secret);
        vi.stubEnv('MEETING_NOTES_TICKET_SECRET_PREVIOUS', '');
      }
      expect(verifyMeetingNoteAiTicket(ticket).ok).toBe(true);
    });
  });
});
