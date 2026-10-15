import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { POST as createNote } from '@/app/api/meeting-notes/route';
import { GET as getNote } from '@/app/api/meeting-notes/[id]/route';
import { POST as createItem } from '@/app/api/meeting-notes/[id]/items/route';
import { DELETE as deleteItem, PATCH as updateItem } from '@/app/api/meeting-notes/[id]/items/[itemId]/route';
import { PUT as setCompletion } from '@/app/api/meeting-notes/[id]/items/[itemId]/completion/route';

import { createMeetingNotesWorld, type MeetingNotesDbUser, type MeetingNotesDbWorld } from './fixtures';
import { callRoute, signInSessionCookies, useLocalSupabaseEnv, type RouteResult, type SessionCookie } from './route-session';

vi.mock('next/headers', async () => (await import('./route-session')).nextHeadersMock);

interface ItemBody {
  id: string;
  noteId: string;
  description: string;
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeIsCurrentMember: boolean | null;
  dueDate: string | null;
  completed: boolean;
  revision: number;
  creatorUserId: string;
}

interface ItemRow extends Record<string, unknown> {
  description: string;
  assignee_id: string | null;
  due_date: string | null;
  completed: boolean;
  revision: string;
}

// Phase 6 T3 (FR-011, BR-005; AC-008, AC-009 limits): the real action-item
// route handlers, in-process, with real local sessions. authorA's notes have
// participantA as participant; memberA is a plain member (never an editor).
describe('meeting-note action-item routes (local Supabase)', () => {
  let world: MeetingNotesDbWorld;
  const sessions = new Map<string, SessionCookie[]>();

  const as = (user: MeetingNotesDbUser): SessionCookie[] => {
    const cookies = sessions.get(user.appUserId);
    if (!cookies) throw new Error(`no session for ${user.displayName}`);
    return cookies;
  };

  const add = (user: MeetingNotesDbUser, noteId: string, body: Record<string, unknown>): Promise<RouteResult> =>
    callRoute(as(user), createItem, { method: 'POST', path: `/api/meeting-notes/${noteId}/items`, body, params: { id: noteId } });

  const edit = (user: MeetingNotesDbUser, noteId: string, itemId: string, body: Record<string, unknown>): Promise<RouteResult> =>
    callRoute(as(user), updateItem, {
      method: 'PATCH',
      path: `/api/meeting-notes/${noteId}/items/${itemId}`,
      body,
      params: { id: noteId, itemId },
    });

  const complete = (user: MeetingNotesDbUser, noteId: string, itemId: string, body: Record<string, unknown>): Promise<RouteResult> =>
    callRoute(as(user), setCompletion, {
      method: 'PUT',
      path: `/api/meeting-notes/${noteId}/items/${itemId}/completion`,
      body,
      params: { id: noteId, itemId },
    });

  const drop = (user: MeetingNotesDbUser, noteId: string, itemId: string, revision: number): Promise<RouteResult> =>
    callRoute(as(user), deleteItem, {
      method: 'DELETE',
      path: `/api/meeting-notes/${noteId}/items/${itemId}?expectedRevision=${revision}`,
      params: { id: noteId, itemId },
    });

  const itemOf = (result: RouteResult): ItemBody => result.body.item as ItemBody;

  const itemRow = async (id: string): Promise<ItemRow | undefined> =>
    (
      await world.query<ItemRow>(
        `select description, assignee_id::text as assignee_id, due_date::text as due_date, completed, revision::text as revision
         from public.meeting_note_action_items where id = $1`,
        [id],
      )
    )[0];

  const itemCount = async (noteId: string): Promise<number> =>
    Number(
      (await world.query<{ n: string }>('select count(*)::text as n from public.meeting_note_action_items where note_id = $1', [noteId]))[0].n,
    );

  const newNote = async (): Promise<string> => {
    const result = await callRoute(as(world.authorA), createNote, {
      method: 'POST',
      path: '/api/meeting-notes',
      body: {
        spaceId: world.spaceA,
        title: `Items ${randomUUID().slice(0, 6)}`,
        meetingDate: '2026-10-13T14:00:00.000Z',
        participantIds: [world.participantA.appUserId],
      },
    });
    expect(result.status, JSON.stringify(result.body)).toBe(201);
    return (result.body.note as { id: string }).id;
  };

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

  it('AC-008: an editor adds, edits, and deletes an item; each change is returned and shown', async () => {
    const noteId = await newNote();
    const added = await add(world.participantA, noteId, {
      description: '  Send the minutes  ',
      assigneeId: world.memberA.appUserId,
      dueDate: '2026-11-05',
    });
    expect(added.status, JSON.stringify(added.body)).toBe(201);
    const item = itemOf(added);
    expect(item).toMatchObject({
      noteId,
      description: 'Send the minutes',
      assigneeId: world.memberA.appUserId,
      assigneeName: world.memberA.displayName,
      assigneeIsCurrentMember: true,
      dueDate: '2026-11-05',
      completed: false,
      revision: 1,
      creatorUserId: world.participantA.appUserId,
    });

    const edited = await edit(world.authorA, noteId, item.id, {
      expectedRevision: 1,
      description: 'Send the final minutes',
      assigneeId: world.participantA.appUserId,
      dueDate: null,
    });
    expect(edited.status).toBe(200);
    expect(itemOf(edited)).toMatchObject({
      description: 'Send the final minutes',
      assigneeId: world.participantA.appUserId,
      dueDate: null,
      revision: 2,
    });

    const view = await callRoute(as(world.memberA), getNote, { method: 'GET', path: `/api/meeting-notes/${noteId}`, params: { id: noteId } });
    expect((view.body.note as { actionItems: ItemBody[] }).actionItems).toEqual([itemOf(edited)]);

    const stale = await edit(world.adminA, noteId, item.id, {
      expectedRevision: 1,
      description: 'Stale edit',
      assigneeId: null,
      dueDate: null,
    });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('MEETING_NOTE_ITEM_STALE_REVISION');
    expect(stale.body.currentRevision).toBe(2);
    expect(itemOf(stale)).toMatchObject({ description: 'Send the final minutes', revision: 2 });

    const deleted = await drop(world.adminA, noteId, item.id, 2);
    expect(deleted.status).toBe(200);
    expect(deleted.body).toMatchObject({ itemId: item.id, deleted: true });
    expect(await itemRow(item.id)).toBeUndefined();
  });

  it('AC-008: the assignee toggles completion only; other changes and other items are denied', async () => {
    const noteId = await newNote();
    const mine = itemOf(await add(world.authorA, noteId, { description: 'Assigned to member', assigneeId: world.memberA.appUserId, dueDate: '2026-11-05' }));
    const other = itemOf(await add(world.authorA, noteId, { description: 'Assigned to participant', assigneeId: world.participantA.appUserId }));
    const unassigned = itemOf(await add(world.authorA, noteId, { description: 'Unassigned' }));

    const toggled = await complete(world.memberA, noteId, mine.id, { expectedRevision: 1, completed: true });
    expect(toggled.status).toBe(200);
    expect(itemOf(toggled)).toMatchObject({ completed: true, revision: 2, description: 'Assigned to member', dueDate: '2026-11-05' });

    const before = await itemRow(mine.id);
    const denied: RouteResult[] = [];
    denied.push(await edit(world.memberA, noteId, mine.id, { expectedRevision: 2, description: 'Changed', assigneeId: world.memberA.appUserId, dueDate: '2026-11-05' }));
    denied.push(await edit(world.memberA, noteId, mine.id, { expectedRevision: 2, description: 'Assigned to member', assigneeId: world.participantA.appUserId, dueDate: '2026-11-05' }));
    denied.push(await edit(world.memberA, noteId, mine.id, { expectedRevision: 2, description: 'Assigned to member', assigneeId: world.memberA.appUserId, dueDate: '2026-12-01' }));
    denied.push(await drop(world.memberA, noteId, mine.id, 2));
    denied.push(await complete(world.memberA, noteId, other.id, { expectedRevision: 1, completed: true }));
    denied.push(await complete(world.memberA, noteId, unassigned.id, { expectedRevision: 1, completed: true }));
    denied.push(await add(world.memberA, noteId, { description: 'Self-made item' }));
    for (const result of denied) {
      expect(result.status).toBe(403);
      expect(result.body.code).toBe('MEETING_NOTE_ITEM_FORBIDDEN');
    }
    expect(await itemRow(mine.id)).toEqual(before);
    expect((await itemRow(other.id))?.completed).toBe(false);
    expect(await itemCount(noteId)).toBe(3);

    // An editor toggles any item.
    const byEditor = await complete(world.participantA, noteId, unassigned.id, { expectedRevision: 1, completed: true });
    expect(byEditor.status).toBe(200);
  });

  it('an item is only reachable under its own note, and other companies get the same 404 as a random id', async () => {
    const noteId = await newNote();
    const otherNoteId = await newNote();
    const item = itemOf(await add(world.authorA, noteId, { description: 'Scoped' }));
    const before = await itemRow(item.id);

    const strip = (r: RouteResult) => ({ status: r.status, body: { ...r.body, correlationId: null } as Record<string, unknown> });
    const attempts = async (user: MeetingNotesDbUser, note: string, id: string) => [
      strip(await edit(user, note, id, { expectedRevision: 1, description: 'x', assigneeId: null, dueDate: null })),
      strip(await complete(user, note, id, { expectedRevision: 1, completed: true })),
      strip(await drop(user, note, id, 1)),
    ];

    const reference = await attempts(world.adminA, noteId, randomUUID());
    for (const result of reference) {
      expect(result.status).toBe(404);
      expect(result.body.code).toBe('MEETING_NOTE_ITEM_NOT_FOUND');
    }
    expect(await attempts(world.adminA, otherNoteId, item.id)).toEqual(reference);
    expect(await attempts(world.adminB, noteId, item.id)).toEqual(reference);
    expect(await attempts(world.adminA, noteId, 'not-a-uuid')).toEqual(reference);
    expect(await itemRow(item.id)).toEqual(before);
  });

  describe('AC-009 limits through the route', () => {
    const cases: [string, () => Record<string, unknown>, string][] = [
      ['an empty description', () => ({ description: '' }), 'MEETING_NOTE_ITEM_DESCRIPTION_INVALID'],
      ['a blank description', () => ({ description: ' \n\t ' }), 'MEETING_NOTE_ITEM_DESCRIPTION_INVALID'],
      ['a 1,001-char description', () => ({ description: 'd'.repeat(1001) }), 'MEETING_NOTE_ITEM_DESCRIPTION_INVALID'],
      ['a NUL in the description', () => ({ description: 'a\u0000b' }), 'MEETING_NOTE_ITEM_DESCRIPTION_INVALID'],
      ['a lone surrogate in the description', () => ({ description: 'a\udc00b' }), 'MEETING_NOTE_ITEM_DESCRIPTION_INVALID'],
      ['an assignee of another company', () => ({ description: 'x', assigneeId: world.adminB.appUserId }), 'MEETING_NOTE_ITEM_ASSIGNEE_NOT_MEMBER'],
      ['a malformed assignee', () => ({ description: 'x', assigneeId: 'someone' }), 'MEETING_NOTE_ITEM_ASSIGNEE_INVALID'],
      ['an impossible due date', () => ({ description: 'x', dueDate: '2026-02-30' }), 'MEETING_NOTE_ITEM_DUE_DATE_INVALID'],
      ['a due date with a time', () => ({ description: 'x', dueDate: '2026-11-05T10:00:00Z' }), 'MEETING_NOTE_ITEM_DUE_DATE_INVALID'],
      // A real ISO calendar date that Postgres rejects (22008).
      ['a due date in year 0000', () => ({ description: 'x', dueDate: '0000-01-01' }), 'MEETING_NOTE_ITEM_DUE_DATE_INVALID'],
    ];

    it.each(cases)('adding %s → 400 and nothing stored', async (_label, body, code) => {
      const noteId = await newNote();
      const result = await add(world.authorA, noteId, body());
      expect(result.status).toBe(400);
      expect(result.body.code).toBe(code);
      expect(await itemCount(noteId)).toBe(0);
    });

    it('a 1,000-char description is accepted; the 101st item is refused for capacity', async () => {
      const noteId = await newNote();
      const ok = await add(world.authorA, noteId, { description: 'd'.repeat(1000) });
      expect(ok.status).toBe(201);
      await world.query(
        `insert into public.meeting_note_action_items (note_id, description, creator_user_id, creator_name)
         select $1, 'filler ' || g, $2, $3 from generate_series(1, 99) as g`,
        [noteId, world.authorA.appUserId, world.authorA.displayName],
      );
      const full = await add(world.authorA, noteId, { description: 'one too many' });
      expect(full.status).toBe(400);
      expect(full.body.code).toBe('MEETING_NOTE_ITEM_LIMIT_REACHED');
      expect(await itemCount(noteId)).toBe(100);
    });

    it('edit and completion validate the revision and completion flag', async () => {
      const noteId = await newNote();
      const item = itemOf(await add(world.authorA, noteId, { description: 'Validate me' }));
      const noRevision = await edit(world.authorA, noteId, item.id, { description: 'x', assigneeId: null, dueDate: null });
      expect(noRevision.body.code).toBe('MEETING_NOTE_ITEM_REVISION_REQUIRED');
      const missingAssignee = await edit(world.authorA, noteId, item.id, { expectedRevision: 1, description: 'x', dueDate: null });
      expect(missingAssignee.body.code).toBe('MEETING_NOTE_ITEM_ASSIGNEE_INVALID');
      const noFlag = await complete(world.authorA, noteId, item.id, { expectedRevision: 1 });
      expect(noFlag.body.code).toBe('MEETING_NOTE_ITEM_COMPLETED_REQUIRED');
      const badDeleteRevision = await callRoute(as(world.authorA), deleteItem, {
        method: 'DELETE',
        path: `/api/meeting-notes/${noteId}/items/${item.id}?expectedRevision=abc`,
        params: { id: noteId, itemId: item.id },
      });
      expect(badDeleteRevision.body.code).toBe('MEETING_NOTE_ITEM_REVISION_REQUIRED');
      for (const result of [noRevision, missingAssignee, noFlag, badDeleteRevision]) {
        expect(result.status).toBe(400);
      }
      expect(await itemRow(item.id)).toMatchObject({ description: 'Validate me', revision: '1', completed: false });
    });
  });
});
