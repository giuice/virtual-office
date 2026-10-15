// Phase 6 T12 (FR-014–FR-022, FR-031, BR-006, BR-008, BR-013; AC-010, AC-012,
// AC-013, AC-016, AC-025–AC-030, AC-032, AC-034): the AI processing start
// route and the Apply route, in-process with real local sessions, against the
// real local Supabase stack (admission/settlement RPCs, Vault, RLS, capacity
// trigger, member removal, stale job) and the T16 fake AI server reached over
// real HTTP through the real provider SDKs. Nothing in the routes, services,
// repositories, adapters, or Supabase is replaced; only `next/headers` is the
// in-memory cookie jar. A crash and a restart run the start route in a child
// Node process (child/start-route-child.mjs). Canary keys only; the ticket
// secret is random per run; no real provider endpoint is contacted (the
// production-mode case routes HTTPS through a local recording proxy that
// refuses every CONNECT).
import { fork, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer, type Server, type Socket } from 'node:net';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';

import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { PUT as putSettings } from '@/app/api/companies/ai-settings/route';
import { POST as postApply } from '@/app/api/meeting-notes/[id]/ai/apply/route';
import { POST as postProcess } from '@/app/api/meeting-notes/[id]/ai/process/route';
import { POST as postTicket } from '@/app/api/meeting-notes/[id]/ai/ticket/route';
import { POST as postItem } from '@/app/api/meeting-notes/[id]/items/route';
import { PUT as putTranscript } from '@/app/api/meeting-notes/[id]/transcript/route';
import { POST as postFromTranscript } from '@/app/api/meeting-notes/transcript/route';
import { issueMeetingNoteAiTicket, verifyMeetingNoteAiTicket } from '@/lib/meeting-notes/ai/ticket';

import { MEETING_NOTES_AI_BASE_URL_OVERRIDE_ENV, meetingNotesFakeAiBaseUrl, type FakeAiOutcome, type FakeAiProvider } from '../meeting-notes-ai-fake/config';
import { MeetingNotesFakeAiControl } from '../meeting-notes-ai-fake/control-client';
import { createMeetingNotesWorld, type MeetingNotesDbUser, type MeetingNotesDbWorld } from './fixtures';
import { callRoute, signInSessionCookies, useLocalSupabaseEnv, type RouteResult, type SessionCookie } from './route-session';
import { MEETING_NOTES_ANON_KEY, MEETING_NOTES_API_URL, MEETING_NOTES_DB_URL, MEETING_NOTES_SERVICE_ROLE_KEY } from './setup';

vi.mock('next/headers', async () => (await import('./route-session')).nextHeadersMock);

const control = new MeetingNotesFakeAiControl();

const SELECTION: Readonly<Record<FakeAiProvider, { model: string; reasoning: string }>> = {
  anthropic: { model: 'claude-opus-5-5', reasoning: 'medium' },
  openai: { model: 'gpt-6.1-sol', reasoning: 'high' },
  kimi: { model: 'kimi-k3', reasoning: 'max' },
  glm: { model: 'glm-5.3', reasoning: 'max' },
};

interface DraftItem {
  description: string;
  assigneeName: string | null;
}

function modelDraft(items: DraftItem[], summary?: { keyPoints?: string[]; decisions?: string[]; nextSteps?: string[] }) {
  return {
    summary: {
      keyPoints: summary?.keyPoints ?? ['Launch reviewed.'],
      decisions: summary?.decisions ?? ['Keep Friday.'],
      nextSteps: summary?.nextSteps ?? ['Update the changelog.'],
    },
    actionItems: items,
  };
}

const success = (items: DraftItem[] = [{ description: 'Update the changelog', assigneeName: null }]): FakeAiOutcome => ({
  kind: 'success',
  draft: modelDraft(items),
});

interface Suggestion {
  description: string;
  suggestedAssigneeName: string | null;
  resolvedAssignee: { userId: string; displayName: string } | null;
  duplicateOfItemId: string | null;
}

interface NoteState {
  revision: number;
  summary: string | null;
  transcript_id: string | null;
  generated_by: string;
  items: number;
  versions: number;
}

interface NoteSource {
  noteId: string;
  revision: number;
  transcriptId: string;
}

const VTT = [
  'WEBVTT',
  '',
  'NOTE recorded in room 4',
  '',
  '1',
  '00:00:01.000 --> 00:00:04.000 align:start position:10%',
  '<v Ana>Bom dia a todos, vamos revisar o lançamento.',
  '',
  'cue-2',
  '00:00:04.500 --> 00:00:07.250 line:0',
  '<v Bruno>Os testes de integração passaram ontem.',
  '',
].join('\n');

const SRT = [
  '1',
  '00:00:01,000 --> 00:00:04,000',
  'Ana: Good morning, let us review the launch.',
  '',
  '2',
  '00:00:04,500 --> 00:00:07,250',
  'Bruno: The integration tests passed last night.',
  '',
].join('\n');

const encoder = new TextEncoder();

function transcriptForm(fields: Record<string, string>, name: string, content: string): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  data.append('file', new File([encoder.encode(content)], name, { type: 'application/octet-stream' }), name);
  return data;
}

/** The user-content text of a recorded provider request (system prompt excluded). */
function sentTranscript(provider: FakeAiProvider, body: unknown): string {
  const messages = (body as { messages: Array<{ role: string; content: string }> }).messages;
  const user = messages.filter((message) => message.role === 'user');
  expect(user).toHaveLength(1);
  expect(provider === 'anthropic' ? messages : messages.slice(1)).toEqual(user);
  return user[0].content;
}

describe('meeting-note AI processing and Apply (local Supabase + fake AI)', () => {
  let world: MeetingNotesDbWorld;
  const sessions = new Map<string, SessionCookie[]>();
  const secret = randomBytes(48).toString('base64url');
  const extraUserIds: string[] = [];

  const canary = (label: string): string => `mn-canary-t12-${label}-${world.ns}-${randomUUID().slice(0, 8)}-Q7`;

  const as = (user: MeetingNotesDbUser): SessionCookie[] => {
    const cookies = sessions.get(user.appUserId);
    if (!cookies) throw new Error(`no session for ${user.displayName}`);
    return cookies;
  };

  const sessionFor = async (user: MeetingNotesDbUser): Promise<void> => {
    sessions.set(user.appUserId, await signInSessionCookies(user.email));
  };

  const settingsOf = async (companyId: string) =>
    (
      await world.query<{ revision: number; provider: string }>(
        `select revision::int as revision, provider from public.meeting_note_ai_settings where company_id = $1`,
        [companyId],
      )
    )[0];

  const saveSettings = async (
    actor: MeetingNotesDbUser,
    companyId: string,
    provider: FakeAiProvider,
    options: { limit?: number; key?: string | null; model?: string; reasoning?: string } = {},
  ): Promise<number> => {
    const current = await settingsOf(companyId);
    const { data, error } = await world.service.rpc('save_meeting_note_ai_settings', {
      p_actor_user_id: actor.appUserId,
      p_company_id: companyId,
      p_expected_revision: current?.revision ?? null,
      p_provider: provider,
      p_model: options.model ?? SELECTION[provider].model,
      p_reasoning_level: options.reasoning ?? SELECTION[provider].reasoning,
      p_daily_limit: options.limit ?? 50,
      p_api_key: options.key === undefined ? canary(provider) : options.key,
    });
    if (error) throw new Error(`settings save failed: ${error.code} ${error.message}`);
    return (data as { revision: number }).revision;
  };

  const usedToday = async (companyId: string): Promise<number> =>
    (
      await world.query<{ n: number }>(
        `select private.meeting_note_ai_used_count($1, private.meeting_note_ai_usage_day(now())) as n`,
        [companyId],
      )
    )[0].n;

  const operation = async (id: string) =>
    (
      await world.query<{ status: string; provider: string; dispatched_at: string | null }>(
        `select status, provider, dispatched_at::text as dispatched_at from public.meeting_note_ai_operations where id = $1`,
        [id],
      )
    )[0];

  const operationCount = async (companyId: string): Promise<number> =>
    Number(
      (
        await world.query<{ n: string }>(
          `select count(*)::text as n from public.meeting_note_ai_operations where company_id = $1`,
          [companyId],
        )
      )[0].n,
    );

  const noteState = async (noteId: string): Promise<NoteState> =>
    (
      await world.query<NoteState & Record<string, unknown>>(
        `select n.revision::int as revision, n.summary, n.transcript_id::text as transcript_id, n.generated_by::text as generated_by,
                (select count(*)::int from public.meeting_note_action_items as i where i.note_id = n.id) as items,
                (select count(*)::int from public.meeting_note_versions as v where v.note_id = n.id) as versions
         from public.meeting_notes as n where n.id = $1`,
        [noteId],
      )
    )[0];

  /** A seeded note (one item) with a stored transcript set by trusted SQL (T10 owns upload). */
  const noteWithTranscript = async (
    companyId: string,
    author: MeetingNotesDbUser,
    participants: MeetingNotesDbUser[] = [],
    text = `Ana: we ship on Friday.\nBruno: I update the changelog. ${randomUUID()}`,
  ): Promise<NoteSource> => {
    const roomId = companyId === world.companyA ? world.spaceA : companyId === world.companyB ? world.spaceB : null;
    const seeded = await world.seedNote({ companyId, roomId, author, participants });
    const [row] = await world.query<{ revision: number; transcript_id: string }>(
      `update public.meeting_notes set transcript = $2, transcript_id = gen_random_uuid(), revision = revision + 1
       where id = $1 returning revision::int as revision, transcript_id::text as transcript_id`,
      [seeded.noteId, text],
    );
    return { noteId: seeded.noteId, revision: row.revision, transcriptId: row.transcript_id };
  };

  const ticketFor = async (user: MeetingNotesDbUser, noteId: string): Promise<string> => {
    const result = await callRoute(as(user), postTicket, {
      method: 'POST',
      path: `/api/meeting-notes/${noteId}/ai/ticket`,
      params: { id: noteId },
    });
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    return result.body.ticket as string;
  };

  const start = (
    user: MeetingNotesDbUser,
    noteId: string,
    ticket: string,
    options: { signal?: AbortSignal; idempotencyKey?: string } = {},
  ): Promise<RouteResult> =>
    callRoute(as(user), postProcess, {
      method: 'POST',
      path: `/api/meeting-notes/${noteId}/ai/process`,
      params: { id: noteId },
      body: options.idempotencyKey ? { ticket, idempotencyKey: options.idempotencyKey } : { ticket },
      signal: options.signal,
    });

  const apply = (user: MeetingNotesDbUser, noteId: string, body: unknown): Promise<RouteResult> =>
    callRoute(as(user), postApply, {
      method: 'POST',
      path: `/api/meeting-notes/${noteId}/ai/apply`,
      params: { id: noteId },
      body,
    });

  const suggestionsOf = (result: RouteResult): Suggestion[] => (result.body.draft as { items: Suggestion[] }).items;

  const serviceRoleSession = async (): Promise<Client> => {
    const client = new Client({ connectionString: MEETING_NOTES_DB_URL });
    await client.connect();
    await client.query(`select pg_catalog.set_config('request.jwt.claims', '{"role":"service_role"}', false)`);
    return client;
  };

  const plainSession = async (): Promise<Client> => {
    const client = new Client({ connectionString: MEETING_NOTES_DB_URL });
    await client.connect();
    return client;
  };

  const waitForLockWaiter = async (pattern: string, count = 1): Promise<void> => {
    for (let attempt = 0; attempt < 400; attempt += 1) {
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

  const removeMember = async (target: MeetingNotesDbUser, companyId = world.companyA): Promise<void> => {
    const [row] = await world.query<{ result: { ok: boolean } }>(
      'select public.remove_company_member_and_presence($1, $2, $3) as result',
      [world.adminA.appUserId, target.appUserId, companyId],
    );
    expect(row.result.ok).toBe(true);
  };

  /** Rows of `count` extra items on a note (trusted SQL; capacity trigger still applies). */
  const fillItems = async (noteId: string, author: MeetingNotesDbUser, count: number): Promise<void> => {
    await world.query(
      `insert into public.meeting_note_action_items (note_id, description, creator_user_id, creator_name)
       select $1, 'Filler ' || g, $2, $3 from generate_series(1, $4::int) as g`,
      [noteId, author.appUserId, author.displayName, count],
    );
  };

  beforeAll(async () => {
    useLocalSupabaseEnv();
    vi.stubEnv('MEETING_NOTES_TICKET_SECRET', secret);
    vi.stubEnv('MEETING_NOTES_TICKET_SECRET_PREVIOUS', '');
    vi.stubEnv('MEETING_NOTES_AI_TIMEOUT_MS', '');
    world = await createMeetingNotesWorld();
    for (const user of [world.adminA, world.authorA, world.participantA, world.memberA, world.adminB, world.memberB]) {
      await sessionFor(user);
    }
    await saveSettings(world.adminA, world.companyA, 'openai');
  }, 120_000);

  beforeEach(async () => {
    await control.reset();
    await world.query(
      `delete from private.rate_limit_counters where action like 'meeting-note:%' and user_id in (
         select id from public.users where email like $1)`,
      [`%-${world.ns}@local.test`],
    );
    await world.query('delete from public.meeting_note_ai_operations where company_id = $1', [world.companyA]);
    const current = await settingsOf(world.companyA);
    if (current.provider !== 'openai') await saveSettings(world.adminA, world.companyA, 'openai');
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await control.reset().catch(() => undefined);
    if (world) {
      if (extraUserIds.length > 0) {
        await world.query('delete from public.users where id = any($1::uuid[])', [extraUserIds]).catch(() => undefined);
      }
      await world.cleanup();
    }
  });

  it('catalog: the Apply RPC is authenticated-only SECURITY DEFINER with an empty search_path; the helper has no grantee', async () => {
    const rows = await world.query<{ fn: string; definer: boolean; config: string[] | null; owner: string; anon: boolean; auth: boolean; service: boolean }>(
      `select p.oid::regprocedure::text as fn, p.prosecdef as definer, p.proconfig as config, r.rolname as owner,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as auth,
              has_function_privilege('service_role', p.oid, 'execute') as service
       from pg_catalog.pg_proc as p join pg_catalog.pg_roles as r on r.oid = p.proowner
       where p.oid in ('public.apply_meeting_note_ai_draft(uuid,bigint,text,jsonb)'::regprocedure,
                       'private.meeting_note_ai_normalize_description(text)'::regprocedure)
       order by 1`,
    );
    expect(rows).toEqual([
      {
        fn: 'apply_meeting_note_ai_draft(uuid,bigint,text,jsonb)',
        definer: true,
        config: ['search_path=""'],
        owner: 'postgres',
        anon: false,
        auth: true,
        service: false,
      },
      {
        fn: 'private.meeting_note_ai_normalize_description(text)',
        definer: true,
        config: ['search_path=""'],
        owner: 'postgres',
        anon: false,
        auth: false,
        service: false,
      },
    ]);
    const note = await noteWithTranscript(world.companyA, world.authorA);
    const args = { p_note_id: note.noteId, p_expected_revision: note.revision, p_summary: 'x', p_items: [] };
    expect((await world.anon.rpc('apply_meeting_note_ai_draft', args)).error?.code).toBe('42501');
    expect((await world.service.rpc('apply_meeting_note_ai_draft', args)).error?.code).toBe('42501');
    expect(await noteState(note.noteId)).toMatchObject({ revision: note.revision, summary: null });
  });

  it('AC-010/AC-012 (.vtt): upload → notice → draft that changes nothing → Apply stores exactly the edited summary and accepted items in one version; attach keeps the summary', async () => {
    const uploaded = await callRoute(as(world.authorA), postFromTranscript, {
      method: 'POST',
      path: '/api/meeting-notes/transcript',
      form: transcriptForm({ spaceId: world.spaceA }, 'Launch review.vtt', VTT),
    });
    expect(uploaded.status).toBe(201);
    const noteId = (uploaded.body.note as { id: string }).id;
    // Participant added through trusted SQL so the reassignment has a second member to pick.
    await world.query(
      `insert into public.meeting_note_participants (note_id, user_id, display_name, sort_order) values ($1, $2, $3, 0)`,
      [noteId, world.participantA.appUserId, world.participantA.displayName],
    );
    const before = await noteState(noteId);
    expect(before).toMatchObject({ summary: null, items: 0, versions: 1, generated_by: 'user' });

    const notice = await callRoute(as(world.authorA), postTicket, {
      method: 'POST',
      path: `/api/meeting-notes/${noteId}/ai/ticket`,
      params: { id: noteId },
    });
    expect(notice.body).toMatchObject({ provider: 'openai', noteRevision: before.revision });

    await control.script('openai', {
      kind: 'success',
      draft: modelDraft([
        { description: 'Revisar o changelog', assigneeName: 'Bruno' },
        { description: 'Avisar o suporte', assigneeName: null },
        { description: 'Preparar a demo', assigneeName: null },
      ]),
    });
    const used = await usedToday(world.companyA);
    const processed = await start(world.authorA, noteId, notice.body.ticket as string);
    expect(processed.status, JSON.stringify(processed.body)).toBe(200);
    expect(processed.body).toMatchObject({ status: 'succeeded', replay: false, sourceRevision: before.revision, transcriptId: before.transcript_id });
    expect(JSON.stringify(processed.body)).not.toContain('mn-canary');
    expect(suggestionsOf(processed).map((s) => s.description)).toEqual(['Revisar o changelog', 'Avisar o suporte', 'Preparar a demo']);
    expect(await usedToday(world.companyA)).toBe(used + 1);
    // The draft changed nothing.
    expect(await noteState(noteId)).toEqual(before);

    // AC-012: the provider received the normalized transcript only.
    const sent = sentTranscript('openai', (await control.lastRequest('openai'))?.body);
    expect(sent).not.toMatch(/-->/);
    expect(sent).not.toMatch(/\d{2}:\d{2}[.,]\d{3}/);
    expect(sent).not.toMatch(/WEBVTT|NOTE recorded|align:|position:|line:0|cue-2/);
    expect(sent).not.toMatch(/^\s*\d+\s*$/m);
    expect(sent).toContain('Ana: Bom dia a todos, vamos revisar o lançamento.');
    expect(sent).toContain('Bruno: Os testes de integração passaram ontem.');

    // Edit the summary, reassign suggestion 1, reject suggestion 2, accept suggestion 3 with a due date.
    const applied = await apply(world.authorA, noteId, {
      expectedRevision: processed.body.sourceRevision,
      summary: { keyPoints: ['Lançamento revisado  na\nsexta.'], decisions: [], nextSteps: ['Atualizar o changelog.'] },
      items: [
        { description: 'Revisar o changelog', assigneeId: world.participantA.appUserId, dueDate: null },
        { description: 'Preparar a demo (editada)', assigneeId: null, dueDate: '2026-11-05' },
      ],
    });
    expect(applied.status, JSON.stringify(applied.body)).toBe(200);
    const expectedSummary = 'Key points\n- Lançamento revisado na sexta.\n\nNext steps\n- Atualizar o changelog.';
    const after = await noteState(noteId);
    expect(after).toEqual({
      ...before,
      revision: before.revision + 1,
      summary: expectedSummary,
      generated_by: 'ai',
      items: 2,
      versions: before.versions + 1,
    });
    const items = await world.query<{ description: string; assignee_id: string | null; assignee_name: string | null; due_date: string | null; completed: boolean; creator_user_id: string }>(
      `select description, assignee_id::text as assignee_id, assignee_name, due_date::text as due_date, completed, creator_user_id::text as creator_user_id
       from public.meeting_note_action_items where note_id = $1 order by created_at, id`,
      [noteId],
    );
    expect(items).toEqual([
      {
        description: 'Revisar o changelog',
        assignee_id: world.participantA.appUserId,
        assignee_name: world.participantA.displayName,
        due_date: null,
        completed: false,
        creator_user_id: world.authorA.appUserId,
      },
      {
        description: 'Preparar a demo (editada)',
        assignee_id: null,
        assignee_name: null,
        due_date: '2026-11-05',
        completed: false,
        creator_user_id: world.authorA.appUserId,
      },
    ]);
    const [version] = await world.query<{ summary: string; revision: number; editor_user_id: string }>(
      `select summary, revision::int as revision, editor_user_id::text as editor_user_id from public.meeting_note_versions
       where note_id = $1 order by revision desc limit 1`,
      [noteId],
    );
    expect(version).toEqual({ summary: expectedSummary, revision: before.revision + 1, editor_user_id: world.authorA.appUserId });
    expect((applied.body.note as { summary: string }).summary).toBe(expectedSummary);

    // Attach a new transcript: replaced immediately, summary unchanged.
    const attached = await callRoute(as(world.authorA), putTranscript, {
      method: 'PUT',
      path: `/api/meeting-notes/${noteId}/transcript`,
      params: { id: noteId },
      form: transcriptForm({ expectedRevision: String(after.revision) }, 'second.srt', SRT),
    });
    expect(attached.status).toBe(200);
    const final = await noteState(noteId);
    expect(final.summary).toBe(expectedSummary);
    expect(final.transcript_id).not.toBe(after.transcript_id);
  });

  it('AC-012 (.srt): cue numbers and timestamps are removed; speakers and text are kept', async () => {
    const uploaded = await callRoute(as(world.authorA), postFromTranscript, {
      method: 'POST',
      path: '/api/meeting-notes/transcript',
      form: transcriptForm({ spaceId: world.spaceA }, 'standup.srt', SRT),
    });
    expect(uploaded.status).toBe(201);
    const noteId = (uploaded.body.note as { id: string }).id;
    await control.script('openai', success());
    const processed = await start(world.authorA, noteId, await ticketFor(world.authorA, noteId));
    expect(processed.status).toBe(200);
    const sent = sentTranscript('openai', (await control.lastRequest('openai'))?.body);
    expect(sent).not.toMatch(/-->|\d{2}:\d{2}[.,]\d{3}/);
    expect(sent).not.toMatch(/^\s*\d+\s*$/m);
    expect(sent).toContain('Ana: Good morning, let us review the launch.');
    expect(sent).toContain('Bruno: The integration tests passed last night.');
  });

  it('AC-013: names resolve locally against current members only; the provider request carries no roster', async () => {
    const companyC = await world.createCompany('T12 C');
    const adminC = await world.createUser('t12-admin-c', companyC, 'admin');
    await sessionFor(adminC);
    await saveSettings(adminC, companyC, 'openai');
    const names = ['Ana Souza', 'Bruno Lima', 'Bruno Costa', 'Diego Ramos', 'Érica Mendes'];
    const rows = await world.query<{ id: string; display_name: string }>(
      `insert into public.users (supabase_uid, email, display_name, company_id, role)
       select gen_random_uuid()::text, format('mndb-t12-name-%s-%s@local.test', g, $2::text), n, $1::uuid, 'member'::public.user_role
       from unnest($3::text[]) with ordinality as t(n, g)
       returning id::text as id, display_name`,
      [companyC, world.ns, names],
    );
    extraUserIds.push(...rows.map((row) => row.id));
    const idOf = (name: string) => rows.find((row) => row.display_name === name)?.id;
    const [removed] = await world.query<{ result: { ok: boolean } }>(
      'select public.remove_company_member_and_presence($1, $2, $3) as result',
      [adminC.appUserId, idOf('Diego Ramos'), companyC],
    );
    expect(removed.result.ok).toBe(true);

    const note = await noteWithTranscript(
      companyC,
      adminC,
      [],
      'Ana: I will send the deck.\nBruno: Fine.\nCarla: I can review.\nDiego: Bye.\nErica: Noted.',
    );
    await control.script(
      'openai',
      success([
        { description: 'Send the deck', assigneeName: 'Ana' },
        { description: 'Approve the budget', assigneeName: 'Bruno' },
        { description: 'Review the deck', assigneeName: 'Carla' },
        { description: 'Archive the notes', assigneeName: 'Diego' },
        { description: 'Book the room', assigneeName: 'erica' },
        { description: 'Share the recording', assigneeName: '  ANA   souza ' },
        { description: 'Write the minutes', assigneeName: null },
      ]),
    );
    const processed = await start(adminC, note.noteId, await ticketFor(adminC, note.noteId));
    expect(processed.status, JSON.stringify(processed.body)).toBe(200);
    expect(suggestionsOf(processed).map((s) => [s.suggestedAssigneeName, s.resolvedAssignee])).toEqual([
      ['Ana', { userId: idOf('Ana Souza'), displayName: 'Ana Souza' }],
      ['Bruno', null],
      ['Carla', null],
      ['Diego', null],
      ['erica', { userId: idOf('Érica Mendes'), displayName: 'Érica Mendes' }],
      ['ANA   souza', { userId: idOf('Ana Souza'), displayName: 'Ana Souza' }],
      [null, null],
    ]);
    const request = JSON.stringify((await control.lastRequest('openai'))?.body);
    for (const absent of ['Souza', 'Lima', 'Costa', 'Ramos', 'Mendes', 'Érica', adminC.displayName, adminC.email]) {
      expect(request).not.toContain(absent);
    }
    expect(request).toContain('Carla: I can review.');
  });

  describe('AC-016: failure outcomes and their counting (OpenAI)', () => {
    const cases: Array<{ label: string; outcome: FakeAiOutcome; code: string; counted: boolean; status: string; timeout?: boolean }> = [
      { label: 'error after processing (500)', outcome: { kind: 'error_after_processing' }, code: 'MEETING_NOTE_AI_PROVIDER_ERROR', counted: true, status: 'failed' },
      { label: 'timeout', outcome: { kind: 'timeout' }, code: 'MEETING_NOTE_AI_TIMEOUT', counted: true, status: 'failed', timeout: true },
      { label: 'refusal', outcome: { kind: 'refusal' }, code: 'MEETING_NOTE_AI_REFUSED', counted: true, status: 'failed' },
      { label: 'malformed JSON', outcome: { kind: 'malformed_json' }, code: 'MEETING_NOTE_AI_OUTPUT_MALFORMED', counted: true, status: 'failed' },
      {
        label: 'listed overload before processing (503 server_is_overloaded)',
        outcome: { kind: 'rejection', status: 503, errorType: 'service_unavailable_error', errorCode: 'server_is_overloaded' },
        code: 'MEETING_NOTE_AI_PROVIDER_OVERLOADED',
        counted: false,
        status: 'refunded',
      },
      {
        label: 'listed quota rejection (429 credit_balance_exhausted)',
        outcome: { kind: 'rejection', status: 429, errorCode: 'credit_balance_exhausted' },
        code: 'MEETING_NOTE_AI_PROVIDER_RATE_LIMITED',
        counted: false,
        status: 'refunded',
      },
    ];

    for (const testCase of cases) {
      it(`${testCase.label}: note and transcript unchanged, error with Try again semantics, usage ${testCase.counted ? '+1' : 'unchanged'}`, async () => {
        if (testCase.timeout) vi.stubEnv('MEETING_NOTES_AI_TIMEOUT_MS', '1500');
        try {
          const note = await noteWithTranscript(world.companyA, world.authorA);
          const before = await noteState(note.noteId);
          const used = await usedToday(world.companyA);
          await control.script('openai', testCase.outcome);
          const result = await start(world.authorA, note.noteId, await ticketFor(world.authorA, note.noteId));
          expect(result.status, JSON.stringify(result.body)).toBe(502);
          expect(result.body).toMatchObject({ code: testCase.code, status: testCase.status });
          expect(typeof result.body.retryable).toBe('boolean');
          expect(result.body.draft).toBeUndefined();
          expect(JSON.stringify(result.body)).not.toContain('mn-canary');
          expect(await control.received('openai')).toBe(1);
          expect(await usedToday(world.companyA)).toBe(used + (testCase.counted ? 1 : 0));
          expect(await noteState(note.noteId)).toEqual(before);
          expect(await operation(result.body.operationId as string)).toMatchObject({ status: testCase.status });
        } finally {
          vi.stubEnv('MEETING_NOTES_AI_TIMEOUT_MS', '');
        }
      });
    }

    it('provider unreachable before processing (connection refused): usage unchanged', async () => {
      const closed = createServer();
      await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve));
      const port = (closed.address() as { port: number }).port;
      await new Promise<void>((resolve) => closed.close(() => resolve()));
      vi.stubEnv(MEETING_NOTES_AI_BASE_URL_OVERRIDE_ENV, `http://127.0.0.1:${port}`);
      try {
        const note = await noteWithTranscript(world.companyA, world.authorA);
        const used = await usedToday(world.companyA);
        const result = await start(world.authorA, note.noteId, await ticketFor(world.authorA, note.noteId));
        expect(result.status).toBe(502);
        expect(result.body).toMatchObject({ code: 'MEETING_NOTE_AI_PROVIDER_UNREACHABLE', status: 'refunded', retryable: true });
        expect(await usedToday(world.companyA)).toBe(used);
      } finally {
        vi.stubEnv(MEETING_NOTES_AI_BASE_URL_OVERRIDE_ENV, meetingNotesFakeAiBaseUrl());
      }
    });

    it('the user leaves after dispatch: no draft, operation discarded, usage +1', async () => {
      const note = await noteWithTranscript(world.companyA, world.authorA);
      const used = await usedToday(world.companyA);
      await control.script('openai', { kind: 'pause', then: success() });
      const controller = new AbortController();
      const pending = start(world.authorA, note.noteId, await ticketFor(world.authorA, note.noteId), { signal: controller.signal });
      await control.waitForHeld('openai');
      controller.abort();
      const result = await pending;
      expect(result.status).toBe(499);
      expect(result.body).toMatchObject({ code: 'MEETING_NOTE_AI_CANCELLED', status: 'discarded' });
      expect(await usedToday(world.companyA)).toBe(used + 1);
      expect((await noteState(note.noteId)).summary).toBeNull();
    });

    it('limit reached: refused with the limit and reset time, nothing dispatched or counted', async () => {
      await saveSettings(world.adminA, world.companyA, 'openai', { limit: 2 });
      try {
        await world.query(
          `insert into public.meeting_note_ai_operations
             (idempotency_key, company_id, user_id, note_id, source_revision, transcript_id, settings_revision,
              ticket_issued_at, provider, model, reasoning_level, admission_day, status, admitted_at, dispatched_at, settled_at)
           select gen_random_uuid(), $1, gen_random_uuid(), gen_random_uuid(), 1, gen_random_uuid(), 1, now(),
                  'openai', 'gpt-6.1-sol', 'high', private.meeting_note_ai_usage_day(now()), 'succeeded', now(), now(), now()
           from generate_series(1, 2)`,
          [world.companyA],
        );
        const note = await noteWithTranscript(world.companyA, world.authorA);
        const result = await start(world.authorA, note.noteId, await ticketFor(world.authorA, note.noteId));
        expect(result.status).toBe(429);
        expect(result.body).toMatchObject({ code: 'MEETING_NOTE_AI_LIMIT_REACHED', limit: 2, used: 2 });
        expect(new Date(result.body.resetAt as string).getTime()).toBeGreaterThan(Date.now());
        expect(await control.received('openai')).toBe(0);
        expect(await usedToday(world.companyA)).toBe(2);
      } finally {
        await saveSettings(world.adminA, world.companyA, 'openai', { limit: 50 });
      }
    });
  });

  describe('AC-026/AC-029: every adapter through the route', () => {
    const LISTED: Readonly<Record<FakeAiProvider, FakeAiOutcome>> = {
      anthropic: { kind: 'rejection', status: 401, errorType: 'authentication_error' },
      openai: { kind: 'rejection', status: 429, errorCode: 'organization_spend_limit_exceeded' },
      kimi: { kind: 'rejection', status: 401, errorType: 'invalid_authentication_error' },
      glm: { kind: 'rejection', status: 429, errorCode: '1302' },
    };

    for (const provider of ['anthropic', 'openai', 'kimi', 'glm'] as const) {
      it(`${provider}: draft returned; listed rejection refunded; unlisted status and mid-stream error counted`, async () => {
        await saveSettings(world.adminA, world.companyA, provider);
        const run = async (outcome: FakeAiOutcome): Promise<RouteResult> => {
          const note = await noteWithTranscript(world.companyA, world.authorA);
          await control.script(provider, outcome);
          return start(world.authorA, note.noteId, await ticketFor(world.authorA, note.noteId));
        };
        const used = await usedToday(world.companyA);

        const ok = await run(success());
        expect(ok.status, JSON.stringify(ok.body)).toBe(200);
        expect((await control.lastRequest(provider))?.body).toMatchObject({ model: SELECTION[provider].model });
        expect(await usedToday(world.companyA)).toBe(used + 1);

        const listed = await run(LISTED[provider]);
        expect(listed.status).toBe(502);
        expect(listed.body.status).toBe('refunded');
        expect(await usedToday(world.companyA)).toBe(used + 1);

        const unlisted = await run({ kind: 'status', status: 418, body: { error: { message: 'teapot' } } });
        expect(unlisted.body).toMatchObject({ code: 'MEETING_NOTE_AI_PROVIDER_ERROR', status: 'failed' });
        expect(await usedToday(world.companyA)).toBe(used + 2);

        const midStream = await run({ kind: 'stream_error_after_start', errorType: 'overloaded_error' });
        expect(midStream.status).toBe(502);
        expect(midStream.body.status).toBe('failed');
        expect(await usedToday(world.companyA)).toBe(used + 3);
        expect(await control.received(provider)).toBe(4);
      });
    }

    it('AC-029: a connection dropped after the request was accepted is received once and counted once', async () => {
      const note = await noteWithTranscript(world.companyA, world.authorA);
      const used = await usedToday(world.companyA);
      await control.script('openai', { kind: 'drop_after_accept' });
      const result = await start(world.authorA, note.noteId, await ticketFor(world.authorA, note.noteId));
      expect(result.status).toBe(502);
      expect(result.body).toMatchObject({ status: 'failed', retryable: true });
      expect(await control.received('openai')).toBe(1);
      expect(await usedToday(world.companyA)).toBe(used + 1);
    });

    it('AC-026: an oversize transcript is refused before dispatch (released, zero requests, usage unchanged)', async () => {
      await saveSettings(world.adminA, world.companyA, 'glm', { model: 'glm-5.1', reasoning: 'none' });
      const big = 'Ana: lorem ipsum dolor sit amet, consectetur adipiscing elit.\n'.repeat(Math.floor(400_000 / 62));
      const note = await noteWithTranscript(world.companyA, world.authorA, [], big);
      const used = await usedToday(world.companyA);
      const result = await start(world.authorA, note.noteId, await ticketFor(world.authorA, note.noteId));
      expect(result.status).toBe(422);
      expect(result.body).toMatchObject({ code: 'MEETING_NOTE_AI_TRANSCRIPT_TOO_LONG_FOR_MODEL', status: 'released' });
      expect(result.body.error).toMatch(/GLM-5\.1.*limit/);
      expect(await control.received('glm')).toBe(0);
      expect(await usedToday(world.companyA)).toBe(used);
    });

    it('AC-026: a client gone before the send releases the reservation (zero requests, usage unchanged)', async () => {
      const note = await noteWithTranscript(world.companyA, world.authorA);
      const used = await usedToday(world.companyA);
      const controller = new AbortController();
      controller.abort();
      const result = await start(world.authorA, note.noteId, await ticketFor(world.authorA, note.noteId), { signal: controller.signal });
      expect(result.status).toBe(499);
      expect(result.body.status).toBe('released');
      expect(await control.received('openai')).toBe(0);
      expect(await usedToday(world.companyA)).toBe(used);
    });
  });

  it('AC-025: a stale notice is refused with the new provider; an admitted processing completes on its snapshot', async () => {
    const note = await noteWithTranscript(world.companyA, world.authorA);
    const oldTicket = await ticketFor(world.authorA, note.noteId);
    await saveSettings(world.adminA, world.companyA, 'anthropic');
    const stale = await start(world.authorA, note.noteId, oldTicket);
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({
      code: 'MEETING_NOTE_AI_SETTINGS_STALE',
      settings: { provider: 'anthropic', providerLabel: 'Anthropic (Claude)', model: SELECTION.anthropic.model },
    });
    expect(await operationCount(world.companyA)).toBe(0);

    // Admitted under Anthropic, then the admin switches to OpenAI mid-flight.
    await control.script('anthropic', { kind: 'pause', then: success() });
    const pending = start(world.authorA, note.noteId, await ticketFor(world.authorA, note.noteId));
    await control.waitForHeld('anthropic');
    await saveSettings(world.adminA, world.companyA, 'openai');
    await control.release('anthropic');
    const finished = await pending;
    expect(finished.status, JSON.stringify(finished.body)).toBe(200);
    expect(await operation(finished.body.operationId as string)).toMatchObject({ status: 'succeeded', provider: 'anthropic' });
    expect(await control.received('anthropic')).toBe(1);
    expect(await control.received('openai')).toBe(0);
  });

  it('AC-027: reprocess marks the repeated item "already exists"; Apply appends only accepted items and leaves existing ones (completion included); over 100 is refused', async () => {
    const note = await noteWithTranscript(world.companyA, world.authorA);
    await world.query(
      `insert into public.meeting_note_action_items (note_id, description, completed, creator_user_id, creator_name)
       values ($1, 'Revisar o orçamento', true, $2, $3), ($1, 'Enviar a ata', false, $2, $3)`,
      [note.noteId, world.authorA.appUserId, world.authorA.displayName],
    );
    const existing = await world.query<{ id: string; description: string; completed: boolean; revision: number; updated_at: string }>(
      `select id::text as id, description, completed, revision::int as revision, updated_at::text as updated_at
       from public.meeting_note_action_items where note_id = $1 order by created_at, id`,
      [note.noteId],
    );
    expect(existing).toHaveLength(3);
    const repeated = existing.find((item) => item.description === 'Revisar o orçamento');

    await control.script(
      'openai',
      success([
        { description: '  REVISAR o   orcamento ', assigneeName: null },
        { description: 'Agendar a retrospectiva', assigneeName: null },
        { description: 'Publicar o release', assigneeName: null },
      ]),
    );
    // The ticket is bound to its requester: another user cannot present it.
    const borrowed = await start(world.participantA, note.noteId, await ticketFor(world.authorA, note.noteId));
    expect(borrowed.body.code).toBe('MEETING_NOTE_AI_BINDING_MISMATCH');
    const reprocessed = await start(world.authorA, note.noteId, await ticketFor(world.authorA, note.noteId));
    expect(reprocessed.status, JSON.stringify(reprocessed.body)).toBe(200);
    expect(suggestionsOf(reprocessed).map((s) => s.duplicateOfItemId)).toEqual([repeated?.id, null, null]);

    const applied = await apply(world.authorA, note.noteId, {
      expectedRevision: reprocessed.body.sourceRevision,
      summary: { keyPoints: ['Ok.'], decisions: [], nextSteps: [] },
      items: [
        { description: 'Agendar a retrospectiva', assigneeId: world.memberA.appUserId, dueDate: null },
        { description: 'Publicar o release', assigneeId: null, dueDate: null },
      ],
    });
    expect(applied.status, JSON.stringify(applied.body)).toBe(200);
    expect(applied.body.applied).toMatchObject({ duplicateIndexes: [] });
    const after = await world.query<{ id: string; description: string; completed: boolean; revision: number; updated_at: string }>(
      `select id::text as id, description, completed, revision::int as revision, updated_at::text as updated_at
       from public.meeting_note_action_items where note_id = $1 order by created_at, id`,
      [note.noteId],
    );
    expect(after.slice(0, 3)).toEqual(existing);
    expect(after.slice(3).map((item) => item.description)).toEqual(['Agendar a retrospectiva', 'Publicar o release']);

    // Accepting a duplicate explicitly is the user's decision: allowed and reported.
    const state = await noteState(note.noteId);
    const dup = await apply(world.authorA, note.noteId, {
      expectedRevision: state.revision,
      summary: { keyPoints: [], decisions: [], nextSteps: [] },
      items: [{ description: 'revisar o ORÇAMENTO', assigneeId: null, dueDate: null }],
    });
    expect(dup.status).toBe(200);
    expect(dup.body.applied).toMatchObject({ duplicateIndexes: [0] });
    // An items-only Apply keeps the current summary (and its generator).
    expect(await noteState(note.noteId)).toMatchObject({
      summary: 'Key points\n- Ok.',
      generated_by: 'ai',
      revision: state.revision + 1,
      versions: state.versions + 1,
      items: state.items + 1,
    });
    const manual = await noteWithTranscript(world.companyA, world.authorA);
    await world.query(`update public.meeting_notes set summary = 'Written by hand' where id = $1`, [manual.noteId]);
    const itemsOnly = await apply(world.authorA, manual.noteId, {
      expectedRevision: manual.revision,
      summary: { keyPoints: [], decisions: [], nextSteps: [] },
      items: [{ description: 'Only an item', assigneeId: null, dueDate: null }],
    });
    expect(itemsOnly.status).toBe(200);
    expect(await noteState(manual.noteId)).toMatchObject({ summary: 'Written by hand', generated_by: 'user' });

    // Over capacity: refused, nothing changes.
    const full = await noteWithTranscript(world.companyA, world.authorA);
    await fillItems(full.noteId, world.authorA, 98);
    const fullBefore = await noteState(full.noteId);
    expect(fullBefore.items).toBe(99);
    const refused = await apply(world.authorA, full.noteId, {
      expectedRevision: full.revision,
      summary: { keyPoints: ['Would be written.'], decisions: [], nextSteps: [] },
      items: [
        { description: 'One', assigneeId: null, dueDate: null },
        { description: 'Two', assigneeId: null, dueDate: null },
      ],
    });
    expect(refused.status).toBe(400);
    expect(refused.body.code).toBe('MEETING_NOTE_ITEM_LIMIT_REACHED');
    expect(await noteState(full.noteId)).toEqual(fullBefore);
  });

  it('Apply refusals: non-editor and outsider denied, invalid assignee and empty Apply rejected — nothing changes', async () => {
    const note = await noteWithTranscript(world.companyA, world.authorA);
    const before = await noteState(note.noteId);
    const body = {
      expectedRevision: note.revision,
      summary: { keyPoints: ['x'], decisions: [], nextSteps: [] },
      items: [{ description: 'Task', assigneeId: null, dueDate: null }],
    };
    expect((await apply(world.memberA, note.noteId, body)).body.code).toBe('MEETING_NOTE_FORBIDDEN');
    expect((await apply(world.adminB, note.noteId, body)).status).toBe(404);
    const foreign = await apply(world.authorA, note.noteId, { ...body, items: [{ description: 'Task', assigneeId: world.memberB.appUserId, dueDate: null }] });
    expect(foreign.body.code).toBe('MEETING_NOTE_ITEM_ASSIGNEE_NOT_MEMBER');
    const empty = await apply(world.authorA, note.noteId, { ...body, summary: { keyPoints: [' '], decisions: [], nextSteps: [] }, items: [] });
    expect(empty.body.code).toBe('MEETING_NOTE_AI_APPLY_EMPTY');
    const direct = await world.memberA.client.rpc('apply_meeting_note_ai_draft', {
      p_note_id: note.noteId,
      p_expected_revision: note.revision,
      p_summary: 'Self-granted',
      p_items: [],
    });
    expect(direct.error?.message).toBe('MEETING_NOTE_FORBIDDEN');
    expect(await noteState(note.noteId)).toEqual(before);
  });

  it('AC-028: concurrent starts with one ticket dispatch once; replays are received once and counted once; a moved or substituted key is rejected', async () => {
    const note = await noteWithTranscript(world.companyA, world.authorA);
    const other = await noteWithTranscript(world.companyA, world.authorA);
    const used = await usedToday(world.companyA);
    await control.setDefault('openai', { kind: 'success', draft: modelDraft([]), delayMs: 400 });
    const ticket = await ticketFor(world.authorA, note.noteId);
    const results = await Promise.all(Array.from({ length: 5 }, () => start(world.authorA, note.noteId, ticket)));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    const drafts = results.filter((r) => r.body.draft !== null);
    expect(drafts).toHaveLength(1);
    expect(results.filter((r) => r.body.replay === true)).toHaveLength(4);
    expect(new Set(results.map((r) => r.body.operationId)).size).toBe(1);
    expect(await control.received('openai')).toBe(1);
    expect(await usedToday(world.companyA)).toBe(used + 1);

    const replay = await start(world.authorA, note.noteId, ticket);
    expect(replay.body).toMatchObject({ replay: true, status: 'succeeded', draft: null });
    expect(await control.received('openai')).toBe(1);
    expect(await usedToday(world.companyA)).toBe(used + 1);

    // The same key for another note or with a substituted key: rejected, nothing sent.
    expect((await start(world.authorA, other.noteId, ticket)).body.code).toBe('MEETING_NOTE_AI_BINDING_MISMATCH');
    const fresh = await ticketFor(world.authorA, note.noteId);
    const oldKey = verifyMeetingNoteAiTicket(ticket);
    if (!oldKey.ok) throw new Error('ticket did not verify');
    expect((await start(world.authorA, note.noteId, fresh, { idempotencyKey: oldKey.payload.idempotencyKey })).body.code).toBe(
      'MEETING_NOTE_AI_BINDING_MISMATCH',
    );
    const [prefix, payload, mac] = fresh.split('.');
    const moved = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')), idempotencyKey: oldKey.payload.idempotencyKey }),
    ).toString('base64url');
    const tampered = await start(world.authorA, note.noteId, `${prefix}.${moved}.${mac}`);
    expect(tampered.status).toBe(400);
    expect(tampered.body.code).toBe('MEETING_NOTE_AI_TICKET_INVALID');
    expect(await control.received('openai')).toBe(1);
    expect(await usedToday(world.companyA)).toBe(used + 1);
  });

  it('AC-030: a transcript replaced while the provider is paused makes Apply a conflict; nothing is applied', async () => {
    const note = await noteWithTranscript(world.companyA, world.authorA, [world.participantA]);
    await control.script('openai', { kind: 'pause', then: success() });
    const pending = start(world.authorA, note.noteId, await ticketFor(world.authorA, note.noteId));
    await control.waitForHeld('openai');
    const replaced = await callRoute(as(world.participantA), putTranscript, {
      method: 'PUT',
      path: `/api/meeting-notes/${note.noteId}/transcript`,
      params: { id: note.noteId },
      form: transcriptForm({ expectedRevision: String(note.revision) }, 'replacement.txt', 'Ana: replaced transcript.'),
    });
    expect(replaced.status).toBe(200);
    await control.release('openai');
    const processed = await pending;
    expect(processed.status).toBe(200);
    expect(processed.body.sourceRevision).toBe(note.revision);
    const before = await noteState(note.noteId);
    const applied = await apply(world.authorA, note.noteId, {
      expectedRevision: processed.body.sourceRevision,
      summary: { keyPoints: ['Stale.'], decisions: [], nextSteps: [] },
      items: [{ description: 'Stale task', assigneeId: null, dueDate: null }],
    });
    expect(applied.status).toBe(409);
    expect(applied.body).toMatchObject({ code: 'MEETING_NOTE_STALE_REVISION', currentRevision: before.revision });
    expect(await noteState(note.noteId)).toEqual(before);
  });

  it('AC-030: a member removed while the provider is paused gets no draft; the operation is discarded and counted', async () => {
    const leaver = await world.createUser('t12-leaver', world.companyA, 'member');
    await sessionFor(leaver);
    const note = await noteWithTranscript(world.companyA, world.authorA, [leaver]);
    const used = await usedToday(world.companyA);
    await control.script('openai', { kind: 'pause', then: success([{ description: 'Secret task', assigneeName: null }]) });
    const pending = start(leaver, note.noteId, await ticketFor(leaver, note.noteId));
    await control.waitForHeld('openai');
    await removeMember(leaver);
    await control.release('openai');
    const result = await pending;
    expect(result.status).toBe(404);
    expect(result.body).toMatchObject({ code: 'MEETING_NOTE_NOT_FOUND', status: 'discarded' });
    expect(JSON.stringify(result.body)).not.toContain('Secret task');
    expect(await usedToday(world.companyA)).toBe(used + 1);
    expect((await noteState(note.noteId)).summary).toBeNull();
  });

  describe('access lost after the preliminary read, before the atomic success finalization', () => {
    // The uncommitted change is invisible to the route's session reads (so the
    // preliminary check passes) while its row lock makes the finalization
    // wait; the change then commits and the finalization must see it.
    const lateLoss = async (
      label: string,
      lose: (blocker: Client, ctx: { leaver: MeetingNotesDbUser; noteId: string }) => Promise<void>,
      expected: { status: number; code: string },
    ): Promise<void> => {
      const leaver = await world.createUser(`t12-late-${label}`, world.companyA, 'member');
      await sessionFor(leaver);
      const note = await noteWithTranscript(world.companyA, world.authorA, [leaver]);
      const used = await usedToday(world.companyA);
      await control.script('openai', { kind: 'pause', then: success([{ description: 'Late secret task', assigneeName: null }]) });
      const pending = start(leaver, note.noteId, await ticketFor(leaver, note.noteId));
      await control.waitForHeld('openai');
      const blocker = await plainSession();
      try {
        await blocker.query('begin');
        await lose(blocker, { leaver, noteId: note.noteId });
        await control.release('openai');
        await waitForLockWaiter('%finalize_meeting_note_ai_success%');
        await blocker.query('commit');
      } finally {
        await blocker.end().catch(() => undefined);
      }
      const result = await pending;
      expect(result.status, JSON.stringify(result.body)).toBe(expected.status);
      expect(result.body).toMatchObject({ code: expected.code, status: 'discarded' });
      expect(result.body.draft).toBeUndefined();
      expect(JSON.stringify(result.body)).not.toContain('Late secret task');
      expect(await operation(result.body.operationId as string)).toMatchObject({ status: 'discarded' });
      expect(await usedToday(world.companyA)).toBe(used + 1);
      expect(await control.received('openai')).toBe(1);
    };

    it('a member removed: no draft, operation discarded, usage +1', async () => {
      await lateLoss(
        'removed',
        async (blocker, { leaver }) => {
          const { rows } = await blocker.query<{ result: { ok: boolean } }>(
            'select public.remove_company_member_and_presence($1, $2, $3) as result',
            [world.adminA.appUserId, leaver.appUserId, world.companyA],
          );
          expect(rows[0].result.ok).toBe(true);
        },
        { status: 404, code: 'MEETING_NOTE_NOT_FOUND' },
      );
    });

    it('the note deleted: no draft, operation discarded, usage +1', async () => {
      await lateLoss(
        'deleted',
        async (blocker, { noteId }) => {
          const { rowCount } = await blocker.query('delete from public.meeting_notes where id = $1', [noteId]);
          expect(rowCount).toBe(1);
        },
        { status: 404, code: 'MEETING_NOTE_NOT_FOUND' },
      );
    });

    it('editor rights lost (participant removed): no draft, operation discarded, usage +1', async () => {
      await lateLoss(
        'demoted',
        async (blocker, { leaver, noteId }) => {
          // The same row lock every note mutation takes, then the participant row goes.
          await blocker.query('select 1 from public.meeting_notes where id = $1 for update', [noteId]);
          const { rowCount } = await blocker.query(
            'delete from public.meeting_note_participants where note_id = $1 and user_id = $2',
            [noteId, leaver.appUserId],
          );
          expect(rowCount).toBe(1);
        },
        { status: 403, code: 'MEETING_NOTE_FORBIDDEN' },
      );
    });
  });

  it('a member removed or demoted before the start: zero dispatches, usage unchanged', async () => {
    const leaver = await world.createUser('t12-removed-before', world.companyA, 'member');
    const demoted = await world.createUser('t12-demoted-before', world.companyA, 'admin');
    await sessionFor(leaver);
    await sessionFor(demoted);
    const note = await noteWithTranscript(world.companyA, world.authorA, [leaver]);
    const leaverTicket = await ticketFor(leaver, note.noteId);
    const demotedTicket = await ticketFor(demoted, note.noteId);
    const used = await usedToday(world.companyA);
    await removeMember(leaver);
    const [role] = await world.query<{ result: { ok: boolean } }>(
      `select public.update_company_member_role($1, $2, $3, 'member'::public.user_role) as result`,
      [world.adminA.appUserId, demoted.appUserId, world.companyA],
    );
    expect(role.result.ok).toBe(true);
    // Fresh sessions carry the current role/company (the route re-reads users anyway).
    await sessionFor(demoted);
    expect((await start(leaver, note.noteId, leaverTicket)).status).toBe(404);
    const forbidden = await start(demoted, note.noteId, demotedTicket);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.code).toBe('MEETING_NOTE_FORBIDDEN');
    expect(await control.received('openai')).toBe(0);
    expect(await usedToday(world.companyA)).toBe(used);
    expect(await operationCount(world.companyA)).toBe(0);
  });

  describe('AC-032: capacity and lock order under real concurrency', () => {
    it('98 items: a manual add and a two-item Apply released together — exactly one succeeds, never more than 100, a refused Apply changes nothing', async () => {
      const note = await noteWithTranscript(world.companyA, world.authorA);
      await fillItems(note.noteId, world.authorA, 97);
      const before = await noteState(note.noteId);
      expect(before.items).toBe(98);
      const blocker = await serviceRoleSession();
      try {
        await blocker.query('begin');
        await blocker.query('select 1 from public.meeting_notes where id = $1 for update', [note.noteId]);
        const add = callRoute(as(world.authorA), postItem, {
          method: 'POST',
          path: `/api/meeting-notes/${note.noteId}/items`,
          params: { id: note.noteId },
          body: { description: 'Manual add' },
        });
        const applied = apply(world.authorA, note.noteId, {
          expectedRevision: note.revision,
          summary: { keyPoints: ['Applied.'], decisions: [], nextSteps: [] },
          items: [
            { description: 'Draft one', assigneeId: null, dueDate: null },
            { description: 'Draft two', assigneeId: null, dueDate: null },
          ],
        });
        await waitForLockWaiter('%create_meeting_note_action_item%');
        await waitForLockWaiter('%apply_meeting_note_ai_draft%');
        await blocker.query('commit');
        const [addResult, applyResult] = await Promise.all([add, applied]);
        const after = await noteState(note.noteId);
        expect(after.items).toBeLessThanOrEqual(100);
        if (applyResult.status === 200) {
          expect(addResult.body.code).toBe('MEETING_NOTE_ITEM_LIMIT_REACHED');
          expect(after).toMatchObject({ items: 100, revision: before.revision + 1, versions: before.versions + 1 });
        } else {
          expect(addResult.status).toBe(201);
          expect(applyResult.body.code).toBe('MEETING_NOTE_ITEM_LIMIT_REACHED');
          expect(after).toEqual({ ...before, items: 99 });
        }
      } finally {
        await blocker.end().catch(() => undefined);
      }
    });

    for (const held of ['note', 'settings'] as const) {
      it(`a settings save, an admission, and an Apply by the same admin on one note finish without a deadlock (blocker on the ${held} row)`, async () => {
        const note = await noteWithTranscript(world.companyA, world.adminA);
        await control.setDefault('openai', success());
        const ticket = await ticketFor(world.adminA, note.noteId);
        const settings = await settingsOf(world.companyA);
        const blocker = await serviceRoleSession();
        try {
          await blocker.query('begin');
          if (held === 'note') {
            await blocker.query('select 1 from public.meeting_notes where id = $1 for update', [note.noteId]);
          } else {
            await blocker.query('select 1 from public.meeting_note_ai_settings where company_id = $1 for update', [world.companyA]);
          }
          const processing = start(world.adminA, note.noteId, ticket);
          await waitForLockWaiter('%admit_meeting_note_ai_operation%');
          const applying = apply(world.adminA, note.noteId, {
            expectedRevision: note.revision,
            summary: { keyPoints: ['Concurrent.'], decisions: [], nextSteps: [] },
            items: [{ description: 'Concurrent task', assigneeId: null, dueDate: null }],
          });
          if (held === 'note') await waitForLockWaiter('%apply_meeting_note_ai_draft%');
          const saving = callRoute(as(world.adminA), putSettings, {
            method: 'PUT',
            path: '/api/companies/ai-settings',
            body: {
              expectedRevision: settings.revision,
              provider: 'openai',
              model: SELECTION.openai.model,
              reasoningLevel: 'medium',
              dailyLimit: 50,
              apiKey: null,
            },
          });
          await waitForLockWaiter('%save_meeting_note_ai_settings%');
          await blocker.query('commit');
          const [processed, applied, saved] = await Promise.all([processing, applying, saving]);
          const all = JSON.stringify([processed.body, applied.body, saved.body]);
          expect(all).not.toContain('40P01');
          expect(all).not.toContain('INTERNAL_ERROR');
          expect(applied.status).toBe(200);
          expect(saved.status).toBe(200);
          if (processed.status === 200) {
            expect(processed.body.status).toBe('succeeded');
          } else {
            expect(processed.body.code).toBe('MEETING_NOTE_AI_SOURCE_STALE');
          }
        } finally {
          await blocker.end().catch(() => undefined);
        }
      });
    }
  });

  describe('AC-034: cancellation, expiry, key reuse, settings change, crash, restart, production override', () => {
    it('a processing cancelled by leaving the page that later completes replays as "discarded" without a new dispatch', async () => {
      const note = await noteWithTranscript(world.companyA, world.authorA);
      await control.script('openai', { kind: 'pause', then: success() });
      const ticket = await ticketFor(world.authorA, note.noteId);
      const controller = new AbortController();
      const pending = start(world.authorA, note.noteId, ticket, { signal: controller.signal });
      await control.waitForHeld('openai');
      controller.abort();
      expect((await pending).body.status).toBe('discarded');
      await control.release('openai');
      const replay = await start(world.authorA, note.noteId, ticket);
      expect(replay.status).toBe(200);
      expect(replay.body).toMatchObject({ replay: true, status: 'discarded', draft: null });
      expect(await control.received('openai')).toBe(1);
    });

    it('cancelled while the post-provider access read is blocked: discarded (counted), never succeeded; the replay says "discarded"', async () => {
      const note = await noteWithTranscript(world.companyA, world.authorA);
      const used = await usedToday(world.companyA);
      await control.script('openai', { kind: 'pause', then: success() });
      const ticket = await ticketFor(world.authorA, note.noteId);
      const controller = new AbortController();
      const pending = start(world.authorA, note.noteId, ticket, { signal: controller.signal });
      await control.waitForHeld('openai');
      const blocker = await plainSession();
      try {
        await blocker.query('begin');
        // Blocks the preliminary access read (it loads the note's items).
        await blocker.query('lock table public.meeting_note_action_items in access exclusive mode');
        await control.release('openai');
        await waitForLockWaiter('%meeting_note_action_items%');
        controller.abort();
        await blocker.query('commit');
      } finally {
        await blocker.end().catch(() => undefined);
      }
      const result = await pending;
      expect(result.status).toBe(499);
      expect(result.body).toMatchObject({ code: 'MEETING_NOTE_AI_CANCELLED', status: 'discarded' });
      expect(await operation(result.body.operationId as string)).toMatchObject({ status: 'discarded' });
      expect(await usedToday(world.companyA)).toBe(used + 1);
      const replay = await start(world.authorA, note.noteId, ticket);
      expect(replay.status).toBe(200);
      expect(replay.body).toMatchObject({ replay: true, status: 'discarded', draft: null });
      expect(await control.received('openai')).toBe(1);
    });

    it('cancelled after the finalization request was sent: no draft is returned; the committed "succeeded" stands (documented) and is counted once', async () => {
      const note = await noteWithTranscript(world.companyA, world.authorA);
      const used = await usedToday(world.companyA);
      await control.script('openai', { kind: 'pause', then: success([{ description: 'Never shown task', assigneeName: null }]) });
      const ticket = await ticketFor(world.authorA, note.noteId);
      const controller = new AbortController();
      const pending = start(world.authorA, note.noteId, ticket, { signal: controller.signal });
      await control.waitForHeld('openai');
      const blocker = await plainSession();
      try {
        await blocker.query('begin');
        // The finalization waits on the note row (after the session reads passed).
        await blocker.query('select 1 from public.meeting_notes where id = $1 for update', [note.noteId]);
        await control.release('openai');
        await waitForLockWaiter('%finalize_meeting_note_ai_success%');
        controller.abort();
        await blocker.query('commit');
      } finally {
        await blocker.end().catch(() => undefined);
      }
      const result = await pending;
      expect(result.status).toBe(499);
      expect(result.body).toMatchObject({ code: 'MEETING_NOTE_AI_CANCELLED', status: 'succeeded' });
      expect(JSON.stringify(result.body)).not.toContain('Never shown task');
      expect(await usedToday(world.companyA)).toBe(used + 1);
      const replay = await start(world.authorA, note.noteId, ticket);
      expect(replay.body).toMatchObject({ replay: true, status: 'succeeded', draft: null });
      expect(await control.received('openai')).toBe(1);
    });

    it('an expired ticket is rejected without dispatch, with its operation record retained and after its cleanup', async () => {
      const note = await noteWithTranscript(world.companyA, world.authorA);
      const settings = await settingsOf(world.companyA);
      const expired = issueMeetingNoteAiTicket(
        {
          userId: world.authorA.appUserId,
          companyId: world.companyA,
          noteId: note.noteId,
          sourceRevision: note.revision,
          transcriptId: note.transcriptId,
          settingsRevision: settings.revision,
        },
        Date.now() - 25 * 60 * 60 * 1000,
      );
      await world.query(
        `insert into public.meeting_note_ai_operations
           (idempotency_key, company_id, user_id, note_id, source_revision, transcript_id, settings_revision,
            ticket_issued_at, provider, model, reasoning_level, admission_day, status, admitted_at, dispatched_at, settled_at)
         values ($1, $2, $3, $4, $5, $6, $7, now() - interval '25 hours', 'openai', 'gpt-6.1-sol', 'high',
                 private.meeting_note_ai_usage_day(now() - interval '25 hours'), 'succeeded',
                 now() - interval '25 hours', now() - interval '25 hours', now() - interval '25 hours')`,
        [expired.payload.idempotencyKey, world.companyA, world.authorA.appUserId, note.noteId, note.revision, note.transcriptId, settings.revision],
      );
      const retained = await start(world.authorA, note.noteId, expired.ticket);
      expect(retained.status).toBe(410);
      expect(retained.body.code).toBe('MEETING_NOTE_AI_TICKET_EXPIRED');
      await world.query('delete from public.meeting_note_ai_operations where idempotency_key = $1', [expired.payload.idempotencyKey]);
      const cleaned = await start(world.authorA, note.noteId, expired.ticket);
      expect(cleaned.status).toBe(410);
      expect(await control.received('openai')).toBe(0);
      expect(await operationCount(world.companyA)).toBe(0);
    });

    it('a replay after a settings change returns the original operation', async () => {
      const note = await noteWithTranscript(world.companyA, world.authorA);
      await control.script('openai', success());
      const ticket = await ticketFor(world.authorA, note.noteId);
      const first = await start(world.authorA, note.noteId, ticket);
      expect(first.status).toBe(200);
      await saveSettings(world.adminA, world.companyA, 'kimi');
      const replay = await start(world.authorA, note.noteId, ticket);
      expect(replay.status).toBe(200);
      expect(replay.body).toMatchObject({ replay: true, status: 'succeeded', operationId: first.body.operationId });
      expect(await control.received('openai')).toBe(1);
      expect(await control.received('kimi')).toBe(0);
    });

    describe('child-process start route', () => {
      const CHILD = path.resolve(__dirname, 'child/start-route-child.mjs');
      const children: ChildProcess[] = [];

      const childEnv = (extra: Record<string, string>): Record<string, string> => {
        const env: Record<string, string> = {};
        for (const [key, value] of Object.entries(process.env)) {
          if (value === undefined) continue;
          if (/SUPABASE|MEETING_NOTES|NEXT_PUBLIC|^NODE_ENV$|^NODE_OPTIONS$|VITEST|^TEST$|_PROXY$/i.test(key)) continue;
          env[key] = value;
        }
        return {
          ...env,
          NODE_ENV: 'test',
          NEXT_PUBLIC_SUPABASE_URL: MEETING_NOTES_API_URL,
          NEXT_PUBLIC_SUPABASE_ANON_KEY: MEETING_NOTES_ANON_KEY,
          SUPABASE_SERVICE_ROLE_KEY: MEETING_NOTES_SERVICE_ROLE_KEY,
          MEETING_NOTES_TICKET_SECRET: secret,
          [MEETING_NOTES_AI_BASE_URL_OVERRIDE_ENV]: meetingNotesFakeAiBaseUrl(),
          ...extra,
        };
      };

      const spawnChild = async (extra: Record<string, string> = {}) => {
        const child = fork(CHILD, [], { env: childEnv(extra) as NodeJS.ProcessEnv, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
        children.push(child);
        const results = new Map<string, (result: RouteResult) => void>();
        child.on('message', (message: { type: string; id?: string; status?: number; body?: Record<string, unknown> }) => {
          if (message.type === 'result' && message.id) {
            results.get(message.id)?.({ status: message.status ?? -1, body: message.body ?? {} });
          }
        });
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('start-route child did not become ready')), 60_000);
          child.on('message', (message: { type: string }) => {
            if (message.type === 'ready') {
              clearTimeout(timer);
              resolve();
            }
          });
          child.once('exit', (code) => {
            clearTimeout(timer);
            reject(new Error(`start-route child exited early (${code})`));
          });
        });
        return {
          start(user: MeetingNotesDbUser, noteId: string, ticket: string): Promise<RouteResult> {
            const id = randomUUID();
            return new Promise((resolve) => {
              results.set(id, resolve);
              child.send({ type: 'start', id, noteId, ticket, cookies: as(user) });
            });
          },
          async kill(): Promise<void> {
            if (child.exitCode !== null || child.signalCode !== null) return;
            const exited = once(child, 'exit');
            child.kill('SIGKILL');
            await exited;
          },
        };
      };

      afterAll(async () => {
        for (const child of children) {
          if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
        }
      });

      it(
        'a server killed after dispatch: 10 minutes later the operation is "failed" and counted; a ticket issued before the restart is accepted',
        async () => {
          const note = await noteWithTranscript(world.companyA, world.authorA);
          const first = await ticketFor(world.authorA, note.noteId);
          const beforeRestart = await ticketFor(world.authorA, note.noteId);
          const used = await usedToday(world.companyA);
          await control.script('openai', { kind: 'pause', then: success() });

          const server1 = await spawnChild();
          void server1.start(world.authorA, note.noteId, first);
          await control.waitForReceived('openai', 1, 30_000);
          await server1.kill();

          const firstKey = verifyMeetingNoteAiTicket(first);
          if (!firstKey.ok) throw new Error('ticket did not verify');
          const [op] = await world.query<{ id: string; status: string }>(
            'select id::text as id, status from public.meeting_note_ai_operations where idempotency_key = $1',
            [firstKey.payload.idempotencyKey],
          );
          // The pg_cron stale job (every minute) may only fail it once it is old; it is not yet.
          expect(op.status).toBe('dispatched');
          await world.query(
            `update public.meeting_note_ai_operations
             set dispatched_at = now() - interval '11 minutes', admitted_at = now() - interval '11 minutes'
             where id = $1`,
            [op.id],
          );
          // Either this call or the every-minute cron job (whichever runs first) fails it.
          await world.query('select public.fail_stale_meeting_note_ai_operations()');
          expect(await operation(op.id)).toMatchObject({ status: 'failed' });
          expect(await usedToday(world.companyA)).toBe(used + 1);
          await control.reset();

          // Restart with the same secret: the ticket issued before the restart is accepted.
          await control.script('openai', success());
          const server2 = await spawnChild();
          try {
            const accepted = await server2.start(world.authorA, note.noteId, beforeRestart);
            expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
            expect(accepted.body).toMatchObject({ status: 'succeeded', replay: false });
            expect(await usedToday(world.companyA)).toBe(used + 2);
            // Deleting the note never changes usage.
            await world.query('delete from public.meeting_notes where id = $1', [note.noteId]);
            expect(await usedToday(world.companyA)).toBe(used + 2);
          } finally {
            await server2.kill();
          }
        },
        120_000,
      );

      it(
        'the dispatch mark commits but its reply is lost: no provider request, the operation is refunded, usage unchanged',
        async () => {
          const note = await noteWithTranscript(world.companyA, world.authorA);
          const ticket = await ticketFor(world.authorA, note.noteId);
          const used = await usedToday(world.companyA);
          await control.setDefault('openai', success());
          const server = await spawnChild({ MEETING_NOTES_CHILD_DROP_RPC_REPLY: 'mark_meeting_note_ai_operation_dispatched' });
          try {
            const result = await server.start(world.authorA, note.noteId, ticket);
            expect(result.status).not.toBe(200);
            expect(result.body.draft).toBeUndefined();
            const verified = verifyMeetingNoteAiTicket(ticket);
            if (!verified.ok) throw new Error('ticket did not verify');
            const [op] = await world.query<{ status: string; dispatched_at: string | null }>(
              `select status, dispatched_at::text as dispatched_at
               from public.meeting_note_ai_operations where idempotency_key = $1`,
              [verified.payload.idempotencyKey],
            );
            // The mark really committed (dispatched_at set); nothing was sent.
            expect(op.dispatched_at).not.toBeNull();
            expect(op.status).toBe('refunded');
            expect(await control.received('openai')).toBe(0);
            expect(await usedToday(world.companyA)).toBe(used);
          } finally {
            await server.kill();
          }
        },
        120_000,
      );

      it(
        'NODE_ENV=production: the start route ignores the base-URL override (the fake receives nothing; the real host is attempted through a refusing proxy)',
        async () => {
          const connects: string[] = [];
          const proxy: Server = createServer((socket: Socket) => {
            socket.once('data', (chunk) => {
              connects.push(chunk.toString('latin1').split('\r\n')[0]);
              socket.destroy();
            });
          });
          await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
          const port = (proxy.address() as { port: number }).port;
          const note = await noteWithTranscript(world.companyA, world.authorA);
          const ticket = await ticketFor(world.authorA, note.noteId);
          await control.setDefault('openai', success());
          const server = await spawnChild({
            NODE_ENV: 'production',
            NODE_USE_ENV_PROXY: '1',
            HTTPS_PROXY: `http://127.0.0.1:${port}`,
          });
          try {
            const result = await server.start(world.authorA, note.noteId, ticket);
            expect(result.status).toBe(502);
            expect(result.body.draft).toBeUndefined();
            expect(['refunded', 'failed']).toContain(result.body.status);
            expect(await control.received('openai')).toBe(0);
            expect(connects).toEqual(['CONNECT api.openai.com:443 HTTP/1.1']);
          } finally {
            await server.kill();
            await new Promise<void>((resolve) => proxy.close(() => resolve()));
          }
        },
        120_000,
      );
    });
  });
});
