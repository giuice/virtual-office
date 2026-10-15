import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  MEETING_NOTE_TABLES,
  createMeetingNotesWorld,
  noteKey,
  visibleRowCount,
  type MeetingNotesDbUser,
  type MeetingNotesDbWorld,
  type SeededNote,
} from './fixtures';

// Phase 6 T1 (AC-023, BR-001, FR-029): reads of notes, participants, versions,
// and action items are scoped to the note's own company for every role; no
// client role can insert, update, or delete any of them; company_id and the
// author fields cannot be changed by any client (PostgREST as anon, member,
// admin, service role) nor by trusted SQL. Real local Supabase: PostgREST,
// Auth sessions, RLS, grants, and triggers.
describe('meeting notes read isolation and client write denial (local Supabase)', () => {
  let world: MeetingNotesDbWorld;
  let noteA: SeededNote;
  let noteB: SeededNote;

  beforeAll(async () => {
    world = await createMeetingNotesWorld();
    noteA = await world.seedNote({
      companyId: world.companyA,
      roomId: world.spaceA,
      author: world.authorA,
      participants: [world.participantA],
      versionEditors: [world.authorA, world.participantA],
      itemAssignee: world.participantA,
    });
    noteB = await world.seedNote({
      companyId: world.companyB,
      roomId: world.spaceB,
      author: world.memberB,
      participants: [world.adminB],
      versionEditors: [world.memberB],
    });
  });

  afterAll(async () => {
    await world?.cleanup();
  });

  it('members and admins of the note company read every table of the note', async () => {
    const readers: MeetingNotesDbUser[] = [world.adminA, world.authorA, world.participantA, world.memberA];
    for (const reader of readers) {
      expect(await visibleRowCount(reader.client, 'meeting_notes', noteA.noteId)).toBe(1);
      expect(await visibleRowCount(reader.client, 'meeting_note_participants', noteA.noteId)).toBe(1);
      expect(await visibleRowCount(reader.client, 'meeting_note_versions', noteA.noteId)).toBe(2);
      expect(await visibleRowCount(reader.client, 'meeting_note_action_items', noteA.noteId)).toBe(1);
    }
  });

  it('a member and an admin of another company read nothing of the note, by id or by listing', async () => {
    for (const [outsider, ownNote] of [
      [world.memberB, noteB],
      [world.adminB, noteB],
    ] as const) {
      for (const table of MEETING_NOTE_TABLES) {
        expect(await visibleRowCount(outsider.client, table, noteA.noteId)).toBe(0);
      }
      // Listing without a filter returns only the caller's company rows.
      const { data: notes, error } = await outsider.client
        .from('meeting_notes')
        .select('id, company_id')
        .in('id', [noteA.noteId, ownNote.noteId]);
      expect(error).toBeNull();
      expect(notes?.map((row) => row.id)).toEqual([ownNote.noteId]);
      const { data: versions } = await outsider.client
        .from('meeting_note_versions')
        .select('id, note_id')
        .in('note_id', [noteA.noteId, ownNote.noteId]);
      expect(new Set(versions?.map((row) => row.note_id))).toEqual(new Set([ownNote.noteId]));
    }
    // Symmetric: company A cannot read company B's note.
    for (const table of MEETING_NOTE_TABLES) {
      expect(await visibleRowCount(world.adminA.client, table, noteB.noteId)).toBe(0);
    }
  });

  it('the anon role holds no privilege on any meeting-note table', async () => {
    for (const table of MEETING_NOTE_TABLES) {
      const { data, error } = await world.anon.from(table).select('*').eq(noteKey(table), noteA.noteId);
      expect(error?.code).toBe('42501');
      expect(data).toBeNull();
    }
  });

  it('no client role can insert, update, or delete any meeting-note row', async () => {
    const attackers: { label: string; client: MeetingNotesDbWorld['anon'] }[] = [
      { label: 'anon', client: world.anon },
      { label: 'author', client: world.authorA.client },
      { label: 'admin of the company', client: world.adminA.client },
      { label: 'admin of another company', client: world.adminB.client },
    ];
    const inserts: Record<(typeof MEETING_NOTE_TABLES)[number], Record<string, unknown>> = {
      meeting_notes: {
        company_id: world.companyA,
        room_id: world.spaceA,
        title: 'client insert',
        meeting_date: new Date().toISOString(),
        author_user_id: world.authorA.appUserId,
        author_name: 'x',
        created_by: world.authorA.appUserId,
      },
      meeting_note_participants: {
        note_id: noteA.noteId,
        user_id: world.memberA.appUserId,
        display_name: 'x',
        sort_order: 5,
      },
      meeting_note_versions: {
        note_id: noteA.noteId,
        revision: 9,
        title: 'x',
        meeting_date: new Date().toISOString(),
        editor_user_id: world.memberA.appUserId,
        editor_name: 'x',
        edited_by: world.memberA.appUserId,
      },
      meeting_note_action_items: { note_id: noteA.noteId, description: 'client insert' },
    };
    const updates: Record<(typeof MEETING_NOTE_TABLES)[number], Record<string, unknown>> = {
      meeting_notes: { title: 'client update' },
      meeting_note_participants: { sort_order: 7 },
      meeting_note_versions: { title: 'client update' },
      meeting_note_action_items: { completed: true },
    };

    for (const { label, client } of attackers) {
      for (const table of MEETING_NOTE_TABLES) {
        const inserted = await client.from(table).insert(inserts[table]);
        expect(inserted.error?.code, `${label} insert ${table}`).toBe('42501');
        const updated = await client.from(table).update(updates[table]).eq(noteKey(table), noteA.noteId);
        expect(updated.error?.code, `${label} update ${table}`).toBe('42501');
        const deleted = await client.from(table).delete().eq(noteKey(table), noteA.noteId);
        expect(deleted.error?.code, `${label} delete ${table}`).toBe('42501');
      }
      const changedCompany = await client
        .from('meeting_notes')
        .update({ company_id: world.companyB, created_by: world.memberB.appUserId })
        .eq('id', noteA.noteId);
      expect(changedCompany.error?.code, `${label} company/author update`).toBe('42501');
    }

    const [state] = await world.query<{ notes: string; participants: string; versions: string; items: string; title: string; completed: boolean }>(
      `select (select count(*) from public.meeting_notes where id = $1)::text as notes,
              (select count(*) from public.meeting_note_participants where note_id = $1)::text as participants,
              (select count(*) from public.meeting_note_versions where note_id = $1)::text as versions,
              (select count(*) from public.meeting_note_action_items where note_id = $1)::text as items,
              (select title from public.meeting_notes where id = $1) as title,
              (select completed from public.meeting_note_action_items where note_id = $1) as completed`,
      [noteA.noteId],
    );
    expect(state).toMatchObject({ notes: '1', participants: '1', versions: '2', items: '1', completed: false });
    expect(state.title).not.toBe('client update');
  });

  it('company_id and the author fields are immutable even for the service role and trusted SQL', async () => {
    const attempts: Record<string, unknown>[] = [
      { company_id: world.companyB },
      { author_user_id: world.memberA.appUserId },
      { author_name: 'Someone else' },
      { created_by: world.memberA.appUserId },
      { created_by: null },
    ];
    for (const patch of attempts) {
      const { error } = await world.service.from('meeting_notes').update(patch).eq('id', noteA.noteId);
      expect(error?.message, JSON.stringify(patch)).toContain('MEETING_NOTE_IMMUTABLE_FIELD');
    }
    await expect(
      world.query('update public.meeting_notes set company_id = $2 where id = $1', [noteA.noteId, world.companyB]),
    ).rejects.toThrow(/MEETING_NOTE_IMMUTABLE_FIELD/);
    await expect(
      world.query('update public.meeting_notes set created_by = null where id = $1', [noteA.noteId]),
    ).rejects.toThrow(/MEETING_NOTE_IMMUTABLE_FIELD/);

    // A note can only be placed in a space of its own company, and is created
    // with its live author equal to its author snapshot.
    const misplaced = await world.service.from('meeting_notes').update({ room_id: world.spaceB }).eq('id', noteA.noteId);
    expect(misplaced.error?.message).toContain('MEETING_NOTE_SPACE_OUTSIDE_COMPANY');
    const forged = await world.service.from('meeting_notes').insert({
      company_id: world.companyA,
      room_id: world.spaceA,
      title: 'forged author',
      meeting_date: new Date().toISOString(),
      author_user_id: world.authorA.appUserId,
      author_name: world.authorA.displayName,
      created_by: world.memberA.appUserId,
    });
    expect(forged.error?.message).toContain('MEETING_NOTE_AUTHOR_MISMATCH');
    const foreignRoom = await world.service.from('meeting_notes').insert({
      company_id: world.companyA,
      room_id: world.spaceB,
      title: 'foreign room',
      meeting_date: new Date().toISOString(),
      author_user_id: world.authorA.appUserId,
      author_name: world.authorA.displayName,
      created_by: world.authorA.appUserId,
    });
    expect(foreignRoom.error?.message).toContain('MEETING_NOTE_SPACE_OUTSIDE_COMPANY');
    const rewound = await world.service.from('meeting_notes').update({ revision: 1 }).eq('id', noteA.noteId);
    expect(rewound.error?.message).toContain('MEETING_NOTE_IMMUTABLE_FIELD');

    const [row] = await world.query<{ company_id: string; author_user_id: string; author_name: string; created_by: string; room_id: string }>(
      'select company_id, author_user_id, author_name, created_by, room_id from public.meeting_notes where id = $1',
      [noteA.noteId],
    );
    expect(row).toEqual({
      company_id: world.companyA,
      author_user_id: world.authorA.appUserId,
      author_name: world.authorA.displayName,
      created_by: world.authorA.appUserId,
      room_id: world.spaceA,
    });
  });

  it('versions are immutable and cannot be deleted outside the note deletion; participant identity is immutable', async () => {
    const versionId = noteA.versionIds[0];
    for (const patch of [
      { title: 'rewritten' },
      { editor_user_id: world.memberA.appUserId },
      { editor_name: 'Someone else' },
      { edited_by: world.memberA.appUserId },
      { edited_by: null },
      { participants: [] },
    ]) {
      const { error } = await world.service.from('meeting_note_versions').update(patch).eq('id', versionId);
      expect(error?.message, JSON.stringify(patch)).toContain('MEETING_NOTE_VERSION_IMMUTABLE');
    }
    const deleted = await world.service.from('meeting_note_versions').delete().eq('id', versionId);
    expect(deleted.error?.message).toContain('MEETING_NOTE_VERSION_IMMUTABLE');
    await expect(
      world.query('delete from public.meeting_note_versions where id = $1', [versionId]),
    ).rejects.toThrow(/MEETING_NOTE_VERSION_IMMUTABLE/);
    const forgedEditor = await world.service.from('meeting_note_versions').insert({
      note_id: noteA.noteId,
      revision: 3,
      title: 'forged editor',
      meeting_date: new Date().toISOString(),
      editor_user_id: world.authorA.appUserId,
      editor_name: world.authorA.displayName,
      edited_by: world.memberA.appUserId,
    });
    expect(forgedEditor.error?.message).toContain('MEETING_NOTE_VERSION_EDITOR_MISMATCH');

    // Row triggers do not fire on TRUNCATE: the statement guard rejects it for
    // every role (run in a rolled-back transaction as postgres), and the
    // service role holds no TRUNCATE privilege at all.
    for (const table of ['meeting_notes', 'meeting_note_participants', 'meeting_note_versions']) {
      await world.query('begin');
      try {
        await expect(world.query(`truncate public.${table} cascade`)).rejects.toThrow(
          /MEETING_NOTE_TRUNCATE_FORBIDDEN/,
        );
      } finally {
        await world.query('rollback');
      }
      const [{ granted }] = await world.query<{ granted: boolean }>(
        `select pg_catalog.has_table_privilege('service_role', $1, 'TRUNCATE') as granted`,
        [`public.${table}`],
      );
      expect(granted, `service_role TRUNCATE ${table}`).toBe(false);
    }

    for (const patch of [{ user_id: world.memberA.appUserId }, { display_name: 'Renamed' }, { note_id: noteB.noteId }]) {
      const { error } = await world.service
        .from('meeting_note_participants')
        .update(patch)
        .eq('note_id', noteA.noteId);
      expect(error?.message, JSON.stringify(patch)).toContain('MEETING_NOTE_PARTICIPANT_IMMUTABLE_FIELD');
    }
    expect(await visibleRowCount(world.memberA.client, 'meeting_note_versions', noteA.noteId)).toBe(2);
  });

  it('the catalog grants clients SELECT at most, keeps RLS on, and gives no role EXECUTE on the guards', async () => {
    const privileges = await world.query<{ role: string; tbl: string; priv: string; granted: boolean }>(
      `select r.role, t.tbl, p.priv,
              pg_catalog.has_table_privilege(r.role, 'public.' || t.tbl, p.priv) as granted
       from unnest(array['anon', 'authenticated']) as r(role)
       cross join unnest($1::text[]) as t(tbl)
       cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as p(priv)`,
      [MEETING_NOTE_TABLES],
    );
    const granted = privileges.filter((row) => row.granted).map((row) => `${row.role}:${row.tbl}:${row.priv}`);
    expect(granted.sort()).toEqual(MEETING_NOTE_TABLES.map((tbl) => `authenticated:${tbl}:SELECT`).sort());

    const rls = await world.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_catalog.pg_class
       where relnamespace = 'public'::regnamespace and relname = any($1::text[])`,
      [MEETING_NOTE_TABLES],
    );
    expect(rls).toHaveLength(4);
    expect(rls.every((row) => row.relrowsecurity)).toBe(true);

    const guards = await world.query<{ fn: string; owner: string; config: string[] | null; executors: string[] }>(
      `select p.proname as fn, pg_catalog.pg_get_userbyid(p.proowner) as owner, p.proconfig as config,
              array(select r from unnest(array['public', 'anon', 'authenticated', 'service_role']) as r
                    where r <> 'public' and pg_catalog.has_function_privilege(r, p.oid, 'EXECUTE')) as executors
       from pg_catalog.pg_proc as p
       where p.pronamespace = 'private'::regnamespace
         and p.proname in ('guard_meeting_note', 'guard_meeting_note_participant', 'guard_meeting_note_version',
                           'reject_meeting_note_truncate')`,
    );
    expect(guards).toHaveLength(4);
    for (const guard of guards) {
      expect(guard.owner).toBe('postgres');
      expect(guard.config).toContain('search_path=""');
      expect(guard.executors).toEqual([]);
    }
    const publicExecute = await world.query<{ acl: string | null }>(
      `select p.proacl::text as acl from pg_catalog.pg_proc as p
       where p.pronamespace = 'private'::regnamespace
         and p.proname in ('guard_meeting_note', 'guard_meeting_note_participant', 'guard_meeting_note_version',
                           'reject_meeting_note_truncate')`,
    );
    expect(publicExecute).toHaveLength(4);
    for (const { acl } of publicExecute) {
      expect(acl ?? '').not.toMatch(/(^|[{,])=X/);
    }

    const fks = await world.query<{ conname: string; confdeltype: string }>(
      `select conname, confdeltype from pg_catalog.pg_constraint
       where contype = 'f' and conname in (
         'meeting_notes_room_id_fkey', 'meeting_notes_company_id_fkey', 'meeting_notes_created_by_fkey',
         'meeting_note_versions_edited_by_fkey', 'meeting_note_versions_note_id_fkey',
         'meeting_note_participants_note_id_fkey')`,
    );
    expect(Object.fromEntries(fks.map((row) => [row.conname, row.confdeltype]))).toEqual({
      meeting_notes_room_id_fkey: 'n',
      meeting_notes_company_id_fkey: 'c',
      meeting_notes_created_by_fkey: 'n',
      meeting_note_versions_edited_by_fkey: 'n',
      meeting_note_versions_note_id_fkey: 'c',
      meeting_note_participants_note_id_fkey: 'c',
    });
  });
});
