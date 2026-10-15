import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { GET as listNotes, POST as createNote } from '@/app/api/meeting-notes/route';
import { DELETE as deleteNote, GET as getNote, PATCH as updateNote } from '@/app/api/meeting-notes/[id]/route';
import { POST as restoreNote } from '@/app/api/meeting-notes/[id]/restore/route';
import { GET as listVersions } from '@/app/api/meeting-notes/[id]/versions/route';
import { GET as getVersion } from '@/app/api/meeting-notes/[id]/versions/[versionId]/route';
import { POST as createItem } from '@/app/api/meeting-notes/[id]/items/route';
import { DELETE as deleteItem, PATCH as updateItem } from '@/app/api/meeting-notes/[id]/items/[itemId]/route';
import { PUT as setItemCompletion } from '@/app/api/meeting-notes/[id]/items/[itemId]/completion/route';
import { GET as searchNotes } from '@/app/api/meeting-notes/search/route';

import { createMeetingNotesWorld, type MeetingNotesDbUser, type MeetingNotesDbWorld } from './fixtures';
import { callRoute, signInSessionCookies, useLocalSupabaseEnv, type RouteResult, type SessionCookie } from './route-session';

vi.mock('next/headers', async () => (await import('./route-session')).nextHeadersMock);

interface NoteBody {
  id: string;
  revision: number;
  title: string;
  content: string;
  roomId: string | null;
  spaceName: string | null;
  authorName: string;
  participants: { userId: string; displayName: string; isCurrentMember: boolean }[];
  actionItems: unknown[];
  hasTranscript: boolean;
  transcript?: string | null;
  rights: { canEdit: boolean; canDelete: boolean };
}

interface NoteRow extends Record<string, unknown> {
  title: string;
  content: string;
  revision: string;
  transcript: string | null;
  transcript_id: string | null;
}

const MEETING_DATE = '2026-10-13T14:00:00.000Z';

// Phase 6 T3 (FR-001, FR-002, FR-006, FR-007, FR-009, FR-010; AC-002..AC-005,
// AC-007, AC-024 precondition): the real /api/meeting-notes route handlers,
// in-process, with real local sessions; nothing in the routes, the
// repository, or Supabase is replaced.
describe('meeting-notes routes (local Supabase)', () => {
  let world: MeetingNotesDbWorld;
  const sessions = new Map<string, SessionCookie[]>();

  const as = (user: MeetingNotesDbUser): SessionCookie[] => {
    const cookies = sessions.get(user.appUserId);
    if (!cookies) throw new Error(`no session for ${user.displayName}`);
    return cookies;
  };

  const create = (user: MeetingNotesDbUser, body: Record<string, unknown>): Promise<RouteResult> =>
    callRoute(as(user), createNote, { method: 'POST', path: '/api/meeting-notes', body });

  const update = (user: MeetingNotesDbUser, id: string, body: Record<string, unknown>): Promise<RouteResult> =>
    callRoute(as(user), updateNote, { method: 'PATCH', path: `/api/meeting-notes/${id}`, body, params: { id } });

  const restore = (user: MeetingNotesDbUser, id: string, body: Record<string, unknown>): Promise<RouteResult> =>
    callRoute(as(user), restoreNote, { method: 'POST', path: `/api/meeting-notes/${id}/restore`, body, params: { id } });

  const remove = (user: MeetingNotesDbUser, id: string, revision: number): Promise<RouteResult> =>
    callRoute(as(user), deleteNote, {
      method: 'DELETE',
      path: `/api/meeting-notes/${id}?expectedRevision=${revision}`,
      params: { id },
    });

  const read = (user: MeetingNotesDbUser, id: string, query = ''): Promise<RouteResult> =>
    callRoute(as(user), getNote, { method: 'GET', path: `/api/meeting-notes/${id}${query}`, params: { id } });

  const noteOf = (result: RouteResult): NoteBody => result.body.note as NoteBody;

  // Sessions travel through one module-level cookie jar, so route calls run
  // one at a time (never Promise.all across users).
  const inSequence = async (calls: (() => Promise<RouteResult>)[]): Promise<RouteResult[]> => {
    const results: RouteResult[] = [];
    for (const call of calls) results.push(await call());
    return results;
  };

  const noteRow = async (id: string): Promise<NoteRow | undefined> =>
    (
      await world.query<NoteRow>(
        'select title, content, revision::text as revision, transcript, transcript_id::text as transcript_id from public.meeting_notes where id = $1',
        [id],
      )
    )[0];

  const companyNoteCount = async (): Promise<number> =>
    Number(
      (await world.query<{ n: string }>('select count(*)::text as n from public.meeting_notes where company_id = $1', [world.companyA]))[0].n,
    );

  /** A note by authorA with participantA, created through the route. */
  const newNote = async (overrides: Record<string, unknown> = {}): Promise<NoteBody> => {
    const result = await create(world.authorA, {
      spaceId: world.spaceA,
      title: `Route note ${randomUUID().slice(0, 6)}`,
      meetingDate: MEETING_DATE,
      content: '<p>Initial</p>',
      participantIds: [world.participantA.appUserId],
      ...overrides,
    });
    expect(result.status, JSON.stringify(result.body)).toBe(201);
    return noteOf(result);
  };

  const fields = (note: NoteBody, overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    expectedRevision: note.revision,
    title: note.title,
    meetingDate: MEETING_DATE,
    content: note.content,
    participantIds: note.participants.map((p) => p.userId),
    ...overrides,
  });

  beforeAll(async () => {
    useLocalSupabaseEnv();
    world = await createMeetingNotesWorld();
    for (const user of [world.adminA, world.authorA, world.participantA, world.memberA, world.adminB, world.memberB]) {
      sessions.set(user.appUserId, await signInSessionCookies(user.email));
    }
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await world?.cleanup();
  });

  it('refuses every route and method without a session (401)', async () => {
    const id = randomUUID();
    const versionId = randomUUID();
    const itemId = randomUUID();
    const results = await inSequence([
      () => callRoute([], listNotes, { method: 'GET', path: `/api/meeting-notes?spaceId=${world.spaceA}` }),
      () => callRoute([], createNote, {
        method: 'POST',
        path: '/api/meeting-notes',
        body: { spaceId: world.spaceA, title: 'x', meetingDate: MEETING_DATE },
      }),
      () => callRoute([], getNote, { method: 'GET', path: `/api/meeting-notes/${id}`, params: { id } }),
      () => callRoute([], updateNote, { method: 'PATCH', path: `/api/meeting-notes/${id}`, body: {}, params: { id } }),
      () => callRoute([], deleteNote, { method: 'DELETE', path: `/api/meeting-notes/${id}?expectedRevision=1`, params: { id } }),
      () => callRoute([], restoreNote, { method: 'POST', path: `/api/meeting-notes/${id}/restore`, body: {}, params: { id } }),
      () => callRoute([], listVersions, { method: 'GET', path: `/api/meeting-notes/${id}/versions`, params: { id } }),
      () => callRoute([], getVersion, {
        method: 'GET',
        path: `/api/meeting-notes/${id}/versions/${versionId}`,
        params: { id, versionId },
      }),
      () => callRoute([], createItem, { method: 'POST', path: `/api/meeting-notes/${id}/items`, body: {}, params: { id } }),
      () => callRoute([], updateItem, {
        method: 'PATCH',
        path: `/api/meeting-notes/${id}/items/${itemId}`,
        body: {},
        params: { id, itemId },
      }),
      () => callRoute([], deleteItem, {
        method: 'DELETE',
        path: `/api/meeting-notes/${id}/items/${itemId}?expectedRevision=1`,
        params: { id, itemId },
      }),
      () => callRoute([], setItemCompletion, {
        method: 'PUT',
        path: `/api/meeting-notes/${id}/items/${itemId}/completion`,
        body: { expectedRevision: 1, completed: true },
        params: { id, itemId },
      }),
      () => callRoute([], searchNotes, { method: 'GET', path: '/api/meeting-notes/search?q=x' }),
    ]);
    // Every exported handler of every /api/meeting-notes route file.
    expect(results).toHaveLength(13);
    for (const result of results) {
      expect(result.status).toBe(401);
      expect(result.body.code).toBe('UNAUTHORIZED');
    }
  });

  it('creates a note and returns the full view with rights (FR-001, FR-005)', async () => {
    const note = await newNote();
    expect(note.revision).toBe(1);
    expect(note.roomId).toBe(world.spaceA);
    expect(note.spaceName).toMatch(/Space A/);
    expect(note.authorName).toBe(world.authorA.displayName);
    expect(note.participants).toEqual([
      { userId: world.participantA.appUserId, displayName: world.participantA.displayName, isCurrentMember: true },
    ]);
    expect(note.rights).toEqual({ canEdit: true, canDelete: true });
    expect(note.hasTranscript).toBe(false);
    expect(note.transcript).toBeUndefined();

    const views = await inSequence([
      () => read(world.participantA, note.id),
      () => read(world.memberA, note.id),
      () => read(world.adminA, note.id),
    ]);
    expect(views.map((v) => v.status)).toEqual([200, 200, 200]);
    expect(views.map((v) => noteOf(v).rights)).toEqual([
      { canEdit: true, canDelete: false },
      { canEdit: false, canDelete: false },
      { canEdit: true, canDelete: true },
    ]);
  });

  describe('AC-002: limits are rejected with a stable code and nothing is stored', () => {
    const cases: [string, () => Record<string, unknown>, string][] = [
      ['empty title', () => ({ title: '' }), 'MEETING_NOTE_TITLE_INVALID'],
      ['blank title', () => ({ title: '   ' }), 'MEETING_NOTE_TITLE_INVALID'],
      ['201-char title', () => ({ title: 'x'.repeat(201) }), 'MEETING_NOTE_TITLE_INVALID'],
      ['a NUL in the title', () => ({ title: 'a\u0000b' }), 'MEETING_NOTE_TITLE_INVALID'],
      ['a lone surrogate in the title', () => ({ title: 'a\ud800b' }), 'MEETING_NOTE_TITLE_INVALID'],
      ['missing date', () => ({ meetingDate: undefined }), 'MEETING_NOTE_DATE_REQUIRED'],
      ['invalid date', () => ({ meetingDate: 'yesterday' }), 'MEETING_NOTE_DATE_REQUIRED'],
      // ISO-valid for zod, out of range for Postgres timestamptz (22008/22009).
      ['a date in year 0000', () => ({ meetingDate: '0000-01-01T00:00:00Z' }), 'MEETING_NOTE_DATE_REQUIRED'],
      ['a date with a +16:00 offset', () => ({ meetingDate: '2026-01-01T00:00:00+16:00' }), 'MEETING_NOTE_DATE_REQUIRED'],
      ['content above 100,000 chars', () => ({ content: `<p>${'a'.repeat(100_000)}</p>` }), 'MEETING_NOTE_CONTENT_TOO_LONG'],
      [
        '51 participants',
        () => ({ participantIds: Array.from({ length: 51 }, () => randomUUID()) }),
        'MEETING_NOTE_TOO_MANY_PARTICIPANTS',
      ],
      [
        'a participant of another company',
        () => ({ participantIds: [world.memberB.appUserId] }),
        'MEETING_NOTE_PARTICIPANT_NOT_MEMBER',
      ],
      [
        'a duplicated participant',
        () => ({ participantIds: [world.participantA.appUserId, world.participantA.appUserId] }),
        'MEETING_NOTE_PARTICIPANTS_INVALID',
      ],
    ];

    it.each(cases)('create with %s → 400', async (_label, override, code) => {
      const before = await companyNoteCount();
      const result = await create(world.adminA, {
        spaceId: world.spaceA,
        title: 'Valid title',
        meetingDate: MEETING_DATE,
        content: '<p>ok</p>',
        participantIds: [],
        ...override(),
      });
      expect(result.status).toBe(400);
      expect(result.body.code).toBe(code);
      expect(typeof result.body.error).toBe('string');
      expect(await companyNoteCount()).toBe(before);
    });

    it('51 real current members are refused for count, not membership', async () => {
      const ids = await world.createMemberRows(world.companyA, 51, 'many');
      const before = await companyNoteCount();
      const result = await create(world.adminA, {
        spaceId: world.spaceA,
        title: 'Too many',
        meetingDate: MEETING_DATE,
        participantIds: ids,
      });
      expect(result.status).toBe(400);
      expect(result.body.code).toBe('MEETING_NOTE_TOO_MANY_PARTICIPANTS');
      expect(await companyNoteCount()).toBe(before);
      // 50 is accepted (boundary).
      const fifty = await create(world.adminA, {
        spaceId: world.spaceA,
        title: 'Fifty',
        meetingDate: MEETING_DATE,
        participantIds: ids.slice(0, 50),
      });
      expect(fifty.status).toBe(201);
      expect(noteOf(fifty).participants).toHaveLength(50);
    });

    it('accepts a 200-char title and content at exactly 100,000 chars after sanitization', async () => {
      const content = `<p>${'a'.repeat(99_993)}</p>`; // 100,000 chars
      const result = await create(world.adminA, {
        spaceId: world.spaceA,
        title: 't'.repeat(200),
        meetingDate: MEETING_DATE,
        // The stripped script makes the raw text longer than the limit.
        content: `${content}<script>${'x'.repeat(50)}</script>`,
      });
      expect(result.status, JSON.stringify(result.body)).toBe(201);
      const row = await noteRow(noteOf(result).id);
      expect(row?.content).toBe(content);
      expect(row?.title).toHaveLength(200);
    });

    it('rejects a space of another company like a missing one (404)', async () => {
      const before = await companyNoteCount();
      const other = await create(world.adminA, { spaceId: world.spaceB, title: 'x', meetingDate: MEETING_DATE });
      const random = await create(world.adminA, { spaceId: randomUUID(), title: 'x', meetingDate: MEETING_DATE });
      expect(other.status).toBe(404);
      expect(other.body.code).toBe('MEETING_NOTE_SPACE_NOT_FOUND');
      expect({ ...other.body, correlationId: null }).toEqual({ ...random.body, correlationId: null });
      expect(await companyNoteCount()).toBe(before);
    });

    it('an update over a limit is rejected and leaves the note unchanged', async () => {
      const note = await newNote();
      const before = await noteRow(note.id);
      for (const [override, code] of [
        [{ title: 'y'.repeat(201) }, 'MEETING_NOTE_TITLE_INVALID'],
        [{ content: 'z'.repeat(100_001) }, 'MEETING_NOTE_CONTENT_TOO_LONG'],
        [{ participantIds: [world.memberB.appUserId] }, 'MEETING_NOTE_PARTICIPANT_NOT_MEMBER'],
        [{ expectedRevision: 0 }, 'MEETING_NOTE_REVISION_REQUIRED'],
        [{ meetingDate: null }, 'MEETING_NOTE_DATE_REQUIRED'],
      ] as const) {
        const result = await update(world.authorA, note.id, fields(note, override));
        expect(result.status).toBe(400);
        expect(result.body.code).toBe(code);
      }
      expect(await noteRow(note.id)).toEqual(before);
    });
  });

  it('AC-003 (write side): stored content keeps the allowed formatting and loses unsafe markup', async () => {
    const dirty = [
      '<h2 onclick="steal()">Agenda</h2>',
      '<p style="color:red">Hello <strong>bold</strong> <em>it</em><script>alert(1)</script></p>',
      '<img src="x" onerror="alert(1)">',
      '<ul><li>one</li></ul><ol><li>first</li></ol>',
      '<ul data-type="taskList"><li data-checked="true" data-type="taskItem"><label><input type="checkbox" checked="checked"><span></span></label><div><p>done</p></div></li></ul>',
      '<p><a href="javascript:alert(1)">bad</a> <a href="https://example.com/x" target="_blank">good</a> <a href="mailto:team@example.com">mail</a> <a href="data:text/html,hi">data</a></p>',
      '<iframe src="https://evil.example"></iframe>',
    ].join('');
    const note = await newNote({ content: dirty });
    const stored = (await noteRow(note.id))?.content ?? '';

    for (const forbidden of ['<script', 'alert(1)', 'onerror', 'onclick', 'javascript:', 'data:', 'style=', '<iframe', '<img']) {
      expect(stored).not.toContain(forbidden);
    }
    for (const kept of [
      '<h2>Agenda</h2>',
      '<strong>bold</strong>',
      '<em>it</em>',
      '<ul><li>one</li></ul>',
      '<ol><li>first</li></ol>',
      '<ul data-type="taskList"><li data-checked="true" data-type="taskItem"><label><input type="checkbox" checked="checked" />',
      '<a href="https://example.com/x" rel="noopener noreferrer nofollow" target="_blank">good</a>',
      '<a href="mailto:team@example.com" rel="noopener noreferrer nofollow">mail</a>',
    ]) {
      expect(stored).toContain(kept);
    }
    expect(note.content).toBe(stored);

    // The update path sanitizes too.
    const updated = await update(world.authorA, note.id, fields(note, { content: '<p><a href=" JaVaScRiPt:alert(2)">x</a><svg onload="alert(2)"></svg></p>' }));
    expect(updated.status).toBe(200);
    const after = (await noteRow(note.id))?.content ?? '';
    expect(after).toBe('<p><a>x</a></p>');
  });

  it('flags participants who are no longer members as former members (FR-030); NUL is stripped from content', async () => {
    const [gone] = await world.createMemberRows(world.companyA, 1, 'gone');
    const note = await newNote({
      participantIds: [world.participantA.appUserId, gone],
      content: '<p>a\u0000b</p>',
    });
    expect((await noteRow(note.id))?.content).toBe('<p>ab</p>');
    // A lone surrogate cannot be stored: it becomes U+FFFD (not a 500); a
    // +15:59 offset is the largest Postgres accepts.
    const surrogate = await newNote({ content: '<p>a\ud800b</p>', meetingDate: '2026-01-01T00:00:00+15:59' });
    expect((await noteRow(surrogate.id))?.content).toBe(`<p>a${String.fromCharCode(0xfffd)}b</p>`);
    await world.query('delete from public.users where id = $1', [gone]);
    const view = noteOf(await read(world.memberA, note.id));
    expect(view.participants.map((p) => [p.userId, p.isCurrentMember])).toEqual([
      [world.participantA.appUserId, true],
      [gone, false],
    ]);

    // Versions too (block B review B-5): the snapshot name stays, and the
    // version route flags who is no longer a member of the note's company.
    const versions = await callRoute(as(world.memberA), listVersions, {
      method: 'GET',
      path: `/api/meeting-notes/${note.id}/versions`,
      params: { id: note.id },
    });
    expect(versions.status).toBe(200);
    const [v1] = versions.body.versions as { id: string; revision: number }[];
    expect(v1.revision).toBe(1);
    const version = await callRoute(as(world.memberA), getVersion, {
      method: 'GET',
      path: `/api/meeting-notes/${note.id}/versions/${v1.id}`,
      params: { id: note.id, versionId: v1.id },
    });
    expect(version.status).toBe(200);
    const snapshotName = (userId: string) => note.participants.find((p) => p.userId === userId)?.displayName;
    expect((version.body.version as { participants: NoteBody['participants'] }).participants).toEqual([
      { userId: world.participantA.appUserId, displayName: snapshotName(world.participantA.appUserId), isCurrentMember: true },
      { userId: gone, displayName: snapshotName(gone), isCurrentMember: false },
    ]);
  });

  describe('AC-004: edit rights through the routes', () => {
    it('the participant and a company admin edit; a non-participant cannot edit, self-add, restore, or delete', async () => {
      const note = await newNote();

      const byParticipant = await update(world.participantA, note.id, fields(note, { content: '<p>by participant</p>' }));
      expect(byParticipant.status).toBe(200);
      const afterParticipant = noteOf(byParticipant);
      expect(afterParticipant.revision).toBe(2);

      const byAdmin = await update(world.adminA, note.id, fields(afterParticipant, { content: '<p>by admin</p>' }));
      expect(byAdmin.status).toBe(200);
      const current = noteOf(byAdmin);
      expect(current.revision).toBe(3);

      const before = await noteRow(note.id);
      const versionId = ((await world.query<{ id: string }>(
        'select id from public.meeting_note_versions where note_id = $1 and revision = 1',
        [note.id],
      ))[0]).id;

      const denied = await inSequence([
        () => update(world.memberA, note.id, fields(current, { content: '<p>by outsider</p>' })),
        () => update(world.memberA, note.id, fields(current, {
          participantIds: [...current.participants.map((p) => p.userId), world.memberA.appUserId],
        })),
        () => restore(world.memberA, note.id, { expectedRevision: current.revision, versionId }),
        () => remove(world.memberA, note.id, current.revision),
        () => remove(world.participantA, note.id, current.revision),
      ]);
      for (const result of denied) {
        expect(result.status).toBe(403);
        expect(result.body.code).toBe('MEETING_NOTE_FORBIDDEN');
      }
      expect(await noteRow(note.id)).toEqual(before);
    });

    it('company B (admin and member) gets the same 404 as a random or malformed id', async () => {
      const note = await newNote();
      const versionId = ((await world.query<{ id: string }>(
        'select id from public.meeting_note_versions where note_id = $1',
        [note.id],
      ))[0]).id;
      const before = await noteRow(note.id);
      const randomId = randomUUID();

      const attempts = async (user: MeetingNotesDbUser, id: string): Promise<RouteResult[]> => [
        await read(user, id),
        await update(user, id, fields(note)),
        await restore(user, id, { expectedRevision: 1, versionId }),
        await remove(user, id, 1),
        await callRoute(as(user), listVersions, { method: 'GET', path: `/api/meeting-notes/${id}/versions`, params: { id } }),
        await callRoute(as(user), getVersion, {
          method: 'GET',
          path: `/api/meeting-notes/${id}/versions/${versionId}`,
          params: { id, versionId },
        }),
        await callRoute(as(user), createItem, {
          method: 'POST',
          path: `/api/meeting-notes/${id}/items`,
          body: { description: 'x' },
          params: { id },
        }),
      ];
      const strip = (results: RouteResult[]) =>
        results.map((r) => ({ status: r.status, body: { ...r.body, correlationId: null } as Record<string, unknown> }));

      const reference = strip(await attempts(world.adminA, randomId));
      for (const result of reference) {
        expect(result.status).toBe(404);
        expect(result.body.code).toBe('MEETING_NOTE_NOT_FOUND');
      }
      expect(strip(await attempts(world.adminB, note.id))).toEqual(reference);
      expect(strip(await attempts(world.memberB, note.id))).toEqual(reference);
      expect(strip(await attempts(world.adminA, 'not-a-uuid'))).toEqual(reference);
      expect(await noteRow(note.id)).toEqual(before);

      const list = await callRoute(as(world.adminB), listNotes, { method: 'GET', path: `/api/meeting-notes?spaceId=${world.spaceA}` });
      expect(list.status).toBe(200);
      expect(list.body.items).toEqual([]);
    });
  });

  describe('AC-005: concurrent saves at the same revision', () => {
    it('the second save gets 409 with the newer state and the first change stays', async () => {
      const note = await newNote();
      const first = await update(world.participantA, note.id, fields(note, { content: '<p>first wins</p>', title: 'First' }));
      expect(first.status).toBe(200);

      const second = await update(world.adminA, note.id, fields(note, { content: '<p>second loses</p>', title: 'Second' }));
      expect(second.status).toBe(409);
      expect(second.body.code).toBe('MEETING_NOTE_STALE_REVISION');
      expect(second.body.currentRevision).toBe(2);
      const current = second.body.note as NoteBody;
      expect(current.revision).toBe(2);
      expect(current.title).toBe('First');
      expect(current.content).toBe('<p>first wins</p>');
      expect(current.rights).toEqual({ canEdit: true, canDelete: true });

      const row = await noteRow(note.id);
      expect(row).toMatchObject({ title: 'First', content: '<p>first wins</p>', revision: '2' });
    });

    it('a restore at a stale revision gets 409 with the newer state; a current one restores', async () => {
      const note = await newNote({ content: '<p>v1</p>' });
      const saved = await update(world.authorA, note.id, fields(note, { content: '<p>v2</p>' }));
      expect(saved.status).toBe(200);
      const versions = await callRoute(as(world.memberA), listVersions, {
        method: 'GET',
        path: `/api/meeting-notes/${note.id}/versions`,
        params: { id: note.id },
      });
      expect(versions.status).toBe(200);
      const list = versions.body.versions as { id: string; revision: number; editorName: string }[];
      expect(list.map((v) => v.revision)).toEqual([2, 1]);
      expect(list[0].editorName).toBe(world.authorA.displayName);
      const v1 = list[1];

      const version = await callRoute(as(world.memberA), getVersion, {
        method: 'GET',
        path: `/api/meeting-notes/${note.id}/versions/${v1.id}`,
        params: { id: note.id, versionId: v1.id },
      });
      expect(version.status).toBe(200);
      expect(version.body.version).toMatchObject({ revision: 1, content: '<p>v1</p>' });

      const stale = await restore(world.participantA, note.id, { expectedRevision: 1, versionId: v1.id });
      expect(stale.status).toBe(409);
      expect((stale.body.note as NoteBody).content).toBe('<p>v2</p>');

      const restored = await restore(world.participantA, note.id, { expectedRevision: 2, versionId: v1.id });
      expect(restored.status).toBe(200);
      expect(noteOf(restored)).toMatchObject({ revision: 3, content: '<p>v1</p>' });

      const missingVersion = await restore(world.participantA, note.id, { expectedRevision: 3, versionId: randomUUID() });
      expect(missingVersion.status).toBe(404);
      expect(missingVersion.body.code).toBe('MEETING_NOTE_VERSION_NOT_FOUND');
    });
  });

  it('AC-024 precondition: non-editor writes are denied and the stored transcript is unchanged; viewers read it', async () => {
    const note = await newNote();
    await world.query(
      `update public.meeting_notes set transcript = 'Speaker: hello', transcript_id = gen_random_uuid() where id = $1`,
      [note.id],
    );
    const before = await noteRow(note.id);
    const current = noteOf(await read(world.authorA, note.id));
    expect(current.hasTranscript).toBe(true);
    expect(current.transcript).toBeUndefined();

    const denied = await inSequence([
      () => update(world.memberA, note.id, fields(current)),
      () => restore(world.memberA, note.id, { expectedRevision: current.revision, versionId: randomUUID() }),
      () => remove(world.memberA, note.id, current.revision),
      () => callRoute(as(world.memberA), createItem, {
        method: 'POST',
        path: `/api/meeting-notes/${note.id}/items`,
        body: { description: 'not allowed' },
        params: { id: note.id },
      }),
    ]);
    expect(denied.map((r) => r.status)).toEqual([403, 403, 403, 403]);
    expect(denied.map((r) => r.body.code)).toEqual([
      'MEETING_NOTE_FORBIDDEN',
      'MEETING_NOTE_FORBIDDEN',
      'MEETING_NOTE_FORBIDDEN',
      'MEETING_NOTE_ITEM_FORBIDDEN',
    ]);
    expect(await noteRow(note.id)).toEqual(before);

    const withTranscript = await read(world.memberA, note.id, '?include=transcript');
    expect(noteOf(withTranscript).transcript).toBe('Speaker: hello');
  });

  it('lists a space newest meeting date first without content or transcript', async () => {
    const space = await world.createSpace(world.companyA, `List ${randomUUID().slice(0, 4)}`, world.adminA);
    const older = await newNote({ spaceId: space, meetingDate: '2026-09-13T10:00:00.000Z', title: 'Older' });
    const newer = await newNote({ spaceId: space, meetingDate: '2026-10-13T10:00:00.000Z', title: 'Newer' });
    await world.query(`update public.meeting_notes set transcript = 'secret words', transcript_id = gen_random_uuid() where id = $1`, [newer.id]);

    const page = await callRoute(as(world.memberA), listNotes, {
      method: 'GET',
      path: `/api/meeting-notes?spaceId=${space}&limit=1`,
    });
    expect(page.status).toBe(200);
    const items = page.body.items as Record<string, unknown>[];
    expect(items.map((i) => i.id)).toEqual([newer.id]);
    expect(items[0]).not.toHaveProperty('content');
    expect(items[0]).not.toHaveProperty('transcript');
    expect(JSON.stringify(page.body)).not.toContain('secret words');
    expect(items[0].hasTranscript).toBe(true);
    expect(page.body).toMatchObject({ hasMore: true, nextCursor: 1, totalCount: 2 });

    const next = await callRoute(as(world.memberA), listNotes, {
      method: 'GET',
      path: `/api/meeting-notes?spaceId=${space}&limit=1&cursor=1`,
    });
    expect((next.body.items as Record<string, unknown>[]).map((i) => i.id)).toEqual([older.id]);
    expect(next.body.hasMore).toBe(false);

    const bad = await callRoute(as(world.memberA), listNotes, { method: 'GET', path: '/api/meeting-notes?spaceId=nope' });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('MEETING_NOTE_SPACE_INVALID');
  });

  it('the author deletes a note at the current revision; everything is gone (FR-010)', async () => {
    const note = await newNote();
    const stale = await remove(world.authorA, note.id, 7);
    expect(stale.status).toBe(409);
    const missingRevision = await callRoute(as(world.authorA), deleteNote, {
      method: 'DELETE',
      path: `/api/meeting-notes/${note.id}`,
      params: { id: note.id },
    });
    expect(missingRevision.status).toBe(400);
    expect(missingRevision.body.code).toBe('MEETING_NOTE_REVISION_REQUIRED');

    const deleted = await remove(world.authorA, note.id, 1);
    expect(deleted.status).toBe(200);
    expect(deleted.body).toMatchObject({ noteId: note.id, deleted: true });
    expect(await noteRow(note.id)).toBeUndefined();
    const leftovers = await world.query<{ n: string }>(
      `select ((select count(*) from public.meeting_note_versions where note_id = $1)
             + (select count(*) from public.meeting_note_participants where note_id = $1)
             + (select count(*) from public.meeting_note_action_items where note_id = $1))::text as n`,
      [note.id],
    );
    expect(leftovers[0].n).toBe('0');
    expect((await read(world.authorA, note.id)).status).toBe(404);
  });

  it('rejects a non-JSON body (415) and a non-object JSON body (400)', async () => {
    const note = await newNote();
    const notJson = await callRoute(as(world.authorA), updateNote, {
      method: 'PATCH',
      path: `/api/meeting-notes/${note.id}`,
      params: { id: note.id },
    });
    expect(notJson.status).toBe(415);
    const array = await update(world.authorA, note.id, [] as unknown as Record<string, unknown>);
    expect(array.status).toBe(400);
    expect(array.body.code).toBe('BAD_REQUEST');
  });
});
