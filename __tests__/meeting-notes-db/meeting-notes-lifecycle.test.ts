import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  MEETING_NOTE_TABLES,
  createMeetingNotesWorld,
  visibleRowCount,
  type MeetingNotesDbWorld,
} from './fixtures';

interface NoteRow extends Record<string, unknown> {
  company_id: string;
  room_id: string | null;
  author_user_id: string;
  author_name: string;
  created_by: string | null;
}

interface VersionRow extends Record<string, unknown> {
  id: string;
  editor_user_id: string;
  editor_name: string;
  edited_by: string | null;
}

// Phase 6 T1 lifecycle contract (FR-028, FR-029, FR-030, BR-001, BR-007):
// AC-020 space deletion keeps notes (company and author intact) and company
// deletion removes them; AC-021 a participant who leaves the company loses
// read access, keeps their place and snapshot, regains read on rejoining, and
// keeps the snapshot after user deletion; AC-031 deleting the author and an
// editor succeeds and leaves notes, versions, and historical snapshots intact.
// Real local Supabase: PostgREST sessions, RLS, FK actions, triggers, and the
// product member-removal RPC.
describe('meeting notes lifecycle (local Supabase)', () => {
  let world: MeetingNotesDbWorld;

  beforeAll(async () => {
    world = await createMeetingNotesWorld();
  });

  afterAll(async () => {
    await world?.cleanup();
  });

  const noteRow = async (noteId: string): Promise<NoteRow | undefined> =>
    (
      await world.query<NoteRow>(
        'select company_id, room_id, author_user_id, author_name, created_by from public.meeting_notes where id = $1',
        [noteId],
      )
    )[0];

  const versionRows = async (noteId: string): Promise<VersionRow[]> =>
    world.query<VersionRow>(
      `select id, editor_user_id, editor_name, edited_by from public.meeting_note_versions
       where note_id = $1 order by revision`,
      [noteId],
    );

  it('AC-020: deleting a space keeps its notes with company and author, readable only inside the company', async () => {
    const space = await world.createSpace(world.companyA, 'Doomed space', world.adminA);
    const note = await world.seedNote({
      companyId: world.companyA,
      roomId: space,
      author: world.authorA,
      participants: [world.participantA],
      versionEditors: [world.authorA, world.participantA],
    });

    await world.query('delete from public.spaces where id = $1', [space]);

    expect(await noteRow(note.noteId)).toEqual({
      company_id: world.companyA,
      room_id: null,
      author_user_id: world.authorA.appUserId,
      author_name: world.authorA.displayName,
      created_by: world.authorA.appUserId,
    });
    for (const reader of [world.memberA, world.adminA]) {
      expect(await visibleRowCount(reader.client, 'meeting_notes', note.noteId)).toBe(1);
      expect(await visibleRowCount(reader.client, 'meeting_note_participants', note.noteId)).toBe(1);
      expect(await visibleRowCount(reader.client, 'meeting_note_versions', note.noteId)).toBe(2);
      expect(await visibleRowCount(reader.client, 'meeting_note_action_items', note.noteId)).toBe(1);
    }
    for (const outsider of [world.memberB, world.adminB]) {
      for (const table of MEETING_NOTE_TABLES) {
        expect(await visibleRowCount(outsider.client, table, note.noteId)).toBe(0);
      }
    }
  });

  it('AC-020: deleting a company deletes its notes, participants, versions, and items', async () => {
    const companyC = await world.createCompany('Company C');
    const adminC = await world.createUser('admin-c', companyC, 'admin');
    const memberC = await world.createUser('member-c', companyC, 'member');
    const spaceC = await world.createSpace(companyC, 'Space C', adminC);
    const withSpace = await world.seedNote({
      companyId: companyC,
      roomId: spaceC,
      author: memberC,
      participants: [adminC],
      versionEditors: [memberC, adminC],
      itemAssignee: adminC,
    });
    const withoutSpace = await world.seedNote({
      companyId: companyC,
      roomId: null,
      author: adminC,
      participants: [memberC],
    });
    const survivor = await world.seedNote({ companyId: world.companyA, roomId: world.spaceA, author: world.authorA });

    await world.query('delete from public.companies where id = $1', [companyC]);

    const [counts] = await world.query<{ notes: string; participants: string; versions: string; items: string }>(
      `select (select count(*) from public.meeting_notes where id = any($1::uuid[]))::text as notes,
              (select count(*) from public.meeting_note_participants where note_id = any($1::uuid[]))::text as participants,
              (select count(*) from public.meeting_note_versions where note_id = any($1::uuid[]))::text as versions,
              (select count(*) from public.meeting_note_action_items where note_id = any($1::uuid[]))::text as items`,
      [[withSpace.noteId, withoutSpace.noteId]],
    );
    expect(counts).toEqual({ notes: '0', participants: '0', versions: '0', items: '0' });
    expect(await noteRow(survivor.noteId)).toBeDefined();
    // The users themselves survive the company deletion (users.company_id SET NULL).
    const users = await world.query<{ company_id: string | null }>(
      'select company_id from public.users where id = any($1::uuid[])',
      [[adminC.appUserId, memberC.appUserId]],
    );
    expect(users).toEqual([{ company_id: null }, { company_id: null }]);
  });

  it('AC-021: a participant who leaves loses read, keeps their place and snapshot, and regains read on rejoining', async () => {
    const leaver = await world.createUser('leaver', world.companyA, 'member');
    const note = await world.seedNote({
      companyId: world.companyA,
      roomId: world.spaceA,
      author: world.authorA,
      participants: [leaver, world.participantA],
      versionEditors: [world.authorA, leaver],
      itemAssignee: leaver,
    });
    expect(await visibleRowCount(leaver.client, 'meeting_notes', note.noteId)).toBe(1);

    // Product removal path (clears users.company_id under its own locks).
    const [removal] = await world.query<{ result: { ok: boolean } }>(
      'select public.remove_company_member_and_presence($1, $2, $3) as result',
      [world.adminA.appUserId, leaver.appUserId, world.companyA],
    );
    expect(removal.result.ok).toBe(true);

    for (const table of MEETING_NOTE_TABLES) {
      expect(await visibleRowCount(leaver.client, table, note.noteId)).toBe(0);
    }
    // Remaining members still see the departed participant's place and snapshot.
    const { data: participants, error } = await world.memberA.client
      .from('meeting_note_participants')
      .select('user_id, display_name, sort_order')
      .eq('note_id', note.noteId)
      .order('sort_order');
    expect(error).toBeNull();
    expect(participants).toEqual([
      { user_id: leaver.appUserId, display_name: leaver.displayName, sort_order: 0 },
      { user_id: world.participantA.appUserId, display_name: world.participantA.displayName, sort_order: 1 },
    ]);

    // The same users.id rejoins the same company (trusted fixture write of the
    // membership column; the RLS contract depends only on users.company_id).
    await world.query('update public.users set company_id = $1 where id = $2', [world.companyA, leaver.appUserId]);
    expect(await visibleRowCount(leaver.client, 'meeting_notes', note.noteId)).toBe(1);
    expect(await visibleRowCount(leaver.client, 'meeting_note_participants', note.noteId)).toBe(2);
    expect(await visibleRowCount(leaver.client, 'meeting_note_versions', note.noteId)).toBe(2);
    expect(await visibleRowCount(leaver.client, 'meeting_note_action_items', note.noteId)).toBe(1);

    // Joining another company does not grant read on company A's notes.
    await world.query('update public.users set company_id = $1 where id = $2', [world.companyB, leaver.appUserId]);
    expect(await visibleRowCount(leaver.client, 'meeting_notes', note.noteId)).toBe(0);

    // After the user row is deleted, the participant keeps their place and
    // snapshot, and the version they edited keeps its editor snapshot.
    const versionsBefore = await versionRows(note.noteId);
    await world.query('delete from public.users where id = $1', [leaver.appUserId]);
    const { data: afterDelete } = await world.memberA.client
      .from('meeting_note_participants')
      .select('user_id, display_name')
      .eq('note_id', note.noteId)
      .order('sort_order');
    expect(afterDelete).toEqual([
      { user_id: leaver.appUserId, display_name: leaver.displayName },
      { user_id: world.participantA.appUserId, display_name: world.participantA.displayName },
    ]);
    const versionsAfter = await versionRows(note.noteId);
    expect(versionsAfter).toEqual([
      versionsBefore[0],
      { ...versionsBefore[1], edited_by: null },
    ]);
    expect(versionsAfter[1]).toMatchObject({ editor_user_id: leaver.appUserId, editor_name: leaver.displayName });
  });

  it('AC-031: deleting the author and an editor succeeds and keeps notes, versions, and snapshots', async () => {
    const author = await world.createUser('doomed-author', world.companyA, 'member');
    const editor = await world.createUser('doomed-editor', world.companyA, 'member');
    const note = await world.seedNote({
      companyId: world.companyA,
      roomId: world.spaceA,
      author,
      participants: [editor],
      versionEditors: [author, editor],
    });
    await world.query('delete from public.users where id = any($1::uuid[])', [[author.appUserId, editor.appUserId]]);

    expect(await noteRow(note.noteId)).toEqual({
      company_id: world.companyA,
      room_id: world.spaceA,
      author_user_id: author.appUserId,
      author_name: author.displayName,
      created_by: null,
    });
    expect(await versionRows(note.noteId)).toEqual([
      { id: note.versionIds[0], editor_user_id: author.appUserId, editor_name: author.displayName, edited_by: null },
      { id: note.versionIds[1], editor_user_id: editor.appUserId, editor_name: editor.displayName, edited_by: null },
    ]);
    // Company members still read the note and its full history.
    expect(await visibleRowCount(world.memberA.client, 'meeting_notes', note.noteId)).toBe(1);
    expect(await visibleRowCount(world.memberA.client, 'meeting_note_versions', note.noteId)).toBe(2);

    // Historical fields stay unchangeable after the live references are gone.
    const noteAttempt = await world.service
      .from('meeting_notes')
      .update({ author_name: 'Rewritten', author_user_id: world.memberA.appUserId })
      .eq('id', note.noteId);
    expect(noteAttempt.error?.message).toContain('MEETING_NOTE_IMMUTABLE_FIELD');
    const relink = await world.service
      .from('meeting_notes')
      .update({ created_by: world.memberA.appUserId })
      .eq('id', note.noteId);
    expect(relink.error?.message).toContain('MEETING_NOTE_IMMUTABLE_FIELD');
    const versionAttempt = await world.service
      .from('meeting_note_versions')
      .update({ editor_name: 'Rewritten' })
      .eq('note_id', note.noteId);
    expect(versionAttempt.error?.message).toContain('MEETING_NOTE_VERSION_IMMUTABLE');
    const clientAttempt = await world.adminA.client
      .from('meeting_notes')
      .update({ author_name: 'Rewritten' })
      .eq('id', note.noteId);
    expect(clientAttempt.error?.code).toBe('42501');
    expect((await noteRow(note.noteId))?.author_name).toBe(author.displayName);
  });
});
