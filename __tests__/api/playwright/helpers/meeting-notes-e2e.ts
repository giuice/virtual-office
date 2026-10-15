import { randomUUID } from 'node:crypto';

import { expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import type { Client } from 'pg';

import { LOCAL_SUPABASE_API_URL, LOCAL_SUPABASE_SERVICE_ROLE_KEY } from './local-supabase-mode';
import { withLocalMessagingDb } from './messaging-local-db';

/**
 * Phase 6 meeting-notes E2E world (T5; SPEC AC-001, AC-014, AC-015, AC-020).
 *
 * Company A is the messaging seed's shared company (primary = admin, secondary
 * = member). Notes of company A are written through the REAL routes with a
 * signed-in page's cookies (POST /api/meeting-notes, POST .../items), and a
 * space is deleted through the real DELETE /api/spaces route. Only state no
 * product route may create for the caller is trusted SQL on the LOCAL database
 * (loopback only, helpers/local-db-url.ts): dedicated spaces of company A (so a
 * test's listing never mixes with notes of earlier runs) and a second company B
 * with its own space, member row, and note (the isolation probe).
 *
 * Every name starts with MEETING_NOTES_E2E_PREFIX; `cleanup` removes what the
 * test created and the global setup sweeps what interrupted runs left.
 */
export const MEETING_NOTES_E2E_PREFIX = 'MN E2E';
const E2E_EMAIL_PATTERN = 'mn-e2e-%@local.test';

/** A word unique to one test run (letters only, so search tokenizes it as one word). */
export function uniqueSearchWord(): string {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  let word = 'mnx';
  for (let i = 0; i < 9; i += 1) word += letters[Math.floor(Math.random() * letters.length)];
  return word;
}

/** Local calendar day 'YYYY-MM-DD' of `date` (what a date input shows). */
export function localDay(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** `days` days before now, at local noon (stays inside that local day). */
export function daysAgo(days: number): Date {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date;
}

export interface CreateNoteInput {
  spaceId: string;
  title: string;
  meetingDate: Date;
  /** Sanitized server-side; plain paragraphs are enough here. */
  content: string;
  /** Application users.id of current members of company A; default none. */
  participantIds?: string[];
}

export interface UpdateNoteInput {
  expectedRevision: number;
  title: string;
  meetingDate: Date;
  content: string;
  participantIds: string[];
}

/** The note view as GET /api/meeting-notes/[id] returns it (the fields the specs read). */
export interface NoteDetailSnapshot {
  id: string;
  title: string;
  meetingDate: string;
  content: string;
  summary: string | null;
  revision: number;
  participants: Array<{ userId: string; displayName: string; isCurrentMember: boolean }>;
  actionItems: ActionItemSnapshot[];
  rights: { canEdit: boolean; canDelete: boolean };
}

/** An action item as the note view returns it (the fields the specs read). */
export interface ActionItemSnapshot {
  id: string;
  description: string;
  assigneeId: string | null;
  assigneeName: string | null;
  /** 'YYYY-MM-DD' or null. */
  dueDate: string | null;
  completed: boolean;
  revision: number;
}

export interface ActionItemInput {
  /** users.id of a current member of company A; default unassigned. */
  assigneeId?: string | null;
  /** 'YYYY-MM-DD'; default none. */
  dueDate?: string | null;
}

export interface NoteVersionSnapshot {
  id: string;
  revision: number;
  title: string;
  meetingDate: string;
  editorName: string;
  createdAt: string;
  content?: string;
  summary?: string | null;
  participants?: Array<{ userId: string; displayName: string }>;
}

export interface MeetingNotesE2EWorld {
  readonly runTag: string;
  /** A dedicated space of company A (trusted SQL); `isPublic: false` = private. */
  createSpace(label: string, options?: { isPublic?: boolean }): Promise<{ id: string; name: string }>;
  /** Creates a note through POST /api/meeting-notes as the page's signed-in user. */
  createNote(page: Page, input: CreateNoteInput): Promise<string>;
  /** Saves a note through PATCH /api/meeting-notes/[id]; returns the new revision. */
  updateNote(page: Page, noteId: string, input: UpdateNoteInput): Promise<number>;
  /** GET /api/meeting-notes/[id] as the page's user: HTTP status and, when 200, the note. */
  readNote(page: Page, noteId: string): Promise<{ status: number; note: NoteDetailSnapshot | null }>;
  /** GET /api/meeting-notes/[id]/versions as the page's user (newest first). */
  readVersions(page: Page, noteId: string): Promise<NoteVersionSnapshot[]>;
  /** GET /api/meeting-notes/[id]/versions/[versionId] as the page's user. */
  readVersion(page: Page, noteId: string, versionId: string): Promise<NoteVersionSnapshot>;
  /** A member row of company A without an auth account (never signs in); trusted SQL. */
  createCompanyMember(label: string): Promise<{ id: string; displayName: string }>;
  /** Removes a member from company A through the product's removal function (actor: the creator admin). */
  removeFromCompany(userId: string): Promise<void>;
  /** The display name of an application user (trusted read). */
  displayNameOf(userId: string): Promise<string>;
  /**
   * Overwrites a note's stored content with RAW html, bypassing the write-side
   * sanitizer (trusted SQL): models markup that reached the database by any
   * other path, so a spec can prove the render-side sanitization (AC-003).
   */
  overwriteStoredContentUnsafe(noteId: string, html: string): Promise<void>;
  /** Adds an action item through POST /api/meeting-notes/[id]/items; returns the item. */
  addActionItem(page: Page, noteId: string, description: string, input?: ActionItemInput): Promise<ActionItemSnapshot>;
  /**
   * Stores a summary and a transcript with trusted SQL (no product route
   * writes them before T12/T13): models AI output and an uploaded transcript.
   */
  setSummaryAndTranscriptUnsafe(noteId: string, input: { summary: string | null; transcript: string | null }): Promise<void>;
  /** Deletes a space through the real DELETE /api/spaces route. */
  deleteSpaceThroughApi(page: Page, spaceId: string): Promise<void>;
  /** A note of another company (company B), seeded by trusted SQL. */
  createOtherCompanyNote(input: { title: string; content: string }): Promise<string>;
  /**
   * An account of company B that signs in through the login page: a LOCAL
   * Auth user (admin API of the local stack, loopback only) and its
   * public.users row in company B (trusted SQL). Removed by `cleanup`.
   */
  createOtherCompanyAccount(label: string): Promise<{ email: string; password: string; userId: string; displayName: string }>;
  /**
   * A MEMBER account of company A that signs in through the login page (T13,
   * AC-033): a LOCAL Auth user and its public.users row in company A (trusted
   * SQL). For specs that sign it out or remove it from the company without
   * touching the shared seed accounts. Removed by `cleanup`.
   */
  createCompanyAccount(label: string): Promise<{ email: string; password: string; userId: string; displayName: string }>;
  /**
   * Deletes company A's AI settings (trusted SQL; the table's delete trigger
   * removes the Vault key in the same transaction), so a spec starts from and
   * leaves "AI not configured" (T8; the shared seed company must not keep a key).
   */
  resetAiSettingsUnsafe(): Promise<void>;
  cleanup(): Promise<void>;
}

/** Auth admin API of the LOCAL Supabase stack (standard local demo key; never a hosted project). */
function localAuthAdmin() {
  return createClient(LOCAL_SUPABASE_API_URL, LOCAL_SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  }).auth.admin;
}

async function asServiceRole(db: Client): Promise<void> {
  // Trusted fixture path: classify raw SQL as service_role for the audit
  // triggers on public.users (same convention as the DB integration fixtures).
  await db.query(`select pg_catalog.set_config('request.jwt.claims', '{"role":"service_role"}', false)`);
}

/**
 * Deletes application users in one transaction and returns the row count.
 * A signed-in test account has space_presence_log rows; in local `atomic`
 * Presence mode the delete cascade only passes the movement write gate as an
 * internal reconciliation write (same convention as presence/local-fixture.ts).
 */
async function deleteUsersAsPresenceReconciliation(db: Client, sql: string, params: unknown[]): Promise<number> {
  await db.query('begin');
  try {
    const { rows } = await db.query<{ mode: string }>(
      'select mode from private.presence_runtime_control where singleton_id',
    );
    if (rows[0]?.mode === 'atomic') {
      await db.query("select pg_catalog.set_config('app.presence_internal_writer', 'atomic-reconciliation', true)");
    }
    const result = await db.query(sql, params);
    await db.query('commit');
    return result.rowCount ?? 0;
  } catch (error) {
    await db.query('rollback');
    throw error;
  }
}

export function createMeetingNotesE2EWorld(companyAId: string, creatorUserId: string): MeetingNotesE2EWorld {
  const runTag = randomUUID().slice(0, 8);
  const noteIds: string[] = [];
  const spaceIds: string[] = [];
  const userIds: string[] = [];
  const companyIds: string[] = [];
  const authUserIds: string[] = [];
  let companyB: { companyId: string; spaceId: string; userId: string } | null = null;

  const createSpace: MeetingNotesE2EWorld['createSpace'] = async (label, options = {}) => {
    const name = `${MEETING_NOTES_E2E_PREFIX} ${label} ${runTag}`;
    const id = await withLocalMessagingDb(async (db) => {
      await asServiceRole(db);
      const { rows } = await db.query<{ id: string }>(
        `insert into public.spaces (company_id, name, type, status, capacity, created_by, access_control, position)
         values ($1, $2, 'conference', 'active', 8, $3, $4::jsonb, $5::jsonb) returning id::text`,
        [
          companyAId,
          name,
          creatorUserId,
          JSON.stringify({ isPublic: options.isPublic ?? true }),
          JSON.stringify({ x: 100, y: 400, width: 180, height: 140 }),
        ],
      );
      return rows[0].id;
    });
    spaceIds.push(id);
    return { id, name };
  };

  const createNote: MeetingNotesE2EWorld['createNote'] = async (page, input) => {
    const response = await page.request.post('/api/meeting-notes', {
      data: {
        spaceId: input.spaceId,
        title: input.title,
        meetingDate: input.meetingDate.toISOString(),
        content: input.content,
        participantIds: input.participantIds ?? [],
      },
    });
    expect(response.status(), `create note "${input.title}": ${await response.text()}`).toBe(201);
    const body = (await response.json()) as { note: { id: string } };
    noteIds.push(body.note.id);
    return body.note.id;
  };

  const updateNote: MeetingNotesE2EWorld['updateNote'] = async (page, noteId, input) => {
    const response = await page.request.patch(`/api/meeting-notes/${noteId}`, {
      data: {
        expectedRevision: input.expectedRevision,
        title: input.title,
        meetingDate: input.meetingDate.toISOString(),
        content: input.content,
        participantIds: input.participantIds,
      },
    });
    expect(response.status(), `update note: ${await response.text()}`).toBe(200);
    const body = (await response.json()) as { note: { revision: number } };
    return body.note.revision;
  };

  const readNote: MeetingNotesE2EWorld['readNote'] = async (page, noteId) => {
    const response = await page.request.get(`/api/meeting-notes/${noteId}`);
    if (response.status() !== 200) return { status: response.status(), note: null };
    const body = (await response.json()) as { note: NoteDetailSnapshot };
    return { status: 200, note: body.note };
  };

  const readVersions: MeetingNotesE2EWorld['readVersions'] = async (page, noteId) => {
    const response = await page.request.get(`/api/meeting-notes/${noteId}/versions`);
    expect(response.status(), `read versions: ${await response.text()}`).toBe(200);
    return ((await response.json()) as { versions: NoteVersionSnapshot[] }).versions;
  };

  const readVersion: MeetingNotesE2EWorld['readVersion'] = async (page, noteId, versionId) => {
    const response = await page.request.get(`/api/meeting-notes/${noteId}/versions/${versionId}`);
    expect(response.status(), `read version: ${await response.text()}`).toBe(200);
    return ((await response.json()) as { version: NoteVersionSnapshot }).version;
  };

  const createCompanyMember: MeetingNotesE2EWorld['createCompanyMember'] = async (label) => {
    const displayName = `${MEETING_NOTES_E2E_PREFIX} ${label} ${runTag}`;
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const id = await withLocalMessagingDb(async (db) => {
      await asServiceRole(db);
      const { rows } = await db.query<{ id: string }>(
        `insert into public.users (supabase_uid, email, display_name, company_id, role)
         values (gen_random_uuid()::text, $1, $2, $3, 'member'::public.user_role) returning id::text`,
        [`mn-e2e-${slug}-${runTag}@local.test`, displayName, companyAId],
      );
      return rows[0].id;
    });
    userIds.push(id);
    return { id, displayName };
  };

  const removeFromCompany: MeetingNotesE2EWorld['removeFromCompany'] = async (userId) => {
    await withLocalMessagingDb(async (db) => {
      await asServiceRole(db);
      const { rows } = await db.query<{ result: { ok?: boolean } | null }>(
        'select public.remove_company_member_and_presence($1, $2, $3) as result',
        [creatorUserId, userId, companyAId],
      );
      expect(rows[0]?.result?.ok, `remove member: ${JSON.stringify(rows[0]?.result)}`).toBe(true);
    });
  };

  const displayNameOf: MeetingNotesE2EWorld['displayNameOf'] = async (userId) =>
    withLocalMessagingDb(async (db) => {
      const { rows } = await db.query<{ display_name: string }>(
        'select display_name from public.users where id = $1',
        [userId],
      );
      expect(rows.length, `user ${userId} exists`).toBe(1);
      return rows[0].display_name;
    });

  const overwriteStoredContentUnsafe: MeetingNotesE2EWorld['overwriteStoredContentUnsafe'] = async (noteId, html) => {
    await withLocalMessagingDb(async (db) => {
      await asServiceRole(db);
      const result = await db.query('update public.meeting_notes set content = $1 where id = $2', [html, noteId]);
      expect(result.rowCount).toBe(1);
    });
  };

  const addActionItem: MeetingNotesE2EWorld['addActionItem'] = async (page, noteId, description, input = {}) => {
    const response = await page.request.post(`/api/meeting-notes/${noteId}/items`, {
      data: { description, assigneeId: input.assigneeId ?? null, dueDate: input.dueDate ?? null },
    });
    expect(response.ok(), `add action item: ${response.status()} ${await response.text()}`).toBe(true);
    return ((await response.json()) as { item: ActionItemSnapshot }).item;
  };

  const setSummaryAndTranscriptUnsafe: MeetingNotesE2EWorld['setSummaryAndTranscriptUnsafe'] = async (noteId, input) => {
    await withLocalMessagingDb(async (db) => {
      await asServiceRole(db);
      const result = await db.query(
        `update public.meeting_notes
            set summary = $1,
                transcript = $2,
                transcript_id = case when $2::text is null then null else gen_random_uuid() end
          where id = $3`,
        [input.summary, input.transcript, noteId],
      );
      expect(result.rowCount).toBe(1);
    });
  };

  const deleteSpaceThroughApi: MeetingNotesE2EWorld['deleteSpaceThroughApi'] = async (page, spaceId) => {
    const response = await page.request.delete(`/api/spaces?id=${encodeURIComponent(spaceId)}`);
    expect(response.status(), `delete space: ${await response.text()}`).toBe(200);
  };

  const ensureCompanyB = async (db: Client) => {
    if (companyB) return companyB;
    const { rows: companyRows } = await db.query<{ id: string }>(
      `insert into public.companies (name, admin_ids, settings) values ($1, '{}', '{}') returning id::text`,
      [`${MEETING_NOTES_E2E_PREFIX} Company B ${runTag}`],
    );
    const companyId = companyRows[0].id;
    companyIds.push(companyId);
    // A member row without an auth account: it never signs in, it only authors the note.
    const { rows: userRows } = await db.query<{ id: string }>(
      `insert into public.users (supabase_uid, email, display_name, company_id, role)
       values (gen_random_uuid()::text, $1, $2, $3, 'member'::public.user_role) returning id::text`,
      [`mn-e2e-b-${runTag}@local.test`, `${MEETING_NOTES_E2E_PREFIX} Author B ${runTag}`, companyId],
    );
    const userId = userRows[0].id;
    userIds.push(userId);
    const { rows: spaceRows } = await db.query<{ id: string }>(
      `insert into public.spaces (company_id, name, type, status, created_by)
       values ($1, $2, 'conference', 'active', $3) returning id::text`,
      [companyId, `${MEETING_NOTES_E2E_PREFIX} Space B ${runTag}`, userId],
    );
    spaceIds.push(spaceRows[0].id);
    companyB = { companyId, spaceId: spaceRows[0].id, userId };
    return companyB;
  };

  const createOtherCompanyNote: MeetingNotesE2EWorld['createOtherCompanyNote'] = async (input) =>
    withLocalMessagingDb(async (db) => {
      await asServiceRole(db);
      const b = await ensureCompanyB(db);
      const authorName = `${MEETING_NOTES_E2E_PREFIX} Author B ${runTag}`;
      const { rows } = await db.query<{ id: string }>(
        `insert into public.meeting_notes
           (company_id, room_id, title, meeting_date, content, summary, generated_by,
            author_user_id, author_name, created_by, edited_by, revision)
         values ($1, $2, $3, now(), $4, null, 'user', $5, $6, $5, $5, 1)
         returning id::text`,
        [b.companyId, b.spaceId, input.title, input.content, b.userId, authorName],
      );
      const noteId = rows[0].id;
      noteIds.push(noteId);
      await db.query(
        `insert into public.meeting_note_versions
           (note_id, revision, title, meeting_date, participants, content, summary,
            editor_user_id, editor_name, edited_by)
         values ($1, 1, $2, now(), '[]'::jsonb, $3, null, $4, $5, $4)`,
        [noteId, input.title, input.content, b.userId, authorName],
      );
      return noteId;
    });

  const createOtherCompanyAccount: MeetingNotesE2EWorld['createOtherCompanyAccount'] = async (label) => {
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const email = `mn-e2e-acct-${slug}-${runTag}@local.test`;
    const password = `mn-e2e-${randomUUID()}`;
    const displayName = `${MEETING_NOTES_E2E_PREFIX} ${label} ${runTag}`;
    const { data, error } = await localAuthAdmin().createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: displayName, name: displayName },
    });
    if (error || !data.user) throw new Error(`create local auth user: ${error?.message ?? 'no user'}`);
    authUserIds.push(data.user.id);
    const userId = await withLocalMessagingDb(async (db) => {
      await asServiceRole(db);
      const b = await ensureCompanyB(db);
      const { rows } = await db.query<{ id: string }>(
        `insert into public.users (supabase_uid, email, display_name, company_id, role)
         values ($1, $2, $3, $4, 'member'::public.user_role) returning id::text`,
        [data.user.id, email, displayName, b.companyId],
      );
      return rows[0].id;
    });
    userIds.push(userId);
    return { email, password, userId, displayName };
  };

  const createCompanyAccount: MeetingNotesE2EWorld['createCompanyAccount'] = async (label) => {
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const email = `mn-e2e-acct-a-${slug}-${runTag}@local.test`;
    const password = `mn-e2e-${randomUUID()}`;
    const displayName = `${MEETING_NOTES_E2E_PREFIX} ${label} ${runTag}`;
    const { data, error } = await localAuthAdmin().createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: displayName, name: displayName },
    });
    if (error || !data.user) throw new Error(`create local auth user: ${error?.message ?? 'no user'}`);
    authUserIds.push(data.user.id);
    const userId = await withLocalMessagingDb(async (db) => {
      await asServiceRole(db);
      const { rows } = await db.query<{ id: string }>(
        `insert into public.users (supabase_uid, email, display_name, company_id, role)
         values ($1, $2, $3, $4, 'member'::public.user_role) returning id::text`,
        [data.user.id, email, displayName, companyAId],
      );
      return rows[0].id;
    });
    userIds.push(userId);
    return { email, password, userId, displayName };
  };

  const resetAiSettingsUnsafe: MeetingNotesE2EWorld['resetAiSettingsUnsafe'] = async () => {
    await withLocalMessagingDb(async (db) => {
      await db.query('delete from public.meeting_note_ai_settings where company_id = $1', [companyAId]);
    });
  };

  const cleanup = async () => {
    await withLocalMessagingDb(async (db) => {
      await asServiceRole(db);
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
      await run('notes of test spaces', 'delete from public.meeting_notes where room_id = any($1::uuid[])', spaceIds);
      // Users before spaces: a signed-in test account's presence rows (and its
      // current space) reference a test space; deleting the user cascades them.
      if (userIds.length > 0) {
        try {
          await deleteUsersAsPresenceReconciliation(db, 'delete from public.users where id = any($1::uuid[])', [userIds]);
        } catch (error) {
          errors.push(`users: ${(error as Error).message}`);
        }
      }
      await run('spaces', 'delete from public.spaces where id = any($1::uuid[])', spaceIds);
      await run('companies', 'delete from public.companies where id = any($1::uuid[])', companyIds);
      for (const authUserId of authUserIds) {
        const { error } = await localAuthAdmin().deleteUser(authUserId);
        if (error) errors.push(`auth user: ${error.message}`);
      }
      if (errors.length > 0) {
        throw new Error(`Meeting-notes E2E cleanup failed: ${errors.join('; ')}`);
      }
    });
  };

  return {
    runTag,
    createSpace,
    createNote,
    updateNote,
    readNote,
    readVersions,
    readVersion,
    createCompanyMember,
    removeFromCompany,
    displayNameOf,
    overwriteStoredContentUnsafe,
    addActionItem,
    setSummaryAndTranscriptUnsafe,
    deleteSpaceThroughApi,
    createOtherCompanyNote,
    createOtherCompanyAccount,
    createCompanyAccount,
    resetAiSettingsUnsafe,
    cleanup,
  };
}

/**
 * Removes what interrupted runs left: every note, space, member row, and
 * company whose name/title/email carries the E2E prefix. Local database only.
 */
export async function sweepMeetingNotesE2ELeftovers(): Promise<Record<string, number>> {
  return withLocalMessagingDb(async (db) => {
    await asServiceRole(db);
    const like = `${MEETING_NOTES_E2E_PREFIX} %`;
    const notes = await db.query(
      `delete from public.meeting_notes
        where title like $1
           or room_id in (select id from public.spaces where name like $1)
           or company_id in (select id from public.companies where name like $1)`,
      [like],
    );
    const users = await deleteUsersAsPresenceReconciliation(db, 'delete from public.users where email like $1', [
      E2E_EMAIL_PATTERN,
    ]);
    const spaces = await db.query('delete from public.spaces where name like $1', [like]);
    const companies = await db.query('delete from public.companies where name like $1', [like]);
    // Local Auth users of createOtherCompanyAccount (local stack only).
    const authUsers = await db.query('delete from auth.users where email like $1', [E2E_EMAIL_PATTERN]);
    return {
      notes: notes.rowCount ?? 0,
      spaces: spaces.rowCount ?? 0,
      users,
      companies: companies.rowCount ?? 0,
      authUsers: authUsers.rowCount ?? 0,
    };
  });
}
