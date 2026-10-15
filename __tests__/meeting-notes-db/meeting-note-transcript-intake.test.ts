import { randomUUID } from 'node:crypto';

import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as getNote, PATCH as updateNote } from '@/app/api/meeting-notes/[id]/route';
import { POST as restoreNote } from '@/app/api/meeting-notes/[id]/restore/route';
import { PUT as attachTranscript } from '@/app/api/meeting-notes/[id]/transcript/route';
import { POST as createFromTranscript } from '@/app/api/meeting-notes/transcript/route';

import { createMeetingNotesWorld, type MeetingNotesDbUser, type MeetingNotesDbWorld } from './fixtures';
import { callRoute, signInSessionCookies, useLocalSupabaseEnv, type RouteResult, type SessionCookie } from './route-session';
import { MEETING_NOTES_DB_URL } from './setup';

vi.mock('next/headers', async () => (await import('./route-session')).nextHeadersMock);

interface NoteBody {
  id: string;
  revision: number;
  title: string;
  content: string;
  summary: string | null;
  meetingDate: string;
  transcriptId: string | null;
  hasTranscript: boolean;
  transcript?: string | null;
  participants: { userId: string }[];
  actionItems: unknown[];
}

interface NoteRow extends Record<string, unknown> {
  title: string;
  content: string;
  summary: string | null;
  meeting_date: string;
  revision: string;
  transcript: string | null;
  transcript_id: string | null;
  room_id: string | null;
  edited_by: string | null;
}

interface VersionRow extends Record<string, unknown> {
  revision: string;
  title: string;
  meeting_date: string;
  participants: unknown;
  content: string;
  summary: string | null;
  editor_user_id: string;
}

const ONE_MB = 1_048_576;
const MEETING_DATE = '2026-10-13T14:00:00.000Z';

const encoder = new TextEncoder();

function file(name: string, content: string | Uint8Array): File {
  const bytes = typeof content === 'string' ? encoder.encode(content) : content;
  return new File([new Uint8Array(bytes)], name, { type: 'application/octet-stream' });
}

function form(fields: Record<string, string>, files: File[]): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.append(name, value);
  for (const f of files) data.append('file', f, f.name);
  return data;
}

/** ASCII text of exactly `bytes` bytes. */
function asciiOfSize(bytes: number, marker: string): string {
  const line = `Ana: ${marker} lorem ipsum dolor sit amet.\n`;
  return line.repeat(Math.ceil(bytes / line.length)).slice(0, bytes);
}

// Phase 6 T10 (FR-012, FR-013, BR-010, BR-011; AC-010 intake, AC-011, AC-024,
// AC-005 attach part): the real transcript routes in-process with real local
// sessions and the real RPCs of migration 20261013161204; nothing in the
// routes, the repository, or Supabase is replaced.
describe('meeting-note transcript intake (local Supabase)', () => {
  let world: MeetingNotesDbWorld;
  const sessions = new Map<string, SessionCookie[]>();

  const as = (user: MeetingNotesDbUser): SessionCookie[] => {
    const cookies = sessions.get(user.appUserId);
    if (!cookies) throw new Error(`no session for ${user.displayName}`);
    return cookies;
  };

  const upload = (cookies: SessionCookie[], data: FormData): Promise<RouteResult> =>
    callRoute(cookies, createFromTranscript, { method: 'POST', path: '/api/meeting-notes/transcript', form: data });

  const attach = (cookies: SessionCookie[], id: string, data: FormData): Promise<RouteResult> =>
    callRoute(cookies, attachTranscript, {
      method: 'PUT',
      path: `/api/meeting-notes/${id}/transcript`,
      form: data,
      params: { id },
    });

  const noteOf = (result: RouteResult): NoteBody => result.body.note as NoteBody;

  const noteRow = async (id: string): Promise<NoteRow | undefined> =>
    (
      await world.query<NoteRow>(
        `select title, content, summary, meeting_date::text as meeting_date, revision::text as revision,
                transcript, transcript_id::text as transcript_id, room_id::text as room_id, edited_by::text as edited_by
         from public.meeting_notes where id = $1`,
        [id],
      )
    )[0];

  const versionsOf = async (id: string): Promise<VersionRow[]> =>
    world.query<VersionRow>(
      `select revision::text as revision, title, meeting_date::text as meeting_date, participants, content, summary,
              editor_user_id::text as editor_user_id
       from public.meeting_note_versions where note_id = $1 order by revision`,
      [id],
    );

  const itemsOf = async (id: string) =>
    world.query(
      `select id, description, revision::text as revision, completed from public.meeting_note_action_items
       where note_id = $1 order by id`,
      [id],
    );

  const counts = async () =>
    (
      await world.query<{ notes: string; versions: string; operations: string }>(
        `select (select count(*) from public.meeting_notes where company_id = $1)::text as notes,
                (select count(*) from public.meeting_note_versions v
                   join public.meeting_notes n on n.id = v.note_id where n.company_id = $1)::text as versions,
                (select count(*) from public.meeting_note_ai_operations where company_id = $1)::text as operations`,
        [world.companyA],
      )
    )[0];

  /** A seeded note by authorA with participantA (editors: author, participant, admin), revision 1. */
  const seededNote = async (): Promise<string> =>
    (
      await world.seedNote({
        companyId: world.companyA,
        roomId: world.spaceA,
        author: world.authorA,
        participants: [world.participantA],
        itemAssignee: world.participantA,
      })
    ).noteId;

  /** A pg session running as `authenticated` with `user`'s JWT claims, inside an open transaction. */
  const openUserTransaction = async (user: MeetingNotesDbUser): Promise<Client> => {
    const tx = new Client({ connectionString: MEETING_NOTES_DB_URL });
    await tx.connect();
    await tx.query('begin');
    await tx.query(`select pg_catalog.set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: user.supabaseUid, role: 'authenticated' }),
    ]);
    await tx.query('set local role authenticated');
    return tx;
  };

  const waitForLockWaiter = async (): Promise<void> => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const [row] = await world.query<{ waiting: string }>(
        `select count(*)::text as waiting from pg_catalog.pg_stat_activity
         where wait_event_type = 'Lock' and query ilike '%meeting_note%' and pid <> pg_catalog.pg_backend_pid()`,
      );
      if (Number(row.waiting) > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('The competing request never blocked on the note lock.');
  };

  /** Clears the per-user write budgets (trusted SQL), so the suite's many uploads are not throttled. */
  const resetRateLimits = async (): Promise<void> => {
    await world.query(
      `delete from private.rate_limit_counters where user_id = any($1::uuid[]) and action like 'meeting-note:%'`,
      [[world.adminA, world.authorA, world.participantA, world.memberA, world.adminB].map((u) => u.appUserId)],
    );
  };

  beforeEach(async () => {
    await resetRateLimits();
  });

  beforeAll(async () => {
    useLocalSupabaseEnv();
    world = await createMeetingNotesWorld();
    for (const user of [world.adminA, world.authorA, world.participantA, world.memberA, world.adminB]) {
      sessions.set(user.appUserId, await signInSessionCookies(user.email));
    }
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await world?.cleanup();
  });

  it('grants EXECUTE on the transcript RPCs to authenticated only, and none on the validator', async () => {
    const rows = await world.query<{
      fn: string;
      owner: string;
      definer: boolean;
      config: string[] | null;
      anon: boolean;
      authenticated: boolean;
      service_role: boolean;
      public_role: boolean;
    }>(
      `select p.oid::regprocedure::text as fn, r.rolname as owner, p.prosecdef as definer, p.proconfig as config,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
              has_function_privilege('service_role', p.oid, 'execute') as service_role,
              exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                      where a.grantee = 0 and a.privilege_type = 'EXECUTE') as public_role
       from pg_catalog.pg_proc p join pg_catalog.pg_roles r on r.oid = p.proowner
       where p.oid in ('public.create_meeting_note_from_transcript(uuid, text, text)'::regprocedure,
                       'public.attach_meeting_note_transcript(uuid, bigint, text)'::regprocedure,
                       'private.meeting_note_validate_transcript(text)'::regprocedure)
       order by 1`,
    );
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.owner).toBe('postgres');
      expect(row.definer).toBe(true);
      expect(row.config).toEqual(['search_path=""']);
      expect(row.anon).toBe(false);
      expect(row.service_role).toBe(false);
      expect(row.public_role).toBe(false);
      expect(row.authenticated).toBe(!row.fn.startsWith('private.'));
    }

    const { error } = await world.anon.rpc('create_meeting_note_from_transcript', {
      p_room_id: world.spaceA,
      p_title: 'Anon',
      p_transcript: 'text',
    });
    expect(error?.code).toBe('42501');
  });

  it('refuses both routes without a session (401) and creates nothing', async () => {
    const before = await counts();
    const created = await upload([], form({ spaceId: world.spaceA }, [file('a.txt', 'Ana: hi')]));
    expect(created.status).toBe(401);
    const id = await seededNote();
    const attached = await attach([], id, form({ expectedRevision: '1' }, [file('a.txt', 'Ana: hi')]));
    expect(attached.status).toBe(401);
    expect((await noteRow(id))?.transcript_id).toBeNull();
    expect(Number((await counts()).notes)).toBe(Number(before.notes) + 1);
  });

  describe('AC-010: "New note from transcript"', () => {
    it('creates the note at upload: title = file name, today, transcript stored as uploaded, revision 1, one version', async () => {
      const marker = `marker-${randomUUID()}`;
      const text = `WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000 align:start\n<v Ana>Olá, ${marker}\n\n2\n00:00:05.000 --> 00:00:07.000\n<v Bruno>Decisão: seguir.\n`;
      const before = await counts();

      // A plain member (not an admin) in a space of their company; BOM + upper-case extension.
      const result = await upload(
        as(world.memberA),
        form({ spaceId: world.spaceA }, [file('Weekly sync – Q4 review.VTT', `﻿${text}`)]),
      );
      expect(result.status, JSON.stringify(result.body)).toBe(201);
      expect(JSON.stringify(result.body)).not.toContain(marker);
      const note = noteOf(result);
      expect(note.title).toBe('Weekly sync – Q4 review');
      expect(note.revision).toBe(1);
      expect(note.content).toBe('');
      expect(note.summary).toBeNull();
      expect(note.participants).toEqual([]);
      expect(note.hasTranscript).toBe(true);
      expect(note.transcriptId).toMatch(/^[0-9a-f-]{36}$/);
      expect(note.transcript).toBeUndefined();

      const row = await noteRow(note.id);
      expect(row).toMatchObject({ transcript: text, transcript_id: note.transcriptId, revision: '1', room_id: world.spaceA });
      const [today] = await world.query<{ same_day: boolean; recent: boolean }>(
        `select (meeting_date at time zone 'UTC')::date = (now() at time zone 'UTC')::date as same_day,
                abs(extract(epoch from now() - meeting_date)) < 120 as recent
         from public.meeting_notes where id = $1`,
        [note.id],
      );
      expect(today).toEqual({ same_day: true, recent: true });

      const versions = await versionsOf(note.id);
      expect(versions).toHaveLength(1);
      expect(versions[0]).toMatchObject({
        revision: '1',
        title: 'Weekly sync – Q4 review',
        content: '',
        summary: null,
        editor_user_id: world.memberA.appUserId,
      });

      const after = await counts();
      expect(Number(after.notes)).toBe(Number(before.notes) + 1);
      expect(after.operations).toBe(before.operations);

      // Every viewer of the note sees the stored transcript (BR-010), only on request.
      const viewed = await callRoute(as(world.adminA), getNote, {
        method: 'GET',
        path: `/api/meeting-notes/${note.id}?include=transcript`,
        params: { id: note.id },
      });
      expect(viewed.status).toBe(200);
      expect(noteOf(viewed).transcript).toBe(text);
    });

    it('cuts the title to 200 characters, falls back to "Transcript", and accepts exactly 1 MB', async () => {
      const long = await upload(
        as(world.authorA),
        form({ spaceId: world.spaceA }, [file(`${'é'.repeat(250)}.txt`, 'Ana: long name')]),
      );
      expect(long.status, JSON.stringify(long.body)).toBe(201);
      expect(noteOf(long).title).toBe('é'.repeat(200));

      const bare = await upload(as(world.authorA), form({ spaceId: world.spaceA }, [file('.srt', 'Ana: bare name')]));
      expect(bare.status, JSON.stringify(bare.body)).toBe(201);
      expect(noteOf(bare).title).toBe('Transcript');

      const exact = asciiOfSize(ONE_MB, 'exact');
      const full = await upload(as(world.authorA), form({ spaceId: world.spaceA }, [file('full.txt', exact)]));
      expect(full.status, JSON.stringify(full.body)).toBe(201);
      const [size] = await world.query<{ bytes: number }>(
        'select octet_length(transcript) as bytes from public.meeting_notes where id = $1',
        [noteOf(full).id],
      );
      expect(size.bytes).toBe(ONE_MB);
    });

    it('refuses a missing or foreign space and creates nothing', async () => {
      const before = await counts();
      const missing = await upload(as(world.authorA), form({}, [file('a.txt', 'Ana: hi')]));
      expect(missing.status).toBe(400);
      expect(missing.body.code).toBe('MEETING_NOTE_SPACE_INVALID');

      const foreign = await upload(as(world.authorA), form({ spaceId: world.spaceB }, [file('a.txt', 'Ana: hi')]));
      expect(foreign.status).toBe(404);
      expect(foreign.body.code).toBe('MEETING_NOTE_SPACE_NOT_FOUND');
      expect(await counts()).toEqual(before);
    });
  });

  describe('AC-010: "Attach transcript"', () => {
    it('an editor replaces the transcript and its identity at once; summary, fields, and items are unchanged', async () => {
      const id = await seededNote();
      await world.query(`update public.meeting_notes set summary = 'Seeded summary' where id = $1`, [id]);

      const first = await attach(as(world.authorA), id, form({ expectedRevision: '1' }, [file('first.txt', 'Ana: first transcript')]));
      expect(first.status, JSON.stringify(first.body)).toBe(200);
      const afterFirst = noteOf(first);
      expect(afterFirst.revision).toBe(2);
      expect(afterFirst.summary).toBe('Seeded summary');

      const before = await noteRow(id);
      const versionsBefore = await versionsOf(id);
      const itemsBefore = await itemsOf(id);
      const marker = `second-${randomUUID()}`;
      const second = await attach(
        as(world.participantA),
        id,
        form({ expectedRevision: '2' }, [file('second.srt', `1\n00:00:01,000 --> 00:00:02,000\nBruno: ${marker}\n`)]),
      );
      expect(second.status, JSON.stringify(second.body)).toBe(200);
      expect(JSON.stringify(second.body)).not.toContain(marker);
      const note = noteOf(second);
      expect(note.revision).toBe(3);
      expect(note.transcriptId).not.toBe(afterFirst.transcriptId);
      expect(note.summary).toBe('Seeded summary');

      const row = await noteRow(id);
      expect(row).toMatchObject({
        title: before?.title,
        content: before?.content,
        summary: 'Seeded summary',
        meeting_date: before?.meeting_date,
        revision: '3',
        transcript: `1\n00:00:01,000 --> 00:00:02,000\nBruno: ${marker}\n`,
        transcript_id: note.transcriptId,
        edited_by: world.participantA.appUserId,
      });
      expect(await itemsOf(id)).toEqual(itemsBefore);

      // One version per revision; its fields equal the previous version's.
      const versions = await versionsOf(id);
      expect(versions).toHaveLength(versionsBefore.length + 1);
      const [previous, latest] = versions.slice(-2);
      expect(latest).toMatchObject({ revision: '3', editor_user_id: world.participantA.appUserId });
      expect({ ...latest, revision: undefined, editor_user_id: undefined }).toEqual({
        ...previous,
        revision: undefined,
        editor_user_id: undefined,
      });
    });

    it('a restore after an attach keeps the transcript (restore never touches it)', async () => {
      const id = await seededNote();
      const attached = await attach(as(world.adminA), id, form({ expectedRevision: '1' }, [file('t.txt', 'Ana: keep me')]));
      expect(attached.status, JSON.stringify(attached.body)).toBe(200);
      const transcriptId = noteOf(attached).transcriptId;
      const [v1] = await world.query<{ id: string }>(
        'select id from public.meeting_note_versions where note_id = $1 and revision = 1',
        [id],
      );
      const restored = await callRoute(as(world.authorA), restoreNote, {
        method: 'POST',
        path: `/api/meeting-notes/${id}/restore`,
        body: { expectedRevision: 2, versionId: v1.id },
        params: { id },
      });
      expect(restored.status, JSON.stringify(restored.body)).toBe(200);
      expect(await noteRow(id)).toMatchObject({ revision: '3', transcript: 'Ana: keep me', transcript_id: transcriptId });
    });
  });

  describe('AC-024 and isolation: who may attach', () => {
    it('a non-editor member is denied (403) through the route and the RPC; the stored transcript is unchanged', async () => {
      const id = await seededNote();
      expect((await attach(as(world.authorA), id, form({ expectedRevision: '1' }, [file('t.txt', 'Ana: original')]))).status).toBe(200);
      const before = await noteRow(id);
      const versionsBefore = await versionsOf(id);

      const denied = await attach(as(world.memberA), id, form({ expectedRevision: '2' }, [file('t.txt', 'Mallory: replaced')]));
      expect(denied.status).toBe(403);
      expect(denied.body.code).toBe('MEETING_NOTE_FORBIDDEN');

      const direct = await world.memberA.client.rpc('attach_meeting_note_transcript', {
        p_note_id: id,
        p_expected_revision: 2,
        p_transcript: 'Mallory: replaced',
      });
      expect(direct.error?.code).toBe('42501');
      expect(direct.error?.message).toBe('MEETING_NOTE_FORBIDDEN');

      expect(await noteRow(id)).toEqual(before);
      expect(await versionsOf(id)).toEqual(versionsBefore);
    });

    it('another company\'s admin gets 404 (route and RPC); nothing changes', async () => {
      const id = await seededNote();
      const before = await noteRow(id);
      const denied = await attach(as(world.adminB), id, form({ expectedRevision: '1' }, [file('t.txt', 'Eve: replaced')]));
      expect(denied.status).toBe(404);
      expect(denied.body.code).toBe('MEETING_NOTE_NOT_FOUND');
      const direct = await world.adminB.client.rpc('attach_meeting_note_transcript', {
        p_note_id: id,
        p_expected_revision: 1,
        p_transcript: 'Eve: replaced',
      });
      expect(direct.error?.code).toBe('P0002');
      expect(await noteRow(id)).toEqual(before);
    });
  });

  describe('AC-005 / BR-011: attach against a stale revision', () => {
    it('a stale attach gets 409 with the newer state; nothing changes', async () => {
      const id = await seededNote();
      expect((await attach(as(world.authorA), id, form({ expectedRevision: '1' }, [file('t.txt', 'Ana: v2')]))).status).toBe(200);
      const before = await noteRow(id);
      const stale = await attach(as(world.participantA), id, form({ expectedRevision: '1' }, [file('t.txt', 'Bruno: late')]));
      expect(stale.status).toBe(409);
      expect(stale.body.code).toBe('MEETING_NOTE_STALE_REVISION');
      expect(stale.body.currentRevision).toBe(2);
      expect((stale.body.note as NoteBody).transcriptId).toBe(before?.transcript_id);
      expect(JSON.stringify(stale.body)).not.toContain('Ana: v2');
      expect(await noteRow(id)).toEqual(before);
    });

    it('attach then save at the same revision: the save gets 409; save then attach: the attach gets 409', async () => {
      const id = await seededNote();
      const loaded = noteOf(await callRoute(as(world.authorA), getNote, { method: 'GET', path: `/api/meeting-notes/${id}`, params: { id } }));
      const save = (user: MeetingNotesDbUser, revision: number, content: string) =>
        callRoute(as(user), updateNote, {
          method: 'PATCH',
          path: `/api/meeting-notes/${id}`,
          params: { id },
          body: {
            expectedRevision: revision,
            title: loaded.title,
            meetingDate: MEETING_DATE,
            content,
            participantIds: loaded.participants.map((p) => p.userId),
          },
        });

      const attached = await attach(as(world.participantA), id, form({ expectedRevision: '1' }, [file('t.txt', 'Ana: attached first')]));
      expect(attached.status).toBe(200);
      const lostSave = await save(world.adminA, 1, '<p>second loses</p>');
      expect(lostSave.status).toBe(409);
      expect(lostSave.body.currentRevision).toBe(2);
      expect(await noteRow(id)).toMatchObject({ revision: '2', transcript: 'Ana: attached first', content: loaded.content });

      const saved = await save(world.adminA, 2, '<p>saved first</p>');
      expect(saved.status).toBe(200);
      const lostAttach = await attach(as(world.authorA), id, form({ expectedRevision: '2' }, [file('t.txt', 'Ana: attached late')]));
      expect(lostAttach.status).toBe(409);
      expect(lostAttach.body.currentRevision).toBe(3);
      expect(await noteRow(id)).toMatchObject({ revision: '3', transcript: 'Ana: attached first', content: '<p>saved first</p>' });
    });

    it('competing transactions: an attach holding the note lock wins over a save, and a save over an attach', async () => {
      // attach (held open) vs save (waits on the note lock) → the save is stale.
      const first = await seededNote();
      const tx = await openUserTransaction(world.participantA);
      try {
        await tx.query('select public.attach_meeting_note_transcript($1, 1, $2)', [first, 'Ana: attach wins']);
        // .then() sends the request now (a PostgREST builder is lazy until awaited).
        const pendingSave = world.adminA.client.rpc('update_meeting_note', {
          p_note_id: first,
          p_expected_revision: 1,
          p_title: 'Save loses',
          p_meeting_date: MEETING_DATE,
          p_content: '<p>save loses</p>',
          p_participant_ids: [world.participantA.appUserId],
        }).then((outcome) => outcome);
        await waitForLockWaiter();
        await tx.query('commit');
        const loser = await pendingSave;
        expect(loser.error?.code).toBe('P0001');
        expect(loser.error?.message).toBe('MEETING_NOTE_STALE_REVISION');
        expect(JSON.parse(loser.error?.details ?? '{}')).toEqual({ current_revision: 2 });
      } finally {
        await tx.end().catch(() => undefined);
      }
      expect(await noteRow(first)).toMatchObject({ revision: '2', transcript: 'Ana: attach wins', content: '<p>Seeded content</p>' });

      // save (held open) vs attach (waits) → the attach is stale; no transcript is stored.
      const second = await seededNote();
      const saveTx = await openUserTransaction(world.authorA);
      try {
        await saveTx.query('select public.update_meeting_note($1, 1, $2, $3, $4, $5::uuid[])', [
          second,
          'Save wins',
          MEETING_DATE,
          '<p>save wins</p>',
          [world.participantA.appUserId],
        ]);
        const pendingAttach = world.participantA.client.rpc('attach_meeting_note_transcript', {
          p_note_id: second,
          p_expected_revision: 1,
          p_transcript: 'Bruno: attach loses',
        }).then((outcome) => outcome);
        await waitForLockWaiter();
        await saveTx.query('commit');
        const loser = await pendingAttach;
        expect(loser.error?.code).toBe('P0001');
        expect(loser.error?.message).toBe('MEETING_NOTE_STALE_REVISION');
      } finally {
        await saveTx.end().catch(() => undefined);
      }
      expect(await noteRow(second)).toMatchObject({ revision: '2', title: 'Save wins', transcript: null, transcript_id: null });
    });
  });

  describe('AC-011 / FR-013: invalid files are refused before any change', () => {
    const latin1Blob = (): Uint8Array => {
      const bytes = new Uint8Array(4096);
      for (let i = 0; i < bytes.length; i += 1) bytes[i] = i % 3 === 0 ? 0x41 + (i % 26) : 0xa0 + (i % 96);
      return bytes;
    };
    const pdfBytes = (): Uint8Array =>
      new Uint8Array([...encoder.encode('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n'), 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]);
    const docxBytes = (): Uint8Array =>
      new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00, ...encoder.encode('[Content_Types].xml'), 0x00, 0x00]);

    const cases: { name: string; make: () => File; status: number; code: string }[] = [
      { name: 'an empty file', make: () => file('empty.txt', ''), status: 400, code: 'MEETING_NOTE_TRANSCRIPT_EMPTY' },
      { name: 'a whitespace-only file', make: () => file('blank.vtt', ' \n\t\r\n'), status: 400, code: 'MEETING_NOTE_TRANSCRIPT_EMPTY' },
      { name: 'a BOM-only file', make: () => file('bom.txt', '﻿'), status: 400, code: 'MEETING_NOTE_TRANSCRIPT_EMPTY' },
      {
        name: 'a 1.1 MB file',
        make: () => file('big.txt', asciiOfSize(Math.round(1.1 * ONE_MB), 'big')),
        status: 413,
        code: 'MEETING_NOTE_TRANSCRIPT_TOO_LARGE',
      },
      {
        name: 'a file one byte over 1 MB',
        make: () => file('over.txt', asciiOfSize(ONE_MB + 1, 'over')),
        status: 413,
        code: 'MEETING_NOTE_TRANSCRIPT_TOO_LARGE',
      },
      { name: 'a .pdf renamed .txt', make: () => file('report.txt', pdfBytes()), status: 400, code: 'MEETING_NOTE_TRANSCRIPT_NOT_TEXT' },
      { name: 'a .docx', make: () => file('minutes.docx', docxBytes()), status: 400, code: 'MEETING_NOTE_TRANSCRIPT_INVALID_TYPE' },
      { name: 'a .docx renamed .txt', make: () => file('minutes.txt', docxBytes()), status: 400, code: 'MEETING_NOTE_TRANSCRIPT_NOT_TEXT' },
      { name: 'a Latin-1 binary blob', make: () => file('latin1.txt', latin1Blob()), status: 400, code: 'MEETING_NOTE_TRANSCRIPT_NOT_TEXT' },
      {
        name: 'Latin-1 encoded text',
        make: () => file('latin1.srt', new Uint8Array([...encoder.encode('Reuni'), 0xe3, 0x6f, 0x20, 0x64, 0x65, 0x20, 0x68, 0x6f, 0x6a, 0x65])),
        status: 400,
        code: 'MEETING_NOTE_TRANSCRIPT_NOT_TEXT',
      },
      { name: 'text with a NUL byte', make: () => file('nul.txt', 'Ana: a\u0000b'), status: 400, code: 'MEETING_NOTE_TRANSCRIPT_NOT_TEXT' },
      { name: 'text with binary control characters', make: () => file('ctl.txt', 'Ana: a\u0001\u0002b'), status: 400, code: 'MEETING_NOTE_TRANSCRIPT_NOT_TEXT' },
      { name: 'a wrong extension', make: () => file('notes.md', 'Ana: hello'), status: 400, code: 'MEETING_NOTE_TRANSCRIPT_INVALID_TYPE' },
      { name: 'no extension', make: () => file('transcript', 'Ana: hello'), status: 400, code: 'MEETING_NOTE_TRANSCRIPT_INVALID_TYPE' },
    ];

    it('each invalid file: upload creates no note, attach changes nothing, usage unchanged', async () => {
      const id = await seededNote();
      expect((await attach(as(world.authorA), id, form({ expectedRevision: '1' }, [file('ok.txt', 'Ana: stored')]))).status).toBe(200);
      const noteBefore = await noteRow(id);
      const versionsBefore = await versionsOf(id);
      const before = await counts();

      for (const testCase of cases) {
        await resetRateLimits();
        const created = await upload(as(world.authorA), form({ spaceId: world.spaceA }, [testCase.make()]));
        expect(created.status, `${testCase.name} (upload): ${JSON.stringify(created.body)}`).toBe(testCase.status);
        expect(created.body.code, testCase.name).toBe(testCase.code);
        expect(typeof created.body.error, testCase.name).toBe('string');

        const attached = await attach(as(world.authorA), id, form({ expectedRevision: '2' }, [testCase.make()]));
        expect(attached.status, `${testCase.name} (attach): ${JSON.stringify(attached.body)}`).toBe(testCase.status);
        expect(attached.body.code, testCase.name).toBe(testCase.code);
      }

      expect(await counts()).toEqual(before);
      expect(await noteRow(id)).toEqual(noteBefore);
      expect(await versionsOf(id)).toEqual(versionsBefore);
    });

    it('a malformed upload (not multipart, no file, two files, unknown field) is refused; nothing changes', async () => {
      const before = await counts();
      const json = await callRoute(as(world.authorA), createFromTranscript, {
        method: 'POST',
        path: '/api/meeting-notes/transcript',
        body: { spaceId: world.spaceA, transcript: 'Ana: hi' },
      });
      expect(json.status).toBe(415);
      expect(json.body.code).toBe('MEETING_NOTE_TRANSCRIPT_UPLOAD_INVALID');

      for (const data of [
        form({ spaceId: world.spaceA }, []),
        form({ spaceId: world.spaceA }, [file('a.txt', 'Ana: one'), file('b.txt', 'Ana: two')]),
        form({ spaceId: world.spaceA, extra: 'x' }, [file('a.txt', 'Ana: one')]),
      ]) {
        const result = await upload(as(world.authorA), data);
        expect(result.status).toBe(400);
        expect(result.body.code).toBe('MEETING_NOTE_TRANSCRIPT_UPLOAD_INVALID');
      }
      expect(await counts()).toEqual(before);
    });

    it('the database refuses a blank or oversized transcript from a direct RPC call', async () => {
      const before = await counts();
      const blank = await world.memberA.client.rpc('create_meeting_note_from_transcript', {
        p_room_id: world.spaceA,
        p_title: 'Direct',
        p_transcript: ' \n\t',
      });
      expect(blank.error?.code).toBe('22023');
      expect(blank.error?.message).toBe('MEETING_NOTE_TRANSCRIPT_EMPTY');

      const oversized = await world.memberA.client.rpc('create_meeting_note_from_transcript', {
        p_room_id: world.spaceA,
        p_title: 'Direct',
        p_transcript: 'é'.repeat(ONE_MB / 2 + 1),
      });
      expect(oversized.error?.code).toBe('22023');
      expect(oversized.error?.message).toBe('MEETING_NOTE_TRANSCRIPT_TOO_LARGE');
      expect(await counts()).toEqual(before);

      // The table check holds for trusted roles too (empty, blank, oversized).
      for (const value of ['', ' \n\t\r', 'x'.repeat(ONE_MB + 1)]) {
        await expect(
          world.query(`update public.meeting_notes set transcript = $2, transcript_id = gen_random_uuid() where company_id = $1`, [
            world.companyA,
            value,
          ]),
        ).rejects.toThrow(/meeting_notes_transcript_size_check/);
      }
    });
  });
});
