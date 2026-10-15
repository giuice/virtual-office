import { randomUUID } from 'node:crypto';

import type { PostgrestError } from '@supabase/supabase-js';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createMeetingNotesWorld, type MeetingNotesDbUser, type MeetingNotesDbWorld } from './fixtures';
import { MEETING_NOTES_DB_URL } from './setup';

interface ItemRow {
  id: string;
  note_id: string;
  description: string;
  assignee_id: string | null;
  assignee_name: string | null;
  due_date: string | null;
  completed: boolean;
  revision: number;
  creator_user_id: string;
  creator_name: string;
  created_at: string;
  updated_at: string;
}

interface RpcOutcome<T> {
  data: T | null;
  error: PostgrestError | null;
}

const ITEM_RPCS = [
  'public.create_meeting_note_action_item(uuid,text,uuid,date)',
  'public.update_meeting_note_action_item(uuid,bigint,text,uuid,date)',
  'public.set_meeting_note_action_item_completed(uuid,bigint,boolean)',
  'public.delete_meeting_note_action_item(uuid,bigint)',
] as const;

const ITEM_HELPERS = [
  'private.meeting_note_lock_for_change(uuid,text)',
  'private.meeting_note_authorize(uuid,bigint,text)',
  'private.meeting_note_item_validate_description(text)',
  'private.meeting_note_item_resolve_assignee(uuid,uuid)',
  'private.meeting_note_item_lock(uuid,bigint,text)',
  'private.guard_meeting_note_action_item()',
] as const;

// Phase 6 T2 (FR-011, FR-030, BR-005; AC-008, AC-009, AC-021, AC-032): the
// action-item RPCs are the only client write path for items. Calls go through
// real PostgREST sessions of local users (or, for forced interleavings and
// session timezones, a pg connection running as `authenticated` with that
// user's JWT claims) against the real local database, RLS, grants, and triggers.
describe('meeting note action items (local Supabase)', () => {
  let world: MeetingNotesDbWorld;

  beforeAll(async () => {
    world = await createMeetingNotesWorld();
  });

  afterAll(async () => {
    await world?.cleanup();
  });

  const call = async <T = ItemRow>(
    user: MeetingNotesDbUser | null,
    fn: string,
    args: Record<string, unknown>,
  ): Promise<RpcOutcome<T>> => {
    const client = user ? user.client : world.anon;
    const { data, error } = await client.rpc(fn, args);
    return { data: data as T | null, error };
  };

  const expectRpcError = (outcome: RpcOutcome<unknown>, code: string, token: string) => {
    expect(outcome.data).toBeNull();
    expect(outcome.error?.code).toBe(code);
    expect(outcome.error?.message).toBe(token);
  };

  /** A note by authorA with participantA (editors: authorA, participantA, adminA; viewer: memberA). */
  const createNote = async (): Promise<string> => {
    const { data, error } = await world.authorA.client.rpc('create_meeting_note', {
      p_room_id: world.spaceA,
      p_title: `Items ${randomUUID().slice(0, 6)}`,
      p_meeting_date: '2026-10-01T14:00:00.000Z',
      p_content: '<p>Items</p>',
      p_participant_ids: [world.participantA.appUserId],
    });
    expect(error).toBeNull();
    return (data as { note_id: string }).note_id;
  };

  const addItem = async (
    user: MeetingNotesDbUser,
    noteId: string,
    overrides: Record<string, unknown> = {},
  ): Promise<ItemRow> => {
    const outcome = await call(user, 'create_meeting_note_action_item', {
      p_note_id: noteId,
      p_description: `Item ${randomUUID().slice(0, 6)}`,
      p_assignee_id: null,
      p_due_date: null,
      ...overrides,
    });
    expect(outcome.error).toBeNull();
    return outcome.data as ItemRow;
  };

  /** Trusted bulk insert (one multi-row statement; the capacity trigger still applies). */
  const seedItems = async (noteId: string, count: number): Promise<void> => {
    await world.query(
      `insert into public.meeting_note_action_items (note_id, description, creator_user_id, creator_name)
       select $1, format('Seeded %s', g), $2, $3 from generate_series(1, $4::int) as g`,
      [noteId, world.authorA.appUserId, world.authorA.displayName, count],
    );
  };

  const itemCount = async (noteId: string): Promise<number> =>
    Number(
      (
        await world.query<{ n: string }>(
          'select count(*)::text as n from public.meeting_note_action_items where note_id = $1',
          [noteId],
        )
      )[0].n,
    );

  const itemState = async (itemId: string) =>
    (
      await world.query<Record<string, unknown>>(
        `select note_id, description, assignee_id, assignee_name, due_date::text as due_date, completed,
                revision::int as revision, creator_user_id, creator_name, created_at::text as created_at
         from public.meeting_note_action_items where id = $1`,
        [itemId],
      )
    )[0];

  const noteRevisionAndVersions = async (noteId: string) =>
    (
      await world.query<{ revision: string; versions: string }>(
        `select n.revision::text as revision,
                (select count(*) from public.meeting_note_versions v where v.note_id = n.id)::text as versions
         from public.meeting_notes n where n.id = $1`,
        [noteId],
      )
    )[0];

  /** A pg session running as `authenticated` with `user`'s JWT claims, inside an open transaction. */
  const openUserTransaction = async (user: MeetingNotesDbUser, timezone?: string): Promise<Client> => {
    const tx = new Client({ connectionString: MEETING_NOTES_DB_URL });
    await tx.connect();
    await tx.query('begin');
    if (timezone) {
      await tx.query(`select pg_catalog.set_config('timezone', $1, true)`, [timezone]);
    }
    await tx.query(`select pg_catalog.set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: user.supabaseUid, role: 'authenticated' }),
    ]);
    await tx.query('set local role authenticated');
    return tx;
  };

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
    throw new Error('The competing request never blocked on the note lock.');
  };

  const removeFromCompanyA = async (user: MeetingNotesDbUser): Promise<void> => {
    const [removal] = await world.query<{ result: { ok: boolean } }>(
      'select public.remove_company_member_and_presence($1, $2, $3) as result',
      [world.adminA.appUserId, user.appUserId, world.companyA],
    );
    expect(removal.result.ok).toBe(true);
  };

  it('grants EXECUTE on the four item RPCs to authenticated only; helpers get none; due_date is a date', async () => {
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
       where p.oid = any ($1::regprocedure[])`,
      [[...ITEM_RPCS, ...ITEM_HELPERS]],
    );
    expect(rows).toHaveLength(ITEM_RPCS.length + ITEM_HELPERS.length);
    for (const row of rows) {
      expect(row).toMatchObject({
        owner: 'postgres',
        definer: true,
        config: ['search_path=""'],
        anon: false,
        authenticated: !row.fn.startsWith('private.'),
        service_role: false,
        public_grant: false,
      });
    }

    const [column] = await world.query<{ data_type: string }>(
      `select data_type from information_schema.columns
       where table_schema = 'public' and table_name = 'meeting_note_action_items' and column_name = 'due_date'`,
    );
    expect(column.data_type).toBe('date');

    const [grants] = await world.query<Record<string, boolean>>(
      `select has_table_privilege('authenticated', 'public.meeting_note_action_items', 'insert,update,delete,truncate') as auth_write,
              has_table_privilege('anon', 'public.meeting_note_action_items', 'select,insert,update,delete') as anon_any,
              has_table_privilege('service_role', 'public.meeting_note_action_items', 'truncate') as service_truncate`,
    );
    expect(grants).toEqual({ auth_write: false, anon_any: false, service_truncate: false });

    const noteId = await createNote();
    expect(await call(null, 'create_meeting_note_action_item', {
      p_note_id: noteId, p_description: 'anon', p_assignee_id: null, p_due_date: null,
    })).toMatchObject({ data: null, error: { code: '42501' } });
    expect(await itemCount(noteId)).toBe(0);
  });

  it('AC-008/BR-005: editors add, edit, and delete; the assignee changes nothing but completion; items never touch the note revision', async () => {
    const noteId = await createNote();
    const before = await noteRevisionAndVersions(noteId);

    // Author adds an item assigned to memberA (a viewer, not an editor).
    const created = await addItem(world.authorA, noteId, {
      p_description: 'Send the minutes',
      p_assignee_id: world.memberA.appUserId,
      p_due_date: '2026-11-05',
    });
    expect(created).toMatchObject({
      note_id: noteId,
      description: 'Send the minutes',
      assignee_id: world.memberA.appUserId,
      assignee_name: world.memberA.displayName,
      due_date: '2026-11-05',
      completed: false,
      revision: 1,
      creator_user_id: world.authorA.appUserId,
      creator_name: world.authorA.displayName,
    });
    const { data: visible } = await world.memberA.client
      .from('meeting_note_action_items')
      .select('id, description, assignee_name, due_date, completed, revision')
      .eq('id', created.id);
    expect(visible).toEqual([
      { id: created.id, description: 'Send the minutes', assignee_name: world.memberA.displayName, due_date: '2026-11-05', completed: false, revision: 1 },
    ]);

    // A participant editor edits; an admin edits again.
    const edited = await call(world.participantA, 'update_meeting_note_action_item', {
      p_item_id: created.id, p_expected_revision: 1, p_description: 'Send the minutes today',
      p_assignee_id: world.memberA.appUserId, p_due_date: '2026-11-06',
    });
    expect(edited.error).toBeNull();
    expect(edited.data).toMatchObject({ revision: 2, description: 'Send the minutes today', due_date: '2026-11-06' });
    const adminEdit = await call(world.adminA, 'update_meeting_note_action_item', {
      p_item_id: created.id, p_expected_revision: 2, p_description: 'Send the minutes today',
      p_assignee_id: world.memberA.appUserId, p_due_date: null,
    });
    expect(adminEdit.data).toMatchObject({ revision: 3, due_date: null });

    // The assignee (not an editor) toggles completion.
    const done = await call(world.memberA, 'set_meeting_note_action_item_completed', {
      p_item_id: created.id, p_expected_revision: 3, p_completed: true,
    });
    expect(done.error).toBeNull();
    expect(done.data).toMatchObject({
      completed: true, revision: 4, description: 'Send the minutes today',
      assignee_id: world.memberA.appUserId, due_date: null, note_id: noteId,
    });

    // ...but cannot change the description, assignee, or due date, nor delete or add.
    const snapshotBefore = await itemState(created.id);
    for (const [assignee, description, due] of [
      [world.memberA.appUserId, 'Rewritten by assignee', null],
      [world.participantA.appUserId, 'Send the minutes today', null],
      [world.memberA.appUserId, 'Send the minutes today', '2027-01-01'],
    ] as const) {
      expectRpcError(await call(world.memberA, 'update_meeting_note_action_item', {
        p_item_id: created.id, p_expected_revision: 4, p_description: description, p_assignee_id: assignee, p_due_date: due,
      }), '42501', 'MEETING_NOTE_ITEM_FORBIDDEN');
    }
    expectRpcError(await call(world.memberA, 'delete_meeting_note_action_item', {
      p_item_id: created.id, p_expected_revision: 4,
    }), '42501', 'MEETING_NOTE_ITEM_FORBIDDEN');
    expectRpcError(await call(world.memberA, 'create_meeting_note_action_item', {
      p_note_id: noteId, p_description: 'viewer add', p_assignee_id: null, p_due_date: null,
    }), '42501', 'MEETING_NOTE_ITEM_FORBIDDEN');
    // Moving the item to another note: no RPC takes it; direct writes are denied
    // for clients and rejected by the guard for trusted roles.
    const otherNote = await createNote();
    const direct = await world.memberA.client
      .from('meeting_note_action_items')
      .update({ note_id: otherNote, description: 'direct' })
      .eq('id', created.id);
    expect(direct.error?.code).toBe('42501');
    for (const patch of [
      { note_id: otherNote },
      { creator_user_id: world.memberA.appUserId },
      { creator_name: 'Someone' },
      { created_at: '2020-01-01T00:00:00Z' },
    ]) {
      const { error } = await world.service.from('meeting_note_action_items').update(patch).eq('id', created.id);
      expect(error?.message, JSON.stringify(patch)).toContain('MEETING_NOTE_ITEM_IMMUTABLE_FIELD');
    }
    const unbumped = await world.service.from('meeting_note_action_items').update({ description: 'no bump' }).eq('id', created.id);
    expect(unbumped.error?.message).toContain('MEETING_NOTE_ITEM_REVISION_NOT_BUMPED');
    expect(await itemState(created.id)).toEqual(snapshotBefore);

    // The assignee cannot toggle someone else's item.
    const othersItem = await addItem(world.authorA, noteId, { p_assignee_id: world.participantA.appUserId });
    expectRpcError(await call(world.memberA, 'set_meeting_note_action_item_completed', {
      p_item_id: othersItem.id, p_expected_revision: 1, p_completed: true,
    }), '42501', 'MEETING_NOTE_ITEM_FORBIDDEN');
    // An unassigned item grants a non-editor nothing; an editor completes it.
    const unassigned = await addItem(world.authorA, noteId);
    expectRpcError(await call(world.memberA, 'set_meeting_note_action_item_completed', {
      p_item_id: unassigned.id, p_expected_revision: 1, p_completed: true,
    }), '42501', 'MEETING_NOTE_ITEM_FORBIDDEN');
    expect(await itemState(unassigned.id)).toMatchObject({ completed: false, revision: 1 });
    const editorDone = await call(world.participantA, 'set_meeting_note_action_item_completed', {
      p_item_id: unassigned.id, p_expected_revision: 1, p_completed: true,
    });
    expect(editorDone.data).toMatchObject({ completed: true, revision: 2, assignee_id: null });

    // Stale item revision is rejected distinguishably with the current revision.
    const stale = await call(world.authorA, 'set_meeting_note_action_item_completed', {
      p_item_id: created.id, p_expected_revision: 3, p_completed: false,
    });
    expectRpcError(stale, 'P0001', 'MEETING_NOTE_ITEM_STALE_REVISION');
    expect(JSON.parse(stale.error?.details ?? '{}')).toEqual({ current_revision: 4 });
    expectRpcError(await call(world.authorA, 'set_meeting_note_action_item_completed', {
      p_item_id: created.id, p_expected_revision: 4, p_completed: null,
    }), '22023', 'MEETING_NOTE_ITEM_COMPLETED_REQUIRED');

    // Other companies (member and admin) see the same not-found as a missing item/note.
    for (const outsider of [world.adminB, world.memberB]) {
      expectRpcError(await call(outsider, 'create_meeting_note_action_item', {
        p_note_id: noteId, p_description: 'x', p_assignee_id: null, p_due_date: null,
      }), 'P0002', 'MEETING_NOTE_NOT_FOUND');
      expectRpcError(await call(outsider, 'update_meeting_note_action_item', {
        p_item_id: created.id, p_expected_revision: 4, p_description: 'x', p_assignee_id: null, p_due_date: null,
      }), 'P0002', 'MEETING_NOTE_ITEM_NOT_FOUND');
      expectRpcError(await call(outsider, 'set_meeting_note_action_item_completed', {
        p_item_id: created.id, p_expected_revision: 4, p_completed: false,
      }), 'P0002', 'MEETING_NOTE_ITEM_NOT_FOUND');
      expectRpcError(await call(outsider, 'delete_meeting_note_action_item', {
        p_item_id: created.id, p_expected_revision: 4,
      }), 'P0002', 'MEETING_NOTE_ITEM_NOT_FOUND');
    }
    expectRpcError(await call(world.authorA, 'delete_meeting_note_action_item', {
      p_item_id: randomUUID(), p_expected_revision: 1,
    }), 'P0002', 'MEETING_NOTE_ITEM_NOT_FOUND');
    expectRpcError(await call(world.authorA, 'create_meeting_note_action_item', {
      p_note_id: randomUUID(), p_description: 'x', p_assignee_id: null, p_due_date: null,
    }), 'P0002', 'MEETING_NOTE_NOT_FOUND');

    // An editor deletes.
    const deleted = await call<{ item_id: string; deleted: boolean }>(world.participantA, 'delete_meeting_note_action_item', {
      p_item_id: created.id, p_expected_revision: 4,
    });
    expect(deleted.data).toEqual({ item_id: created.id, deleted: true });
    expect(await itemState(created.id)).toBeUndefined();

    // Items are current state only: the note revision and versions never moved.
    expect(await noteRevisionAndVersions(noteId)).toEqual(before);
  });

  it('an editor edit and an assignee toggle at the same item revision: the later one gets a conflict', async () => {
    const noteId = await createNote();
    const item = await addItem(world.authorA, noteId, { p_assignee_id: world.memberA.appUserId });

    const tx = await openUserTransaction(world.authorA);
    try {
      await tx.query('select public.update_meeting_note_action_item($1, 1, $2, $3, null)', [
        item.id, 'Edited first', world.memberA.appUserId,
      ]);
      const pendingToggle = call(world.memberA, 'set_meeting_note_action_item_completed', {
        p_item_id: item.id, p_expected_revision: 1, p_completed: true,
      });
      await waitForLockWaiter('%set_meeting_note_action_item_completed%');
      await tx.query('commit');
      const loser = await pendingToggle;
      expectRpcError(loser, 'P0001', 'MEETING_NOTE_ITEM_STALE_REVISION');
      expect(JSON.parse(loser.error?.details ?? '{}')).toEqual({ current_revision: 2 });
    } finally {
      await tx.end().catch(() => undefined);
    }
    expect(await itemState(item.id)).toMatchObject({ description: 'Edited first', completed: false, revision: 2 });
  });

  it('AC-009: below capacity, invalid descriptions and non-member assignees are rejected; the 101st item is rejected for capacity', async () => {
    const noteId = await createNote();
    await seedItems(noteId, 10);
    const leaver = await world.createUser('item-leaver', world.companyA, 'member');
    await removeFromCompanyA(leaver);

    const rejected: [Record<string, unknown>, string][] = [
      [{ p_description: '' }, 'MEETING_NOTE_ITEM_DESCRIPTION_INVALID'],
      [{ p_description: '   ' }, 'MEETING_NOTE_ITEM_DESCRIPTION_INVALID'],
      [{ p_description: ' \n\t\r ' }, 'MEETING_NOTE_ITEM_DESCRIPTION_INVALID'],
      [{ p_description: null }, 'MEETING_NOTE_ITEM_DESCRIPTION_INVALID'],
      [{ p_description: 'd'.repeat(1001) }, 'MEETING_NOTE_ITEM_DESCRIPTION_INVALID'],
      [{ p_assignee_id: leaver.appUserId }, 'MEETING_NOTE_ITEM_ASSIGNEE_NOT_MEMBER'],
      [{ p_assignee_id: world.memberB.appUserId }, 'MEETING_NOTE_ITEM_ASSIGNEE_NOT_MEMBER'],
      [{ p_assignee_id: randomUUID() }, 'MEETING_NOTE_ITEM_ASSIGNEE_NOT_MEMBER'],
    ];
    for (const [overrides, token] of rejected) {
      expectRpcError(await call(world.authorA, 'create_meeting_note_action_item', {
        p_note_id: noteId, p_description: 'Valid', p_assignee_id: null, p_due_date: null, ...overrides,
      }), '22023', token);
    }
    expect(await itemCount(noteId)).toBe(10);

    // Edits apply the same validators.
    const item = await addItem(world.authorA, noteId, { p_description: 'd'.repeat(1000) });
    expect(item.description).toHaveLength(1000);
    expectRpcError(await call(world.authorA, 'update_meeting_note_action_item', {
      p_item_id: item.id, p_expected_revision: 1, p_description: 'd'.repeat(1001), p_assignee_id: null, p_due_date: null,
    }), '22023', 'MEETING_NOTE_ITEM_DESCRIPTION_INVALID');
    expectRpcError(await call(world.authorA, 'update_meeting_note_action_item', {
      p_item_id: item.id, p_expected_revision: 1, p_description: 'ok', p_assignee_id: world.memberB.appUserId, p_due_date: null,
    }), '22023', 'MEETING_NOTE_ITEM_ASSIGNEE_NOT_MEMBER');
    expectRpcError(await call(world.authorA, 'update_meeting_note_action_item', {
      p_item_id: item.id, p_expected_revision: null, p_description: 'ok', p_assignee_id: null, p_due_date: null,
    }), '22023', 'MEETING_NOTE_ITEM_REVISION_REQUIRED');

    // Fill to exactly 100; the valid 101st is refused for capacity, by the RPC
    // and by every other insertion path (trusted role, multi-row statement).
    await seedItems(noteId, 89);
    expect(await itemCount(noteId)).toBe(100);
    const overflow = await call(world.adminA, 'create_meeting_note_action_item', {
      p_note_id: noteId, p_description: 'The 101st', p_assignee_id: world.memberA.appUserId, p_due_date: '2026-11-05',
    });
    expectRpcError(overflow, '22023', 'MEETING_NOTE_ITEM_LIMIT_REACHED');
    expect(JSON.parse(overflow.error?.details ?? '{}')).toEqual({ limit: 100 });
    const serviceInsert = await world.service.from('meeting_note_action_items').insert({
      note_id: noteId, description: 'service 101st', creator_user_id: world.authorA.appUserId, creator_name: 'x',
    });
    expect(serviceInsert.error?.message).toBe('MEETING_NOTE_ITEM_LIMIT_REACHED');
    expect(await itemCount(noteId)).toBe(100);

    const multiNote = await createNote();
    await seedItems(multiNote, 98);
    await expect(seedItems(multiNote, 3)).rejects.toThrow(/MEETING_NOTE_ITEM_LIMIT_REACHED/);
    expect(await itemCount(multiNote)).toBe(98);
  });

  it('AC-009: a due date saved as 2026-11-05 is stored and returned as 2026-11-05 under any session timezone', async () => {
    const noteId = await createNote();
    const viaApi = await addItem(world.authorA, noteId, { p_due_date: '2026-11-05' });
    expect(viaApi.due_date).toBe('2026-11-05');

    // Written from a UTC+14 session, read back from UTC-8/-7 and UTC+9 sessions.
    const writer = await openUserTransaction(world.authorA, 'Pacific/Kiritimati');
    let writtenId = '';
    try {
      const { rows } = await writer.query<{ item: ItemRow }>(
        `select public.create_meeting_note_action_item($1, 'Timezone item', null, $2::date) as item`,
        [noteId, '2026-11-05'],
      );
      expect(rows[0].item.due_date).toBe('2026-11-05');
      writtenId = rows[0].item.id;
      await writer.query('commit');
    } finally {
      await writer.end().catch(() => undefined);
    }

    for (const timezone of ['America/Los_Angeles', 'Asia/Tokyo', 'America/Sao_Paulo']) {
      const reader = await openUserTransaction(world.memberA, timezone);
      try {
        const { rows } = await reader.query<{ due: string; json: string }>(
          `select due_date::text as due, to_jsonb(i) ->> 'due_date' as json
           from public.meeting_note_action_items as i where i.id = any($1::uuid[]) order by i.created_at`,
          [[viaApi.id, writtenId]],
        );
        expect(rows, timezone).toEqual([
          { due: '2026-11-05', json: '2026-11-05' },
          { due: '2026-11-05', json: '2026-11-05' },
        ]);
      } finally {
        await reader.query('rollback').catch(() => undefined);
        await reader.end().catch(() => undefined);
      }
    }
    const { data } = await world.memberA.client.from('meeting_note_action_items').select('due_date').eq('id', writtenId);
    expect(data).toEqual([{ due_date: '2026-11-05' }]);
  });

  it('AC-021/FR-030: an assignee who left cannot toggle completion, keeps their snapshot, and can toggle again after rejoining', async () => {
    const assignee = await world.createUser('item-assignee', world.companyA, 'member');
    const noteId = await createNote();
    const item = await addItem(world.authorA, noteId, { p_assignee_id: assignee.appUserId, p_description: 'Prepare budget' });
    const toggled = await call(assignee, 'set_meeting_note_action_item_completed', {
      p_item_id: item.id, p_expected_revision: 1, p_completed: true,
    });
    expect(toggled.data).toMatchObject({ completed: true, revision: 2 });

    await removeFromCompanyA(assignee);
    expectRpcError(await call(assignee, 'set_meeting_note_action_item_completed', {
      p_item_id: item.id, p_expected_revision: 2, p_completed: false,
    }), 'P0002', 'MEETING_NOTE_ITEM_NOT_FOUND');
    expect(await itemState(item.id)).toMatchObject({ completed: true, revision: 2 });

    // An editor's edit that keeps the assignee retains the former member's
    // snapshot; newly assigning the former member is refused.
    const kept = await call(world.authorA, 'update_meeting_note_action_item', {
      p_item_id: item.id, p_expected_revision: 2, p_description: 'Prepare the budget', p_assignee_id: assignee.appUserId, p_due_date: '2026-12-01',
    });
    expect(kept.error).toBeNull();
    expect(kept.data).toMatchObject({ assignee_id: assignee.appUserId, assignee_name: assignee.displayName, revision: 3 });
    expectRpcError(await call(world.authorA, 'create_meeting_note_action_item', {
      p_note_id: noteId, p_description: 'New for former', p_assignee_id: assignee.appUserId, p_due_date: null,
    }), '22023', 'MEETING_NOTE_ITEM_ASSIGNEE_NOT_MEMBER');

    // Rejoining the same company returns the completion right.
    await world.query('update public.users set company_id = $1 where id = $2', [world.companyA, assignee.appUserId]);
    const again = await call(assignee, 'set_meeting_note_action_item_completed', {
      p_item_id: item.id, p_expected_revision: 3, p_completed: false,
    });
    expect(again.error).toBeNull();
    expect(again.data).toMatchObject({ completed: false, revision: 4, description: 'Prepare the budget' });

    // Deleting the user row keeps the assignee id and snapshot on the item.
    await world.query('delete from public.users where id = $1', [assignee.appUserId]);
    expect(await itemState(item.id)).toMatchObject({
      assignee_id: assignee.appUserId,
      assignee_name: assignee.displayName,
      revision: 4,
    });
  });

  it('AC-032: two editors adding concurrently at 99 items -> exactly one succeeds and the total is 100', async () => {
    // Forced interleaving: the first add holds the note lock; the second waits on it.
    const forcedNote = await createNote();
    await seedItems(forcedNote, 99);
    const tx = await openUserTransaction(world.authorA);
    try {
      await tx.query(`select public.create_meeting_note_action_item($1, 'First at 99', null, null)`, [forcedNote]);
      const pendingSecond = call(world.adminA, 'create_meeting_note_action_item', {
        p_note_id: forcedNote, p_description: 'Second at 99', p_assignee_id: null, p_due_date: null,
      });
      await waitForLockWaiter('%create_meeting_note_action_item%');
      await tx.query('commit');
      expectRpcError(await pendingSecond, '22023', 'MEETING_NOTE_ITEM_LIMIT_REACHED');
    } finally {
      await tx.end().catch(() => undefined);
    }
    expect(await itemCount(forcedNote)).toBe(100);

    // Unforced race of two real sessions.
    const raceNote = await createNote();
    await seedItems(raceNote, 99);
    const outcomes = await Promise.all(
      [world.authorA, world.participantA].map((editor) =>
        call(editor, 'create_meeting_note_action_item', {
          p_note_id: raceNote, p_description: `Race ${editor.displayName}`, p_assignee_id: null, p_due_date: null,
        }),
      ),
    );
    expect(outcomes.filter((o) => o.error === null)).toHaveLength(1);
    const losers = outcomes.filter((o) => o.error !== null);
    expect(losers).toHaveLength(1);
    expectRpcError(losers[0], '22023', 'MEETING_NOTE_ITEM_LIMIT_REACHED');
    expect(await itemCount(raceNote)).toBe(100);
  });
});
