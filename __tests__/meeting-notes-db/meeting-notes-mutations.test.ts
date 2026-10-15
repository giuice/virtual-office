import { randomUUID } from 'node:crypto';

import type { PostgrestError } from '@supabase/supabase-js';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createMeetingNotesWorld, type MeetingNotesDbUser, type MeetingNotesDbWorld } from './fixtures';
import { MEETING_NOTES_DB_URL } from './setup';

interface MutationResult {
  note_id: string;
  revision: number;
  version_id: string;
}

interface RpcOutcome<T> {
  data: T | null;
  error: PostgrestError | null;
}

interface NoteState extends Record<string, unknown> {
  company_id: string;
  room_id: string | null;
  title: string;
  meeting_date: string;
  content: string;
  summary: string | null;
  revision: string;
  transcript: string | null;
  transcript_id: string | null;
  author_user_id: string;
  author_name: string;
  created_by: string | null;
  edited_by: string | null;
}

interface ParticipantRow extends Record<string, unknown> {
  user_id: string;
  display_name: string;
  sort_order: number;
  added_at: string;
}

interface VersionState extends Record<string, unknown> {
  id: string;
  revision: string;
  title: string;
  meeting_date: string;
  participants: { user_id: string; display_name: string }[];
  content: string;
  summary: string | null;
  editor_user_id: string;
  editor_name: string;
  edited_by: string | null;
  created_at: string;
}

const MUTATION_RPCS = [
  'create_meeting_note(uuid,text,timestamp with time zone,text,uuid[])',
  'update_meeting_note(uuid,bigint,text,timestamp with time zone,text,uuid[])',
  'restore_meeting_note_version(uuid,bigint,uuid)',
  'delete_meeting_note(uuid,bigint)',
] as const;

const INTERNAL_HELPERS = [
  'private.meeting_note_lock_caller()',
  'private.meeting_note_validate_fields(text,timestamp with time zone,text)',
  'private.meeting_note_authorize(uuid,bigint,text)',
  'private.meeting_note_write_participants(uuid,jsonb)',
  'private.meeting_note_replace_participants(uuid,uuid,uuid[])',
  'private.meeting_note_insert_version(uuid,uuid,text)',
] as const;

const MEETING_DATE = '2026-10-01T14:00:00.000Z';

// Phase 6 T17 (FR-001, FR-006..FR-010, FR-030, BR-002..BR-004, BR-011): the
// note write RPCs are the only client write path. Every call goes through real
// PostgREST sessions of local users (or, for forced interleavings, a pg
// connection running as `authenticated` with that user's JWT claims), against
// the real local database, RLS, grants, triggers, and FK cascades.
describe('meeting note mutation RPCs (local Supabase)', () => {
  let world: MeetingNotesDbWorld;
  let privateSpaceA: string;

  beforeAll(async () => {
    world = await createMeetingNotesWorld();
    privateSpaceA = await world.createSpace(world.companyA, 'Private space', world.adminA);
    await world.query(`update public.spaces set access_control = '{"isPublic": false}'::jsonb where id = $1`, [
      privateSpaceA,
    ]);
  });

  afterAll(async () => {
    await world?.cleanup();
  });

  const call = async <T = MutationResult>(
    user: MeetingNotesDbUser | null,
    fn: string,
    args: Record<string, unknown>,
  ): Promise<RpcOutcome<T>> => {
    const client = user ? user.client : world.anon;
    const { data, error } = await client.rpc(fn, args);
    return { data: data as T | null, error };
  };

  const createArgs = (overrides: Record<string, unknown> = {}) => ({
    p_room_id: world.spaceA,
    p_title: `Note ${randomUUID().slice(0, 6)}`,
    p_meeting_date: MEETING_DATE,
    p_content: '<p>Initial</p>',
    p_participant_ids: [] as string[],
    ...overrides,
  });

  const createNote = async (
    user: MeetingNotesDbUser,
    overrides: Record<string, unknown> = {},
  ): Promise<MutationResult> => {
    const { data, error } = await call(user, 'create_meeting_note', createArgs(overrides));
    expect(error).toBeNull();
    return data as MutationResult;
  };

  const updateArgs = (noteId: string, revision: number, overrides: Record<string, unknown> = {}) => ({
    p_note_id: noteId,
    p_expected_revision: revision,
    p_title: 'Updated title',
    p_meeting_date: MEETING_DATE,
    p_content: '<p>Updated</p>',
    p_participant_ids: [] as string[],
    ...overrides,
  });

  const expectRpcError = (outcome: RpcOutcome<unknown>, code: string, token: string) => {
    expect(outcome.data).toBeNull();
    expect(outcome.error?.code).toBe(code);
    expect(outcome.error?.message).toBe(token);
  };

  const noteState = async (noteId: string): Promise<NoteState | undefined> =>
    (
      await world.query<NoteState>(
        `select company_id, room_id, title, meeting_date::text as meeting_date, content, summary,
                revision::text as revision, transcript, transcript_id, author_user_id, author_name,
                created_by, edited_by
         from public.meeting_notes where id = $1`,
        [noteId],
      )
    )[0];

  const participantsOf = async (noteId: string): Promise<ParticipantRow[]> =>
    world.query<ParticipantRow>(
      `select user_id, display_name, sort_order, added_at::text as added_at
       from public.meeting_note_participants where note_id = $1 order by sort_order`,
      [noteId],
    );

  const versionsOf = async (noteId: string): Promise<VersionState[]> =>
    world.query<VersionState>(
      `select id, revision::text as revision, title, meeting_date::text as meeting_date, participants,
              content, summary, editor_user_id, editor_name, edited_by, created_at::text as created_at
       from public.meeting_note_versions where note_id = $1 order by revision`,
      [noteId],
    );

  const snapshot = (user: MeetingNotesDbUser) => ({ user_id: user.appUserId, display_name: user.displayName });

  const companyCounts = async (companyId: string) =>
    (
      await world.query<{ notes: string; participants: string; versions: string }>(
        `select (select count(*) from public.meeting_notes where company_id = $1)::text as notes,
                (select count(*) from public.meeting_note_participants p
                   join public.meeting_notes n on n.id = p.note_id where n.company_id = $1)::text as participants,
                (select count(*) from public.meeting_note_versions v
                   join public.meeting_notes n on n.id = v.note_id where n.company_id = $1)::text as versions`,
        [companyId],
      )
    )[0];

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

  /** Waits until another session running a query that contains `pattern` is blocked on a lock. */
  const waitForLockWaiter = async (pattern = '%meeting_note%'): Promise<void> => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const [row] = await world.query<{ waiting: string }>(
        `select count(*)::text as waiting from pg_catalog.pg_stat_activity
         where wait_event_type = 'Lock' and query ilike $1 and pid <> pg_catalog.pg_backend_pid()`,
        [pattern],
      );
      if (Number(row.waiting) > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('The competing request never blocked on the note lock.');
  };

  it('grants EXECUTE on the four RPCs to authenticated only, and none on the internal helpers', async () => {
    const rows = await world.query<{
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
      [[...MUTATION_RPCS.map((fn) => `public.${fn}`), ...INTERNAL_HELPERS]],
    );
    expect(rows).toHaveLength(MUTATION_RPCS.length + INTERNAL_HELPERS.length);
    for (const row of rows) {
      const isRpc = !row.fn.startsWith('private.');
      expect(row).toMatchObject({
        owner: 'postgres',
        definer: true,
        config: ['search_path=""'],
        anon: false,
        authenticated: isRpc,
        service_role: false,
        public_grant: false,
      });
    }

    // anon (no session) is denied by the grant, and nothing is written.
    const before = await companyCounts(world.companyA);
    const seeded = await world.seedNote({ companyId: world.companyA, roomId: world.spaceA, author: world.authorA });
    const afterSeed = await companyCounts(world.companyA);
    for (const [fn, args] of [
      ['create_meeting_note', createArgs()],
      ['update_meeting_note', updateArgs(seeded.noteId, 1)],
      ['restore_meeting_note_version', { p_note_id: seeded.noteId, p_expected_revision: 1, p_version_id: seeded.versionIds[0] }],
      ['delete_meeting_note', { p_note_id: seeded.noteId, p_expected_revision: 1 }],
    ] as const) {
      const outcome = await call(null, fn, args);
      expect(outcome.error?.code).toBe('42501');
      expect(outcome.error?.message).toContain('permission denied for function');
    }
    expect(await companyCounts(world.companyA)).toEqual(afterSeed);
    expect(Number(afterSeed.notes)).toBe(Number(before.notes) + 1);
  });

  it('BR-002/FR-001: any member creates a note in a private space; company and author come from the server', async () => {
    const result = await createNote(world.memberA, {
      p_room_id: privateSpaceA,
      p_title: 'Private sync',
      p_participant_ids: [world.participantA.appUserId, world.memberA.appUserId],
    });
    expect(result.revision).toBe(1);

    expect(await noteState(result.note_id)).toMatchObject({
      company_id: world.companyA,
      room_id: privateSpaceA,
      title: 'Private sync',
      content: '<p>Initial</p>',
      summary: null,
      revision: '1',
      author_user_id: world.memberA.appUserId,
      author_name: world.memberA.displayName,
      created_by: world.memberA.appUserId,
      edited_by: world.memberA.appUserId,
    });
    expect((await participantsOf(result.note_id)).map(({ user_id, display_name, sort_order }) => ({
      user_id,
      display_name,
      sort_order,
    }))).toEqual([
      { ...snapshot(world.participantA), sort_order: 0 },
      { ...snapshot(world.memberA), sort_order: 1 },
    ]);
    const versions = await versionsOf(result.note_id);
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      id: result.version_id,
      revision: '1',
      title: 'Private sync',
      participants: [snapshot(world.participantA), snapshot(world.memberA)],
      content: '<p>Initial</p>',
      summary: null,
      editor_user_id: world.memberA.appUserId,
      editor_name: world.memberA.displayName,
      edited_by: world.memberA.appUserId,
    });

    // A space of another company is indistinguishable from a missing one.
    expectRpcError(await call(world.memberA, 'create_meeting_note', createArgs({ p_room_id: world.spaceB })), 'P0002', 'MEETING_NOTE_SPACE_NOT_FOUND');
    expectRpcError(await call(world.adminB, 'create_meeting_note', createArgs({ p_room_id: world.spaceA })), 'P0002', 'MEETING_NOTE_SPACE_NOT_FOUND');
    expectRpcError(await call(world.memberA, 'create_meeting_note', createArgs({ p_room_id: randomUUID() })), 'P0002', 'MEETING_NOTE_SPACE_NOT_FOUND');
  });

  it('AC-002: limits are enforced at the database and a rejected save stores nothing', async () => {
    const fifty = await world.createMemberRows(world.companyA, 50, 'roster');
    const before = await companyCounts(world.companyA);
    const rejected: [Record<string, unknown>, string][] = [
      [{ p_title: '' }, 'MEETING_NOTE_TITLE_INVALID'],
      [{ p_title: '   ' }, 'MEETING_NOTE_TITLE_INVALID'],
      // Tabs and line breaks are blank too (direct authenticated RPC calls).
      [{ p_title: '\t\r\n' }, 'MEETING_NOTE_TITLE_INVALID'],
      [{ p_title: ' \n\t ' }, 'MEETING_NOTE_TITLE_INVALID'],
      [{ p_title: null }, 'MEETING_NOTE_TITLE_INVALID'],
      [{ p_title: 'x'.repeat(201) }, 'MEETING_NOTE_TITLE_INVALID'],
      [{ p_meeting_date: null }, 'MEETING_NOTE_DATE_REQUIRED'],
      [{ p_content: 'c'.repeat(100_001) }, 'MEETING_NOTE_CONTENT_TOO_LONG'],
      [{ p_content: null }, 'MEETING_NOTE_CONTENT_REQUIRED'],
      [{ p_participant_ids: null }, 'MEETING_NOTE_PARTICIPANTS_INVALID'],
      [{ p_participant_ids: [...fifty, world.participantA.appUserId] }, 'MEETING_NOTE_TOO_MANY_PARTICIPANTS'],
      [{ p_participant_ids: [world.memberB.appUserId] }, 'MEETING_NOTE_PARTICIPANT_NOT_MEMBER'],
      [{ p_participant_ids: [world.participantA.appUserId, randomUUID()] }, 'MEETING_NOTE_PARTICIPANT_NOT_MEMBER'],
      [{ p_participant_ids: [world.participantA.appUserId, world.participantA.appUserId] }, 'MEETING_NOTE_PARTICIPANTS_INVALID'],
    ];
    for (const [overrides, token] of rejected) {
      expectRpcError(await call(world.memberA, 'create_meeting_note', createArgs(overrides)), '22023', token);
    }
    expect(await companyCounts(world.companyA)).toEqual(before);

    // Boundaries are accepted: 200-char title, 100,000-char content, 50 participants.
    const atLimit = await createNote(world.memberA, {
      p_title: 't'.repeat(200),
      p_content: 'c'.repeat(100_000),
      p_participant_ids: fifty,
    });
    expect((await participantsOf(atLimit.note_id)).map((row) => row.user_id)).toEqual(fifty);
    expect((await versionsOf(atLimit.note_id))[0].participants).toHaveLength(50);

    // The same limits hold on update; the rejected update changes nothing.
    const stateBefore = await noteState(atLimit.note_id);
    for (const [overrides, token] of rejected) {
      expectRpcError(
        await call(world.memberA, 'update_meeting_note', updateArgs(atLimit.note_id, 1, overrides)),
        '22023',
        token,
      );
    }
    expectRpcError(
      await call(world.memberA, 'update_meeting_note', updateArgs(atLimit.note_id, 1, { p_expected_revision: null })),
      '22023',
      'MEETING_NOTE_REVISION_REQUIRED',
    );
    expectRpcError(
      await call(world.memberA, 'update_meeting_note', updateArgs(atLimit.note_id, 1, { p_note_id: null })),
      'P0002',
      'MEETING_NOTE_NOT_FOUND',
    );
    expect(await noteState(atLimit.note_id)).toEqual(stateBefore);
    expect(await versionsOf(atLimit.note_id)).toHaveLength(1);

    // Title limits also bind trusted writes (any role).
    await expect(
      world.query('update public.meeting_notes set title = $1 where id = $2', ['x'.repeat(201), atLimit.note_id]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      world.query('update public.meeting_notes set title = $1 where id = $2', ['  ', atLimit.note_id]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      world.query('update public.meeting_notes set title = $1 where id = $2', ['\t\r\n', atLimit.note_id]),
    ).rejects.toMatchObject({ code: '23514', constraint: 'meeting_notes_title_length_check' });
    await expect(
      world.query(
        `insert into public.meeting_note_versions
           (note_id, revision, title, meeting_date, editor_user_id, editor_name, edited_by)
         values ($1, 99, $2, now(), $3, $4, $3)`,
        [atLimit.note_id, '\n\t', world.memberA.appUserId, world.memberA.displayName],
      ),
    ).rejects.toMatchObject({ code: '23514', constraint: 'meeting_note_versions_title_length_check' });
  });

  it('AC-004: author, participant, and admin edit; a non-participant cannot edit, self-add, restore, or delete; other companies see not found', async () => {
    const created = await createNote(world.authorA, { p_participant_ids: [world.participantA.appUserId] });
    const noteId = created.note_id;

    const byParticipant = await call(world.participantA, 'update_meeting_note', updateArgs(noteId, 1, {
      p_title: 'Edited by participant',
      p_participant_ids: [world.participantA.appUserId],
    }));
    expect(byParticipant.error).toBeNull();
    expect(byParticipant.data?.revision).toBe(2);
    const byAdmin = await call(world.adminA, 'update_meeting_note', updateArgs(noteId, 2, {
      p_title: 'Edited by admin',
      p_participant_ids: [world.participantA.appUserId],
    }));
    expect(byAdmin.error).toBeNull();
    expect(byAdmin.data?.revision).toBe(3);
    const byAuthor = await call(world.authorA, 'update_meeting_note', updateArgs(noteId, 3, {
      p_title: 'Edited by author',
      p_participant_ids: [world.participantA.appUserId],
    }));
    expect(byAuthor.error).toBeNull();
    expect(byAuthor.data?.revision).toBe(4);

    const stateBefore = await noteState(noteId);
    const participantsBefore = await participantsOf(noteId);
    const versionsBefore = await versionsOf(noteId);
    expect(versionsBefore.map((v) => [v.revision, v.editor_user_id])).toEqual([
      ['1', world.authorA.appUserId],
      ['2', world.participantA.appUserId],
      ['3', world.adminA.appUserId],
      ['4', world.authorA.appUserId],
    ]);

    // Non-participant member Z (memberA): a plain edit, a self-add, a restore,
    // and a delete are all denied as forbidden (Z can read the note).
    const z = world.memberA;
    expectRpcError(await call(z, 'update_meeting_note', updateArgs(noteId, 4, {
      p_participant_ids: [world.participantA.appUserId],
    })), '42501', 'MEETING_NOTE_FORBIDDEN');
    expectRpcError(await call(z, 'update_meeting_note', updateArgs(noteId, 4, {
      p_title: stateBefore?.title,
      p_participant_ids: [world.participantA.appUserId, z.appUserId],
    })), '42501', 'MEETING_NOTE_FORBIDDEN');
    expectRpcError(await call(z, 'restore_meeting_note_version', {
      p_note_id: noteId, p_expected_revision: 4, p_version_id: versionsBefore[0].id,
    }), '42501', 'MEETING_NOTE_FORBIDDEN');
    expectRpcError(await call(z, 'delete_meeting_note', { p_note_id: noteId, p_expected_revision: 4 }), '42501', 'MEETING_NOTE_FORBIDDEN');

    // An admin and a member of company B get exactly what a missing note gives.
    for (const outsider of [world.adminB, world.memberB]) {
      expectRpcError(await call(outsider, 'update_meeting_note', updateArgs(noteId, 4, {
        p_participant_ids: [outsider.appUserId],
      })), 'P0002', 'MEETING_NOTE_NOT_FOUND');
      expectRpcError(await call(outsider, 'restore_meeting_note_version', {
        p_note_id: noteId, p_expected_revision: 4, p_version_id: versionsBefore[0].id,
      }), 'P0002', 'MEETING_NOTE_NOT_FOUND');
      expectRpcError(await call(outsider, 'delete_meeting_note', { p_note_id: noteId, p_expected_revision: 4 }), 'P0002', 'MEETING_NOTE_NOT_FOUND');
    }
    const missing = await call(world.adminB, 'update_meeting_note', updateArgs(randomUUID(), 4));
    const foreign = await call(world.adminB, 'update_meeting_note', updateArgs(noteId, 4));
    expect(foreign.error).toEqual(missing.error);

    expect(await noteState(noteId)).toEqual(stateBefore);
    expect(await participantsOf(noteId)).toEqual(participantsBefore);
    expect(await versionsOf(noteId)).toEqual(versionsBefore);

    // BR-004: an editor may add Z, which then gives Z edit rights.
    const added = await call(world.participantA, 'update_meeting_note', updateArgs(noteId, 4, {
      p_participant_ids: [world.participantA.appUserId, z.appUserId],
    }));
    expect(added.error).toBeNull();
    const byZ = await call(z, 'update_meeting_note', updateArgs(noteId, 5, {
      p_participant_ids: [world.participantA.appUserId, z.appUserId],
    }));
    expect(byZ.error).toBeNull();
    expect(byZ.data?.revision).toBe(6);
  });

  it('AC-005/BR-011: a stale revision is rejected with the current revision and changes nothing', async () => {
    const created = await createNote(world.authorA, { p_participant_ids: [world.participantA.appUserId] });
    const first = await call(world.authorA, 'update_meeting_note', updateArgs(created.note_id, 1, {
      p_content: '<p>first</p>',
      p_participant_ids: [world.participantA.appUserId],
    }));
    expect(first.error).toBeNull();
    const stateBefore = await noteState(created.note_id);

    for (const outcome of [
      await call(world.participantA, 'update_meeting_note', updateArgs(created.note_id, 1, { p_content: '<p>late</p>' })),
      await call(world.participantA, 'restore_meeting_note_version', {
        p_note_id: created.note_id, p_expected_revision: 1, p_version_id: created.version_id,
      }),
      await call(world.authorA, 'delete_meeting_note', { p_note_id: created.note_id, p_expected_revision: 1 }),
    ]) {
      expectRpcError(outcome, 'P0001', 'MEETING_NOTE_STALE_REVISION');
      expect(JSON.parse(outcome.error?.details ?? '{}')).toEqual({ current_revision: 2 });
    }
    expect(await noteState(created.note_id)).toEqual(stateBefore);
    expect(await versionsOf(created.note_id)).toHaveLength(2);
  });

  it('AC-005: competing transactions on the same revision — the first wins, the second is stale, the first change is intact', async () => {
    // Save vs save, save vs restore, restore vs save, delete vs save.
    const scenarios = [
      { name: 'save then save', first: 'save', second: 'save' },
      { name: 'restore then save', first: 'restore', second: 'save' },
      { name: 'save then restore', first: 'save', second: 'restore' },
      { name: 'delete then save', first: 'delete', second: 'save' },
    ] as const;

    for (const scenario of scenarios) {
      const created = await createNote(world.authorA, {
        p_title: `Race v1 ${scenario.name}`,
        p_participant_ids: [world.participantA.appUserId],
      });
      const v2 = await call(world.authorA, 'update_meeting_note', updateArgs(created.note_id, 1, {
        p_title: `Race v2 ${scenario.name}`,
        p_participant_ids: [world.participantA.appUserId],
      }));
      expect(v2.error).toBeNull();

      // First session (participant) holds the note lock in an open transaction.
      const tx = await openUserTransaction(world.participantA);
      try {
        if (scenario.first === 'save') {
          await tx.query('select public.update_meeting_note($1, 2, $2, $3, $4, $5::uuid[])', [
            created.note_id,
            `First ${scenario.name}`,
            MEETING_DATE,
            '<p>first wins</p>',
            [world.participantA.appUserId],
          ]);
        } else if (scenario.first === 'restore') {
          await tx.query('select public.restore_meeting_note_version($1, 2, $2)', [created.note_id, created.version_id]);
        } else {
          // Delete needs author or admin: run it as the author instead.
          await tx.query('rollback');
          await tx.end();
          const authorTx = await openUserTransaction(world.authorA);
          await authorTx.query('select public.delete_meeting_note($1, 2)', [created.note_id]);
          const pendingSave = call(world.adminA, 'update_meeting_note', updateArgs(created.note_id, 2, {
            p_participant_ids: [world.participantA.appUserId],
          }));
          await waitForLockWaiter();
          await authorTx.query('commit');
          await authorTx.end();
          expectRpcError(await pendingSave, 'P0002', 'MEETING_NOTE_NOT_FOUND');
          expect(await noteState(created.note_id)).toBeUndefined();
          continue;
        }

        // Second session (admin, through PostgREST) loaded the same revision 2.
        const pending =
          scenario.second === 'save'
            ? call(world.adminA, 'update_meeting_note', updateArgs(created.note_id, 2, {
                p_content: '<p>second loses</p>',
                p_participant_ids: [world.participantA.appUserId],
              }))
            : call(world.adminA, 'restore_meeting_note_version', {
                p_note_id: created.note_id, p_expected_revision: 2, p_version_id: created.version_id,
              });
        await waitForLockWaiter();
        await tx.query('commit');

        const loser = await pending;
        expectRpcError(loser, 'P0001', 'MEETING_NOTE_STALE_REVISION');
        expect(JSON.parse(loser.error?.details ?? '{}')).toEqual({ current_revision: 3 });
      } finally {
        await tx.end().catch(() => undefined);
      }

      const state = await noteState(created.note_id);
      const versions = await versionsOf(created.note_id);
      expect(state?.revision).toBe('3');
      expect(versions.map((v) => v.revision)).toEqual(['1', '2', '3']);
      expect(versions[2].editor_user_id).toBe(world.participantA.appUserId);
      if (scenario.first === 'save') {
        expect(state).toMatchObject({ title: `First ${scenario.name}`, content: '<p>first wins</p>' });
      } else {
        expect(state).toMatchObject({ title: `Race v1 ${scenario.name}`, content: '<p>Initial</p>' });
      }
    }
  });

  it('AC-006: three saves give three immutable versions; a non-editor cannot restore; restoring version 1 creates a fourth equal to it and leaves items and transcript unchanged', async () => {
    const created = await createNote(world.authorA, {
      p_title: 'History v1',
      p_content: '<p>one</p>',
      p_participant_ids: [world.participantA.appUserId],
    });
    const noteId = created.note_id;
    const second = await call(world.participantA, 'update_meeting_note', updateArgs(noteId, 1, {
      p_title: 'History v2',
      p_meeting_date: '2026-09-15T09:30:00.000Z',
      p_content: '<p>two</p>',
      p_participant_ids: [world.adminA.appUserId, world.participantA.appUserId],
    }));
    expect(second.error).toBeNull();
    // A summary written between saves (trusted fixture write; Apply arrives in T12).
    await world.query(`update public.meeting_notes set summary = 'Summary S' where id = $1`, [noteId]);
    const third = await call(world.adminA, 'update_meeting_note', updateArgs(noteId, 2, {
      p_title: 'History v3',
      p_meeting_date: '2026-09-15T09:30:00.000Z',
      p_content: '<p>three</p>',
      p_participant_ids: [world.adminA.appUserId],
    }));
    expect(third.error).toBeNull();

    const versions = await versionsOf(noteId);
    expect(versions.map((v) => [v.revision, v.title, v.editor_user_id, v.editor_name])).toEqual([
      ['1', 'History v1', world.authorA.appUserId, world.authorA.displayName],
      ['2', 'History v2', world.participantA.appUserId, world.participantA.displayName],
      ['3', 'History v3', world.adminA.appUserId, world.adminA.displayName],
    ]);
    expect(versions[2]).toMatchObject({ summary: 'Summary S', participants: [snapshot(world.adminA)] });
    // Any viewer of the company lists them.
    const { data: listed } = await world.memberA.client
      .from('meeting_note_versions')
      .select('id')
      .eq('note_id', noteId);
    expect(listed).toHaveLength(3);

    // No role modifies or deletes a version.
    const serviceUpdate = await world.service.from('meeting_note_versions').update({ title: 'Rewritten' }).eq('id', versions[0].id);
    expect(serviceUpdate.error?.message).toContain('MEETING_NOTE_VERSION_IMMUTABLE');
    const serviceDelete = await world.service.from('meeting_note_versions').delete().eq('id', versions[0].id);
    expect(serviceDelete.error?.message).toContain('MEETING_NOTE_VERSION_IMMUTABLE');
    const clientUpdate = await world.authorA.client.from('meeting_note_versions').update({ title: 'Rewritten' }).eq('id', versions[0].id);
    expect(clientUpdate.error?.code).toBe('42501');

    // Current-state data that restore must not touch.
    await world.query(
      `update public.meeting_notes set transcript = 'Ana: hello', transcript_id = gen_random_uuid() where id = $1`,
      [noteId],
    );
    await world.query(
      `insert into public.meeting_note_action_items
         (note_id, description, assignee_id, assignee_name, completed, creator_user_id, creator_name)
       values ($1, 'Send minutes', $2, $3, true, $4, $5)`,
      [noteId, world.participantA.appUserId, world.participantA.displayName, world.authorA.appUserId, world.authorA.displayName],
    );
    const itemsBefore = await world.query('select * from public.meeting_note_action_items where note_id = $1 order by id', [noteId]);
    const transcriptBefore = await world.query('select transcript, transcript_id from public.meeting_notes where id = $1', [noteId]);

    // Non-editor viewers (a member who never was a participant, and a member
    // the last save dropped from the participants) cannot restore.
    expectRpcError(await call(world.memberA, 'restore_meeting_note_version', {
      p_note_id: noteId, p_expected_revision: 3, p_version_id: versions[0].id,
    }), '42501', 'MEETING_NOTE_FORBIDDEN');
    expectRpcError(await call(world.participantA, 'restore_meeting_note_version', {
      p_note_id: noteId, p_expected_revision: 3, p_version_id: versions[0].id,
    }), '42501', 'MEETING_NOTE_FORBIDDEN');
    // A version of another note is not found.
    const other = await createNote(world.authorA);
    expectRpcError(await call(world.authorA, 'restore_meeting_note_version', {
      p_note_id: noteId, p_expected_revision: 3, p_version_id: other.version_id,
    }), 'P0002', 'MEETING_NOTE_VERSION_NOT_FOUND');
    expect(await versionsOf(noteId)).toEqual(versions);

    // The author (an editor) restores version 1.
    const restored = await call(world.authorA, 'restore_meeting_note_version', {
      p_note_id: noteId, p_expected_revision: 3, p_version_id: versions[0].id,
    });
    expect(restored.error).toBeNull();
    expect(restored.data?.revision).toBe(4);

    const after = await versionsOf(noteId);
    expect(after.slice(0, 3)).toEqual(versions);
    const fields = ({ title, meeting_date, participants, content, summary }: VersionState) => ({
      title, meeting_date, participants, content, summary,
    });
    expect(after[3]).toMatchObject({
      id: restored.data?.version_id,
      revision: '4',
      editor_user_id: world.authorA.appUserId,
      editor_name: world.authorA.displayName,
    });
    expect(fields(after[3])).toEqual(fields(versions[0]));
    expect(await noteState(noteId)).toMatchObject({
      title: 'History v1',
      meeting_date: versions[0].meeting_date,
      content: '<p>one</p>',
      summary: null,
      revision: '4',
      edited_by: world.authorA.appUserId,
    });
    expect((await participantsOf(noteId)).map(({ user_id, display_name }) => ({ user_id, display_name }))).toEqual(
      versions[0].participants,
    );
    expect(await world.query('select * from public.meeting_note_action_items where note_id = $1 order by id', [noteId])).toEqual(itemsBefore);
    expect(await world.query('select transcript, transcript_id from public.meeting_notes where id = $1', [noteId])).toEqual(transcriptBefore);
  });

  it('AC-007: only the author (while a member) or an admin deletes; delete removes versions, participants, items, and transcript', async () => {
    const created = await createNote(world.authorA, { p_participant_ids: [world.participantA.appUserId] });
    const noteId = created.note_id;
    const saved = await call(world.participantA, 'update_meeting_note', updateArgs(noteId, 1, {
      p_participant_ids: [world.participantA.appUserId],
    }));
    expect(saved.error).toBeNull();
    await world.query(
      `update public.meeting_notes set transcript = 'Bruno: ok', transcript_id = gen_random_uuid() where id = $1`,
      [noteId],
    );
    await world.query(
      `insert into public.meeting_note_action_items (note_id, description, creator_user_id, creator_name)
       values ($1, 'Item', $2, $3)`,
      [noteId, world.authorA.appUserId, world.authorA.displayName],
    );

    expectRpcError(await call(world.participantA, 'delete_meeting_note', { p_note_id: noteId, p_expected_revision: 2 }), '42501', 'MEETING_NOTE_FORBIDDEN');
    expectRpcError(await call(world.memberA, 'delete_meeting_note', { p_note_id: noteId, p_expected_revision: 2 }), '42501', 'MEETING_NOTE_FORBIDDEN');
    expectRpcError(await call(world.adminB, 'delete_meeting_note', { p_note_id: noteId, p_expected_revision: 2 }), 'P0002', 'MEETING_NOTE_NOT_FOUND');
    expect(await noteState(noteId)).toBeDefined();

    const deleted = await call<{ note_id: string; deleted: boolean }>(world.authorA, 'delete_meeting_note', {
      p_note_id: noteId,
      p_expected_revision: 2,
    });
    expect(deleted.error).toBeNull();
    expect(deleted.data).toEqual({ note_id: noteId, deleted: true });
    const [counts] = await world.query<{ notes: string; participants: string; versions: string; items: string }>(
      `select (select count(*) from public.meeting_notes where id = $1)::text as notes,
              (select count(*) from public.meeting_note_participants where note_id = $1)::text as participants,
              (select count(*) from public.meeting_note_versions where note_id = $1)::text as versions,
              (select count(*) from public.meeting_note_action_items where note_id = $1)::text as items`,
      [noteId],
    );
    expect(counts).toEqual({ notes: '0', participants: '0', versions: '0', items: '0' });
    expectRpcError(await call(world.authorA, 'delete_meeting_note', { p_note_id: noteId, p_expected_revision: 2 }), 'P0002', 'MEETING_NOTE_NOT_FOUND');

    // A company admin deletes someone else's note.
    const byAdmin = await createNote(world.participantA);
    const adminDelete = await call(world.adminA, 'delete_meeting_note', { p_note_id: byAdmin.note_id, p_expected_revision: 1 });
    expect(adminDelete.error).toBeNull();
    expect(await noteState(byAdmin.note_id)).toBeUndefined();
  });

  it('AC-021: a former member may stay listed but cannot edit or be newly added; after rejoining, their edit succeeds', async () => {
    const former = await world.createUser('former-participant', world.companyA, 'member');
    const outsider = await world.createUser('former-outsider', world.companyA, 'member');
    const formerAuthor = await world.createUser('former-author', world.companyA, 'member');
    const created = await createNote(world.authorA, {
      p_participant_ids: [former.appUserId, world.participantA.appUserId],
    });
    const authored = await createNote(formerAuthor);
    const [addedAt] = (await participantsOf(created.note_id)).map((row) => row.added_at);

    for (const leaver of [former, outsider, formerAuthor]) {
      const [removal] = await world.query<{ result: { ok: boolean } }>(
        'select public.remove_company_member_and_presence($1, $2, $3) as result',
        [world.adminA.appUserId, leaver.appUserId, world.companyA],
      );
      expect(removal.result.ok).toBe(true);
    }

    // The former participant's edit and the former author's delete are denied.
    expectRpcError(await call(former, 'update_meeting_note', updateArgs(created.note_id, 1, {
      p_participant_ids: [former.appUserId, world.participantA.appUserId],
    })), 'P0002', 'MEETING_NOTE_NOT_FOUND');
    expectRpcError(await call(formerAuthor, 'delete_meeting_note', { p_note_id: authored.note_id, p_expected_revision: 1 }), 'P0002', 'MEETING_NOTE_NOT_FOUND');
    expectRpcError(await call(formerAuthor, 'update_meeting_note', updateArgs(authored.note_id, 1)), 'P0002', 'MEETING_NOTE_NOT_FOUND');

    // A former member who is not on the note cannot be added (save or create).
    expectRpcError(await call(world.authorA, 'update_meeting_note', updateArgs(created.note_id, 1, {
      p_participant_ids: [former.appUserId, world.participantA.appUserId, outsider.appUserId],
    })), '22023', 'MEETING_NOTE_PARTICIPANT_NOT_MEMBER');
    expectRpcError(await call(world.authorA, 'create_meeting_note', createArgs({
      p_participant_ids: [former.appUserId],
    })), '22023', 'MEETING_NOTE_PARTICIPANT_NOT_MEMBER');

    // Saving while the former member is still listed (reordered) succeeds and
    // keeps their snapshot and original added_at.
    const kept = await call(world.authorA, 'update_meeting_note', updateArgs(created.note_id, 1, {
      p_participant_ids: [world.participantA.appUserId, former.appUserId],
    }));
    expect(kept.error).toBeNull();
    expect(await participantsOf(created.note_id)).toEqual([
      expect.objectContaining({ ...snapshot(world.participantA), sort_order: 0 }),
      { ...snapshot(former), sort_order: 1, added_at: addedAt },
    ]);
    expect((await versionsOf(created.note_id))[1].participants).toEqual([snapshot(world.participantA), snapshot(former)]);

    // Rejoining the same company (same users.id) restores the participant's right.
    await world.query('update public.users set company_id = $1 where id = $2', [world.companyA, former.appUserId]);
    const rejoined = await call(former, 'update_meeting_note', updateArgs(created.note_id, 2, {
      p_title: 'Edited after rejoining',
      p_participant_ids: [world.participantA.appUserId, former.appUserId],
    }));
    expect(rejoined.error).toBeNull();
    expect(rejoined.data?.revision).toBe(3);
    expect((await versionsOf(created.note_id))[2]).toMatchObject({
      editor_user_id: former.appUserId,
      editor_name: former.displayName,
    });
  });
  it('FR-030/BR-004: restore reproduces a version listing a person who has since left; they stay without access', async () => {
    const leaver = await world.createUser('restore-leaver', world.companyA, 'member');
    const created = await createNote(world.authorA, {
      p_title: 'Restore former v1',
      p_participant_ids: [leaver.appUserId, world.participantA.appUserId],
    });
    const dropped = await call(world.authorA, 'update_meeting_note', updateArgs(created.note_id, 1, {
      p_participant_ids: [world.participantA.appUserId],
    }));
    expect(dropped.error).toBeNull();
    const [removal] = await world.query<{ result: { ok: boolean } }>(
      'select public.remove_company_member_and_presence($1, $2, $3) as result',
      [world.adminA.appUserId, leaver.appUserId, world.companyA],
    );
    expect(removal.result.ok).toBe(true);

    const restored = await call(world.participantA, 'restore_meeting_note_version', {
      p_note_id: created.note_id, p_expected_revision: 2, p_version_id: created.version_id,
    });
    expect(restored.error).toBeNull();
    expect((await participantsOf(created.note_id)).map(({ user_id, display_name }) => ({ user_id, display_name }))).toEqual([
      snapshot(leaver),
      snapshot(world.participantA),
    ]);
    // Listed again, but a former member: no read, no edit.
    expect((await leaver.client.from('meeting_notes').select('id').eq('id', created.note_id)).data).toEqual([]);
    expectRpcError(await call(leaver, 'update_meeting_note', updateArgs(created.note_id, 3, {
      p_participant_ids: [leaver.appUserId, world.participantA.appUserId],
    })), 'P0002', 'MEETING_NOTE_NOT_FOUND');
  });

  it('a member removal and a note change on the same user serialize: removal first denies the change; change first delays the removal', async () => {
    const editor = await world.createUser('race-editor', world.companyA, 'member');
    const created = await createNote(world.authorA, { p_participant_ids: [editor.appUserId] });
    const removalSql = 'select public.remove_company_member_and_presence($1, $2, $3) as result';
    const removalArgs = [world.adminA.appUserId, editor.appUserId, world.companyA];

    // Change first: the removal RPC waits for the open note change, then succeeds.
    const tx = await openUserTransaction(editor);
    const removalDb = new Client({ connectionString: MEETING_NOTES_DB_URL });
    await removalDb.connect();
    try {
      await removalDb.query(`select pg_catalog.set_config('request.jwt.claims', '{"role":"service_role"}', false)`);
      await tx.query('select public.update_meeting_note($1, 1, $2, $3, $4, $5::uuid[])', [
        created.note_id, 'Saved before removal', MEETING_DATE, '<p>kept</p>', [editor.appUserId],
      ]);
      const pendingRemoval = removalDb.query<{ result: { ok: boolean } }>(removalSql, removalArgs);
      await waitForLockWaiter('%remove_company_member_and_presence%');
      await tx.query('commit');
      expect((await pendingRemoval).rows[0].result.ok).toBe(true);
    } finally {
      await tx.end().catch(() => undefined);
    }
    expect(await noteState(created.note_id)).toMatchObject({ title: 'Saved before removal', revision: '2' });

    // Removal first: rejoin, then hold a removal open; the change waits and is denied.
    await world.query('update public.users set company_id = $1 where id = $2', [world.companyA, editor.appUserId]);
    try {
      await removalDb.query('begin');
      expect((await removalDb.query<{ result: { ok: boolean } }>(removalSql, removalArgs)).rows[0].result.ok).toBe(true);
      const pendingChange = call(editor, 'update_meeting_note', updateArgs(created.note_id, 2, {
        p_participant_ids: [editor.appUserId],
      }));
      await waitForLockWaiter('%update_meeting_note%');
      await removalDb.query('commit');
      expectRpcError(await pendingChange, 'P0002', 'MEETING_NOTE_NOT_FOUND');
    } finally {
      await removalDb.end().catch(() => undefined);
    }
    expect(await noteState(created.note_id)).toMatchObject({ title: 'Saved before removal', revision: '2' });
  });

  it('a note creation and an admin removing another occupant of that space complete without a deadlock (company before space)', async () => {
    // A third member occupies the space: the removal RPC locks the company
    // FOR UPDATE, then that occupied space FOR UPDATE. The note insert takes
    // the company row FOR KEY SHARE (its FK), so creation must lock the
    // company before the space, never the reverse.
    const [occupant] = await world.query<{ id: string }>(
      `insert into public.users (supabase_uid, email, display_name, company_id, role, current_space_id)
       values (gen_random_uuid()::text, $1, $2, $3, 'member', $4)
       returning id`,
      [`mndb-occupant-${world.ns}@local.test`, `MN occupant ${world.ns}`, world.companyA, world.spaceA],
    );
    const blocker = new Client({ connectionString: MEETING_NOTES_DB_URL });
    const removalDb = new Client({ connectionString: MEETING_NOTES_DB_URL });
    await blocker.connect();
    await removalDb.connect();
    try {
      await removalDb.query(`select pg_catalog.set_config('request.jwt.claims', '{"role":"service_role"}', false)`);
      // Forced interleaving: a KEY SHARE holder on the occupied space stops the
      // removal right after its company lock; the creation then starts while
      // the removal holds the company and waits for the space.
      await blocker.query('begin');
      await blocker.query('select 1 from public.spaces where id = $1 for key share', [world.spaceA]);
      const pendingRemoval = removalDb
        .query<{ result: { ok: boolean } }>('select public.remove_company_member_and_presence($1, $2, $3) as result', [
          world.adminA.appUserId,
          occupant.id,
          world.companyA,
        ])
        .then(
          (outcome) => ({ ok: outcome.rows[0].result.ok, code: null as string | null }),
          (error: { code?: string }) => ({ ok: false, code: error.code ?? 'unknown' }),
        );
      await waitForLockWaiter('%remove_company_member_and_presence%');
      const pendingCreate = call(world.authorA, 'create_meeting_note', createArgs({ p_title: 'Created during a removal' }));
      await waitForLockWaiter('%create_meeting_note%');
      await blocker.query('commit');

      const [removal, created] = [await pendingRemoval, await pendingCreate];
      expect(removal).toEqual({ ok: true, code: null });
      expect(created.error).toBeNull();
      expect(await noteState((created.data as MutationResult).note_id)).toMatchObject({
        title: 'Created during a removal',
        room_id: world.spaceA,
        revision: '1',
      });
      const [left] = await world.query<{ company_id: string | null; current_space_id: string | null }>(
        'select company_id, current_space_id from public.users where id = $1',
        [occupant.id],
      );
      expect(left).toEqual({ company_id: null, current_space_id: null });
    } finally {
      await blocker.query('rollback').catch(() => undefined);
      await blocker.end().catch(() => undefined);
      await removalDb.end().catch(() => undefined);
      await world.query('delete from public.users where id = $1', [occupant.id]);
    }
  });
});
