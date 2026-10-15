// Local meeting-notes world for DB integration tests: company A (admin, author,
// participant, plain member) and company B (admin, member), one space per
// company, and helpers that seed notes with participants, versions, and action
// items. Notes are seeded with trusted SQL because the write RPCs arrive in a
// later task (T17); every assertion about client behavior uses real anon-key
// clients signed in as real local users. Every row is tracked and removed in
// `cleanup`.
import { randomUUID } from 'node:crypto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Client } from 'pg';

import {
  MEETING_NOTES_ANON_KEY,
  MEETING_NOTES_API_URL,
  MEETING_NOTES_DB_URL,
  MEETING_NOTES_SERVICE_ROLE_KEY,
} from './setup';

export interface MeetingNotesDbUser {
  readonly appUserId: string;
  readonly supabaseUid: string;
  readonly email: string;
  readonly displayName: string;
  /** Anon-key client signed in as this user: every query runs under RLS. */
  readonly client: SupabaseClient;
}

export interface SeedNoteInput {
  readonly companyId: string;
  readonly roomId: string | null;
  readonly author: MeetingNotesDbUser;
  readonly participants?: readonly MeetingNotesDbUser[];
  /** One version per editor, in order (revision 1..n). Defaults to [author]. */
  readonly versionEditors?: readonly MeetingNotesDbUser[];
  readonly itemAssignee?: MeetingNotesDbUser | null;
  readonly title?: string;
}

export interface SeededNote {
  readonly noteId: string;
  readonly versionIds: readonly string[];
  readonly itemId: string;
}

export interface MeetingNotesDbWorld {
  readonly ns: string;
  readonly companyA: string;
  readonly companyB: string;
  readonly spaceA: string;
  readonly spaceB: string;
  readonly adminA: MeetingNotesDbUser;
  readonly authorA: MeetingNotesDbUser;
  readonly participantA: MeetingNotesDbUser;
  readonly memberA: MeetingNotesDbUser;
  readonly adminB: MeetingNotesDbUser;
  readonly memberB: MeetingNotesDbUser;
  /** Anon-key client with no session. */
  readonly anon: SupabaseClient;
  /** Service-role PostgREST client (server-side trusted role). */
  readonly service: SupabaseClient;
  createCompany(label: string): Promise<string>;
  createSpace(companyId: string, label: string, createdBy: MeetingNotesDbUser): Promise<string>;
  createUser(key: string, companyId: string, role: 'admin' | 'member'): Promise<MeetingNotesDbUser>;
  /**
   * `count` member rows of `companyId` without an auth account (they cannot
   * sign in; used only as note participants). Returns their users.id values.
   */
  createMemberRows(companyId: string, count: number, label: string): Promise<string[]>;
  seedNote(input: SeedNoteInput): Promise<SeededNote>;
  /**
   * Trusted raw SQL on the local database as postgres (fixture setup and
   * assertions only; client behavior is exercised through user-scoped clients).
   */
  query<Row extends Record<string, unknown>>(sql: string, params?: unknown[]): Promise<Row[]>;
  cleanup(): Promise<void>;
}

/** Local-only fixture password shared by every fixture account. */
export const MEETING_NOTES_DB_PASSWORD = 'local-meeting-notes-db-password';
const PASSWORD = MEETING_NOTES_DB_PASSWORD;

function newClient(key: string): SupabaseClient {
  return createClient(MEETING_NOTES_API_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function createMeetingNotesWorld(): Promise<MeetingNotesDbWorld> {
  const ns = randomUUID().slice(0, 8);
  const service = newClient(MEETING_NOTES_SERVICE_ROLE_KEY);
  const db = new Client({ connectionString: MEETING_NOTES_DB_URL });
  await db.connect();
  // Trusted fixture path: classify raw SQL as service_role for the presence
  // audit triggers on public.users (same convention as the messaging fixtures).
  await db.query(
    `select pg_catalog.set_config('request.jwt.claims', '{"role":"service_role"}', false)`,
  );

  const authUserIds: string[] = [];
  const companyIds: string[] = [];
  const appUserIds: string[] = [];
  const spaceIds: string[] = [];
  const noteIds: string[] = [];

  const cleanup = async (): Promise<void> => {
    const errors: string[] = [];
    const run = async (label: string, sql: string, ids: string[]) => {
      if (ids.length === 0) return;
      try {
        await db.query(sql, [ids]);
      } catch (error) {
        errors.push(`${label}: ${(error as Error).message}`);
      }
    };
    await run('notes', 'delete from public.meeting_notes where id = any($1::uuid[])', noteIds);
    await run('spaces', 'delete from public.spaces where id = any($1::uuid[])', spaceIds);
    await run('users', 'delete from public.users where id = any($1::uuid[])', appUserIds);
    await run('companies', 'delete from public.companies where id = any($1::uuid[])', companyIds);
    for (const id of authUserIds) {
      const { error } = await service.auth.admin.deleteUser(id);
      if (error) errors.push(`auth ${id}: ${error.message}`);
    }
    await db.end();
    if (errors.length > 0) {
      throw new Error(`Meeting-notes DB fixture cleanup failed: ${errors.join('; ')}`);
    }
  };

  const createCompany = async (label: string): Promise<string> => {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.companies (name, admin_ids, settings) values ($1, '{}', '{}') returning id`,
      [`MN DB ${label} ${ns}`],
    );
    companyIds.push(rows[0].id);
    return rows[0].id;
  };

  const createSpace = async (
    companyId: string,
    label: string,
    createdBy: MeetingNotesDbUser,
  ): Promise<string> => {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.spaces (company_id, name, type, status, created_by)
       values ($1, $2, 'workspace', 'active', $3) returning id`,
      [companyId, `MN DB ${label} ${ns}`, createdBy.appUserId],
    );
    spaceIds.push(rows[0].id);
    return rows[0].id;
  };

  const createUser = async (
    key: string,
    companyId: string,
    role: 'admin' | 'member',
  ): Promise<MeetingNotesDbUser> => {
    const email = `mndb-${key}-${ns}@local.test`;
    const { data, error } = await service.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error || !data.user) {
      throw new Error(`Failed to create auth user ${email}: ${error?.message ?? 'no user'}`);
    }
    authUserIds.push(data.user.id);

    // company_id is set at INSERT: the database rejects later direct
    // service-role membership updates (product path is the company RPCs).
    const displayName = `MN ${key} ${ns}`;
    const { rows } = await db.query<{ id: string }>(
      `insert into public.users (supabase_uid, email, display_name, company_id, role)
       values ($1, $2, $3, $4, $5::public.user_role) returning id`,
      [data.user.id, email, displayName, companyId, role],
    );
    appUserIds.push(rows[0].id);

    const client = newClient(MEETING_NOTES_ANON_KEY);
    const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD });
    if (signInError) {
      throw new Error(`Failed to sign in ${email}: ${signInError.message}`);
    }
    return { appUserId: rows[0].id, supabaseUid: data.user.id, email, displayName, client };
  };

  const createMemberRows = async (companyId: string, count: number, label: string): Promise<string[]> => {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.users (supabase_uid, email, display_name, company_id, role)
       select gen_random_uuid()::text,
              format('mndb-%s-%s-%s@local.test', $2::text, $3::text, g),
              format('MN %s %s %s', $2::text, g, $3::text),
              $1::uuid,
              'member'::public.user_role
       from generate_series(1, $4::int) as g
       returning id`,
      [companyId, label, ns, count],
    );
    const ids = rows.map((row) => row.id);
    appUserIds.push(...ids);
    return ids;
  };

  const seedNote = async (input: SeedNoteInput): Promise<SeededNote> => {
    const participants = input.participants ?? [];
    const editors = input.versionEditors ?? [input.author];
    const title = input.title ?? `Note ${randomUUID().slice(0, 6)}`;
    const participantJson = JSON.stringify(
      participants.map((p) => ({ user_id: p.appUserId, display_name: p.displayName })),
    );
    const content = '<p>Seeded content</p>';
    const lastEditor = editors[editors.length - 1];

    const { rows } = await db.query<{ id: string }>(
      `insert into public.meeting_notes
         (company_id, room_id, title, meeting_date, content, summary, generated_by,
          author_user_id, author_name, created_by, edited_by, revision)
       values ($1, $2, $3, now(), $4, null, 'user', $5, $6, $5, $7, $8)
       returning id`,
      [
        input.companyId,
        input.roomId,
        title,
        content,
        input.author.appUserId,
        input.author.displayName,
        lastEditor.appUserId,
        editors.length,
      ],
    );
    const noteId = rows[0].id;
    noteIds.push(noteId);

    for (const [index, participant] of participants.entries()) {
      await db.query(
        `insert into public.meeting_note_participants (note_id, user_id, display_name, sort_order)
         values ($1, $2, $3, $4)`,
        [noteId, participant.appUserId, participant.displayName, index],
      );
    }

    const versionIds: string[] = [];
    for (const [index, editor] of editors.entries()) {
      const { rows: versionRows } = await db.query<{ id: string }>(
        `insert into public.meeting_note_versions
           (note_id, revision, title, meeting_date, participants, content, summary,
            editor_user_id, editor_name, edited_by)
         values ($1, $2, $3, now(), $4::jsonb, $5, null, $6, $7, $6)
         returning id`,
        [noteId, index + 1, title, participantJson, content, editor.appUserId, editor.displayName],
      );
      versionIds.push(versionRows[0].id);
    }

    const { rows: itemRows } = await db.query<{ id: string }>(
      `insert into public.meeting_note_action_items
         (note_id, description, assignee_id, assignee_name, creator_user_id, creator_name)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [
        noteId,
        `Follow up ${ns}`,
        input.itemAssignee?.appUserId ?? null,
        input.itemAssignee?.displayName ?? null,
        input.author.appUserId,
        input.author.displayName,
      ],
    );

    return { noteId, versionIds, itemId: itemRows[0].id };
  };

  try {
    const companyA = await createCompany('Company A');
    const companyB = await createCompany('Company B');
    const adminA = await createUser('admin-a', companyA, 'admin');
    const authorA = await createUser('author-a', companyA, 'member');
    const participantA = await createUser('participant-a', companyA, 'member');
    const memberA = await createUser('member-a', companyA, 'member');
    const adminB = await createUser('admin-b', companyB, 'admin');
    const memberB = await createUser('member-b', companyB, 'member');
    const spaceA = await createSpace(companyA, 'Space A', adminA);
    const spaceB = await createSpace(companyB, 'Space B', adminB);

    return {
      ns,
      companyA,
      companyB,
      spaceA,
      spaceB,
      adminA,
      authorA,
      participantA,
      memberA,
      adminB,
      memberB,
      anon: newClient(MEETING_NOTES_ANON_KEY),
      service,
      createCompany,
      createSpace,
      createUser,
      createMemberRows,
      seedNote,
      query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[] = []) =>
        (await db.query<Row>(sql, params)).rows,
      cleanup,
    };
  } catch (error) {
    await cleanup().catch(() => undefined);
    throw error;
  }
}

/** The four meeting-note tables a client could reach through PostgREST. */
export const MEETING_NOTE_TABLES = [
  'meeting_notes',
  'meeting_note_participants',
  'meeting_note_versions',
  'meeting_note_action_items',
] as const;

export type MeetingNoteTable = (typeof MEETING_NOTE_TABLES)[number];

/** Column that links each table's rows to a note. */
export function noteKey(table: MeetingNoteTable): 'id' | 'note_id' {
  return table === 'meeting_notes' ? 'id' : 'note_id';
}

/** Rows of `table` for `noteId` visible to `client` under RLS. */
export async function visibleRowCount(
  client: SupabaseClient,
  table: MeetingNoteTable,
  noteId: string,
): Promise<number> {
  const { data, error } = await client.from(table).select('*').eq(noteKey(table), noteId);
  if (error) {
    throw new Error(`select ${table} failed: ${error.code} ${error.message}`);
  }
  return data.length;
}
