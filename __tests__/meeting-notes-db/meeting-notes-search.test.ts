import { performance } from 'node:perf_hooks';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { GET as searchNotes } from '@/app/api/meeting-notes/search/route';
import { POST as createNote } from '@/app/api/meeting-notes/route';
import { PATCH as updateNote } from '@/app/api/meeting-notes/[id]/route';
import { POST as createItem } from '@/app/api/meeting-notes/[id]/items/route';
import { DELETE as deleteItem, PATCH as updateItem } from '@/app/api/meeting-notes/[id]/items/[itemId]/route';

import { createMeetingNotesWorld, type MeetingNotesDbUser, type MeetingNotesDbWorld } from './fixtures';
import { callRoute, signInSessionCookies, useLocalSupabaseEnv, type RouteResult, type SessionCookie } from './route-session';

vi.mock('next/headers', async () => (await import('./route-session')).nextHeadersMock);

interface Segment {
  text: string;
  highlighted: boolean;
}

interface Hit {
  id: string;
  roomId: string | null;
  title: string;
  meetingDate: string;
  relevance: number | null;
  revision: number;
  excerpt: { field: string; segments: Segment[] } | null;
}

interface Page {
  items: Hit[];
  nextCursor: number | null;
  hasMore: boolean;
  totalCount?: number;
}

interface SeedInput {
  companyId: string;
  roomId: string | null;
  author: MeetingNotesDbUser;
  title: string;
  content?: string;
  summary?: string | null;
  meetingDate?: string;
  items?: string[];
}

// Phase 6 T4 (FR-004, FR-026, FR-028, BR-001, SM-2, SM-3; AC-014, AC-020
// search part): the real GET /api/meeting-notes/search handler in-process,
// with real local sessions, against public.search_meeting_notes (migration
// 20261013114402). Fixture notes are seeded with trusted SQL; index upkeep is
// exercised through the real note and item routes.
describe('meeting-notes search (local Supabase)', () => {
  let world: MeetingNotesDbWorld;
  let spaceA2: string;
  const sessions = new Map<string, SessionCookie[]>();

  const as = (user: MeetingNotesDbUser): SessionCookie[] => {
    const cookies = sessions.get(user.appUserId);
    if (!cookies) throw new Error(`no session for ${user.displayName}`);
    return cookies;
  };

  const search = (user: MeetingNotesDbUser, params: Record<string, string>): Promise<RouteResult> =>
    callRoute(as(user), searchNotes, {
      method: 'GET',
      path: `/api/meeting-notes/search?${new URLSearchParams(params).toString()}`,
    });

  const page = async (user: MeetingNotesDbUser, params: Record<string, string>): Promise<Page> => {
    const result = await search(user, params);
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    return result.body as unknown as Page;
  };

  const ids = (p: Page): string[] => p.items.map((hit) => hit.id);

  const highlights = (hit: Hit): string[] =>
    (hit.excerpt?.segments ?? []).filter((s) => s.highlighted).map((s) => s.text);

  const excerptText = (hit: Hit): string => (hit.excerpt?.segments ?? []).map((s) => s.text).join('');

  const seed = async (input: SeedInput): Promise<string> => {
    const [row] = await world.query<{ id: string }>(
      `insert into public.meeting_notes
         (company_id, room_id, title, meeting_date, content, summary, generated_by,
          author_user_id, author_name, created_by, edited_by)
       values ($1, $2, $3, $4, $5, $6, 'user', $7, $8, $7, $7)
       returning id`,
      [
        input.companyId,
        input.roomId,
        input.title,
        input.meetingDate ?? '2026-05-01T12:00:00Z',
        input.content ?? '<p>Notas gerais</p>',
        input.summary ?? null,
        input.author.appUserId,
        input.author.displayName,
      ],
    );
    for (const description of input.items ?? []) {
      await world.query(
        `insert into public.meeting_note_action_items (note_id, description, creator_user_id, creator_name)
         values ($1, $2, $3, $4)`,
        [row.id, description, input.author.appUserId, input.author.displayName],
      );
    }
    return row.id;
  };

  // Notes per field (company A) and their company-B twins with the same words.
  const fieldNotes = { title: '', content: '', summary: '', item: '' };
  const twinNotes: string[] = [];

  beforeAll(async () => {
    useLocalSupabaseEnv();
    world = await createMeetingNotesWorld();
    for (const user of [world.adminA, world.authorA, world.memberA, world.adminB, world.memberB]) {
      sessions.set(user.appUserId, await signInSessionCookies(user.email));
    }
    spaceA2 = await world.createSpace(world.companyA, 'Space A2', world.adminA);

    const fields = (companyId: string, roomId: string, author: MeetingNotesDbUser) => ({
      title: { companyId, roomId, author, title: 'Zeppelin kickoff' },
      content: {
        companyId,
        roomId,
        author,
        title: 'Revisão anual',
        content:
          '<p>Revisamos o <strong>orçamento</strong> &amp; a <em>reunião</em> de equipe.</p>' +
          '<ul><li><a href="https://quixotic.example/path" rel="noopener noreferrer nofollow">site</a></li></ul>',
      },
      summary: { companyId, roomId, author, title: 'Fechamento', summary: 'Budget approved by finance' },
      item: { companyId, roomId, author, title: 'Vendas', items: ['Enviar relatório de vendas'] },
    });
    const a = fields(world.companyA, world.spaceA, world.authorA);
    fieldNotes.title = await seed(a.title);
    fieldNotes.content = await seed(a.content);
    fieldNotes.summary = await seed(a.summary);
    fieldNotes.item = await seed(a.item);
    const b = fields(world.companyB, world.spaceB, world.adminB);
    for (const input of [b.title, b.content, b.summary, b.item]) twinNotes.push(await seed(input));
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    if (world) {
      // Notes created here (seeded or through the routes) go first; the world
      // then removes its users, spaces, and companies.
      await world.query('delete from public.meeting_notes where company_id = any($1::uuid[])', [
        [world.companyA, world.companyB],
      ]);
      await world.cleanup();
    }
  });

  it('grants EXECUTE on the search RPC to authenticated only, and anon cannot call it', async () => {
    const rows = await world.query<{ fn: string; anon: boolean; authenticated: boolean; service_role: boolean }>(
      `select p.oid::regprocedure::text as fn,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
              has_function_privilege('service_role', p.oid, 'execute') as service_role
       from pg_proc as p
       join pg_namespace as n on n.oid = p.pronamespace
       where (n.nspname = 'public' and p.proname = 'search_meeting_notes')
          or (n.nspname = 'private' and p.proname in ('meeting_note_plain_text', 'meeting_note_search_document',
              'meeting_note_item_search_document', 'meeting_note_search_query', 'meeting_note_search_tsvector',
              'meeting_note_search_headline'))
       order by 1`,
    );
    expect(rows).toHaveLength(7);
    for (const row of rows) {
      const isRpc = row.fn.startsWith('search_meeting_notes');
      // The excerpt helper is called only by the definer RPC (as its owner).
      const isRpcOnly = row.fn.startsWith('private.meeting_note_search_headline');
      expect(row.anon, row.fn).toBe(false);
      expect(row.authenticated, row.fn).toBe(isRpc);
      // Pure helpers: service_role evaluates them when it writes notes/items.
      expect(row.service_role, row.fn).toBe(!isRpc && !isRpcOnly);
    }
    const helpers = await world.query<{ fn: string; owner: string; config: string[] | null; public_grant: boolean }>(
      `select p.oid::regprocedure::text as fn, pg_get_userbyid(p.proowner) as owner, p.proconfig as config,
              exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as a where a.grantee = 0) as public_grant
       from pg_proc as p
       where p.oid in ('private.meeting_note_search_tsvector(text[], text[])'::regprocedure,
                       'private.meeting_note_search_headline(text, tsquery)'::regprocedure)`,
    );
    expect(helpers).toHaveLength(2);
    for (const helper of helpers) {
      expect(helper, helper.fn).toMatchObject({ owner: 'postgres', config: ['search_path=""'], public_grant: false });
    }
    const [definer] = await world.query<{ secdef: boolean; owner: string; config: string[] | null }>(
      `select p.prosecdef as secdef, pg_get_userbyid(p.proowner) as owner, p.proconfig as config
       from pg_proc as p where p.oid = 'public.search_meeting_notes(text, uuid, boolean, timestamptz, timestamptz, integer, integer)'::regprocedure`,
    );
    expect(definer).toEqual({ secdef: true, owner: 'postgres', config: ['search_path=""'] });
    const { error } = await world.anon.rpc('search_meeting_notes', { p_query: 'zeppelin' });
    expect(error).not.toBeNull();
  });

  it('refuses a request without a session (401) and invalid parameters (400)', async () => {
    const anonymous = await callRoute([], searchNotes, { method: 'GET', path: '/api/meeting-notes/search?q=zeppelin' });
    expect(anonymous.status).toBe(401);

    const cases: [Record<string, string>, string][] = [
      [{ q: 'x'.repeat(201) }, 'MEETING_NOTE_SEARCH_QUERY_TOO_LONG'],
      [{ q: 'zeppelin', spaceId: world.spaceA, removed: 'true' }, 'MEETING_NOTE_SEARCH_FILTER_INVALID'],
      [{ q: 'zeppelin', from: '2026-05-01T00:00:00Z', to: '2026-04-01T00:00:00Z' }, 'MEETING_NOTE_SEARCH_PERIOD_INVALID'],
      [{ q: 'zeppelin', from: '2026-05-01' }, 'MEETING_NOTE_SEARCH_PERIOD_INVALID'],
      [{ q: 'zeppelin', spaceId: 'not-a-uuid' }, 'MEETING_NOTE_SPACE_INVALID'],
      [{ q: 'zeppelin', limit: '51' }, 'BAD_REQUEST'],
      [{ q: 'zeppelin', cursor: '-1' }, 'BAD_REQUEST'],
      [{ q: 'zeppelin', removed: 'yes' }, 'BAD_REQUEST'],
      // Values zod accepts but Postgres rejects (22P05, 22008, 22009): 400, never 500.
      [{ q: 'zep\u0000pelin' }, 'MEETING_NOTE_SEARCH_INVALID'],
      [{ q: 'zeppelin', from: '0000-01-01T00:00:00Z' }, 'MEETING_NOTE_SEARCH_PERIOD_INVALID'],
      [{ q: 'zeppelin', to: '2026-01-01T00:00:00+16:00' }, 'MEETING_NOTE_SEARCH_PERIOD_INVALID'],
    ];
    for (const [params, code] of cases) {
      const result = await search(world.memberA, params);
      expect(result.status, JSON.stringify(params)).toBe(400);
      expect(result.body.code, JSON.stringify(params)).toBe(code);
    }
  });

  it('matches a word only in the title, PT/EN case- and accent-insensitively, with a title excerpt', async () => {
    for (const q of ['zeppelin', 'ZEPPELIN', 'Zeppelin']) {
      const p = await page(world.memberA, { q });
      expect(ids(p), q).toEqual([fieldNotes.title]);
      expect(p.items[0].excerpt?.field).toBe('title');
      expect(highlights(p.items[0])).toEqual(['Zeppelin']);
      expect(p.totalCount).toBe(1);
    }
  });

  it('matches a word only in the content text (inside formatting tags), with and without accents', async () => {
    for (const q of ['orçamento', 'orcamento', 'ORÇAMENTO', 'Orcamento', 'reuniao', 'REUNIÃO']) {
      const p = await page(world.memberA, { q });
      expect(ids(p), q).toEqual([fieldNotes.content]);
      const hit = p.items[0];
      expect(hit.excerpt?.field, q).toBe('content');
      // Plain text: original accented words, entities decoded, no markup.
      expect(excerptText(hit)).toContain('Revisamos o orçamento & a reunião de equipe.');
      expect(excerptText(hit)).not.toMatch(/<|&amp;|href|strong/);
    }
    expect(highlights((await page(world.memberA, { q: 'orcamento' })).items[0])).toEqual(['orçamento']);
    // Tag names and attribute values are not indexed; link text is.
    for (const q of ['quixotic', 'strong', 'href', 'noopener']) {
      expect(ids(await page(world.memberA, { q })), q).toEqual([]);
    }
    expect(ids(await page(world.memberA, { q: 'site' }))).toEqual([fieldNotes.content]);
  });

  it('matches a word only in the summary and only in an action item, with excerpts from that field', async () => {
    for (const q of ['budget', 'BUDGET', 'Budget']) {
      const p = await page(world.memberA, { q });
      expect(ids(p), q).toEqual([fieldNotes.summary]);
      expect(p.items[0].excerpt?.field).toBe('summary');
      expect(highlights(p.items[0])).toEqual(['Budget']);
    }
    for (const q of ['relatório', 'relatorio', 'RELATORIO']) {
      const p = await page(world.memberA, { q });
      expect(ids(p), q).toEqual([fieldNotes.item]);
      expect(p.items[0].excerpt?.field).toBe('action_item');
      expect(highlights(p.items[0])).toEqual(['relatório']);
    }
  });

  it('never shows another company: members and admins of B see only B, members of A only A', async () => {
    const aIds = Object.values(fieldNotes);
    for (const q of ['zeppelin', 'orcamento', 'budget', 'relatorio', '']) {
      for (const user of [world.memberB, world.adminB]) {
        const p = await page(user, { q });
        expect(p.items.length, `${user.displayName} ${q}`).toBeGreaterThan(0);
        for (const hit of p.items) {
          expect(twinNotes, `${user.displayName} ${q}`).toContain(hit.id);
          expect(aIds).not.toContain(hit.id);
        }
      }
      for (const hit of (await page(world.adminA, { q })).items) {
        expect(twinNotes).not.toContain(hit.id);
      }
    }
    // A space of the other company as a filter yields nothing.
    expect(ids(await page(world.memberA, { q: 'zeppelin', spaceId: world.spaceB }))).toEqual([]);
    expect(ids(await page(world.memberB, { q: 'zeppelin', spaceId: world.spaceA }))).toEqual([]);
  });

  it('filters by space, by "Space removed", and by meeting-date period (from inclusive, to exclusive)', async () => {
    const gone = await world.createSpace(world.companyA, 'Space gone', world.adminA);
    const inA = await seed({ companyId: world.companyA, roomId: world.spaceA, author: world.authorA, title: 'Sinergia janeiro', meetingDate: '2026-01-10T12:00:00Z' });
    const inA2 = await seed({ companyId: world.companyA, roomId: spaceA2, author: world.authorA, title: 'Sinergia março', meetingDate: '2026-03-10T12:00:00Z' });
    const removed = await seed({ companyId: world.companyA, roomId: gone, author: world.authorA, title: 'Sinergia junho', meetingDate: '2026-06-10T00:00:00Z' });
    await world.query('delete from public.spaces where id = $1', [gone]);

    const all = await page(world.memberA, { q: 'sinergia' });
    expect(new Set(ids(all))).toEqual(new Set([inA, inA2, removed]));
    expect(all.items.find((hit) => hit.id === removed)?.roomId).toBeNull();

    expect(ids(await page(world.memberA, { q: 'sinergia', spaceId: world.spaceA }))).toEqual([inA]);
    expect(ids(await page(world.memberA, { q: 'sinergia', spaceId: spaceA2 }))).toEqual([inA2]);
    expect(ids(await page(world.memberA, { q: 'sinergia', removed: 'true' }))).toEqual([removed]);
    expect(ids(await page(world.memberA, { q: 'sinergia', from: '2026-02-01T00:00:00Z', to: '2026-04-01T00:00:00-03:00' }))).toEqual([inA2]);
    // `to` is exclusive (the removed-space note is exactly at 2026-06-10T00:00Z), `from` inclusive.
    expect(ids(await page(world.memberA, { q: 'sinergia', from: '2026-03-10T12:00:00Z', to: '2026-06-10T00:00:00Z' }))).toEqual([inA2]);
    expect(ids(await page(world.memberA, { q: 'sinergia', from: '2026-06-10T00:00:00Z' }))).toEqual([removed]);
    expect(ids(await page(world.memberA, { q: 'sinergia', spaceId: world.spaceA, from: '2026-02-01T00:00:00Z' }))).toEqual([]);

    // List mode (empty query) applies the same filters without ranking.
    const listed = await page(world.memberA, { removed: 'true' });
    expect(ids(listed)).toEqual([removed]);
    expect(listed.items[0].relevance).toBeNull();
    expect(listed.items[0].excerpt).toBeNull();
  });

  it('orders by relevance, then meeting date (newest first), then id', async () => {
    const titleMatch = async (date: string) =>
      seed({ companyId: world.companyA, roomId: world.spaceA, author: world.authorA, title: 'Iguana sync', content: '<p>Status</p>', meetingDate: date });
    const older = await titleMatch('2026-02-01T10:00:00Z');
    const middle = await titleMatch('2026-02-02T10:00:00Z');
    const newer = await titleMatch('2026-02-03T10:00:00Z');
    // Newest meeting, but the word is only in the content (lower weight).
    const contentOnly = await seed({
      companyId: world.companyA,
      roomId: world.spaceA,
      author: world.authorA,
      title: 'Weekly status',
      content: '<p>iguana citada uma vez</p>',
      meetingDate: '2026-02-04T10:00:00Z',
    });

    const p = await page(world.memberA, { q: 'iguana' });
    expect(ids(p)).toEqual([newer, middle, older, contentOnly]);
    const [r1, r2, r3, r4] = p.items.map((hit) => hit.relevance ?? Number.NaN);
    expect(r1).toBe(r2);
    expect(r2).toBe(r3);
    expect(r3).toBeGreaterThan(r4);
  });

  it('paginates with offsets without duplicates or gaps, in the full order', async () => {
    const seeded: string[] = [];
    const dates = ['2026-07-01', '2026-07-02', '2026-07-02', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05'];
    for (const date of dates) {
      seeded.push(
        await seed({ companyId: world.companyA, roomId: world.spaceA, author: world.authorA, title: 'Pelican review', meetingDate: `${date}T09:00:00Z` }),
      );
    }
    const full = await page(world.memberA, { q: 'pelican', limit: '50' });
    expect(full.totalCount).toBe(7);
    expect(new Set(ids(full))).toEqual(new Set(seeded));
    // Same relevance: meeting date desc, then id desc for equal dates.
    for (let i = 1; i < full.items.length; i += 1) {
      const [prev, next] = [full.items[i - 1], full.items[i]];
      expect(Date.parse(prev.meetingDate)).toBeGreaterThanOrEqual(Date.parse(next.meetingDate));
      if (prev.meetingDate === next.meetingDate) expect(prev.id > next.id).toBe(true);
    }

    const collected: string[] = [];
    const cursors: (number | null)[] = [];
    let cursor: number | null = 0;
    while (cursor !== null) {
      const p: Page = await page(world.memberA, { q: 'pelican', limit: '3', cursor: String(cursor) });
      expect(p.totalCount).toBe(7);
      collected.push(...ids(p));
      cursor = p.nextCursor;
      cursors.push(cursor);
    }
    expect(cursors).toEqual([3, 6, null]);
    expect(collected).toEqual(ids(full));

    const past = await page(world.memberA, { q: 'pelican', limit: '3', cursor: '9' });
    expect(past.items).toEqual([]);
    expect(past.hasMore).toBe(false);
  });

  it('keeps the index current on note updates and item add, edit, and delete (no revision bump, no version)', async () => {
    const created = await callRoute(as(world.authorA), createNote, {
      method: 'POST',
      path: '/api/meeting-notes',
      body: { spaceId: world.spaceA, title: 'Currency check', meetingDate: '2026-08-01T10:00:00Z', content: '<p>Começo</p>' },
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const note = created.body.note as { id: string; revision: number; title: string };
    const noteId = note.id;
    const state = async () =>
      (
        await world.query<{ revision: string; versions: string }>(
          `select n.revision::text as revision,
                  (select count(*) from public.meeting_note_versions as v where v.note_id = n.id)::text as versions
           from public.meeting_notes as n where n.id = $1`,
          [noteId],
        )
      )[0];

    expect(ids(await page(world.memberA, { q: 'flamingo' }))).toEqual([]);
    const added = await callRoute(as(world.authorA), createItem, {
      method: 'POST',
      path: `/api/meeting-notes/${noteId}/items`,
      body: { description: 'Comprar flamingo' },
      params: { id: noteId },
    });
    expect(added.status, JSON.stringify(added.body)).toBe(201);
    const item = added.body.item as { id: string; revision: number };
    const afterAdd = await page(world.memberA, { q: 'flamingo' });
    expect(ids(afterAdd)).toEqual([noteId]);
    expect(afterAdd.items[0].excerpt?.field).toBe('action_item');

    const edited = await callRoute(as(world.authorA), updateItem, {
      method: 'PATCH',
      path: `/api/meeting-notes/${noteId}/items/${item.id}`,
      body: { expectedRevision: item.revision, description: 'Comprar tucano', assigneeId: null, dueDate: null },
      params: { id: noteId, itemId: item.id },
    });
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    expect(ids(await page(world.memberA, { q: 'flamingo' }))).toEqual([]);
    expect(ids(await page(world.memberA, { q: 'tucano' }))).toEqual([noteId]);

    const removed = await callRoute(as(world.authorA), deleteItem, {
      method: 'DELETE',
      path: `/api/meeting-notes/${noteId}/items/${item.id}?expectedRevision=${(edited.body.item as { revision: number }).revision}`,
      params: { id: noteId, itemId: item.id },
    });
    expect(removed.status, JSON.stringify(removed.body)).toBe(200);
    expect(ids(await page(world.memberA, { q: 'tucano' }))).toEqual([]);
    // Item writes never touch the note: same revision, still one version.
    expect(await state()).toEqual({ revision: '1', versions: '1' });

    const updated = await callRoute(as(world.authorA), updateNote, {
      method: 'PATCH',
      path: `/api/meeting-notes/${noteId}`,
      body: {
        expectedRevision: 1,
        title: 'Currency revised',
        meetingDate: '2026-08-01T10:00:00Z',
        content: '<p>O <b>albatroz</b> chegou</p>',
        participantIds: [],
      },
      params: { id: noteId },
    });
    expect(updated.status, JSON.stringify(updated.body)).toBe(200);
    const afterUpdate = await page(world.memberA, { q: 'albatroz' });
    expect(ids(afterUpdate)).toEqual([noteId]);
    expect(afterUpdate.items[0].excerpt?.field).toBe('content');
    expect(afterUpdate.items[0].revision).toBe(2);
    expect(ids(await page(world.memberA, { q: 'começo' }))).toEqual([]);
    expect(ids(await page(world.memberA, { q: 'currency check' }))).toEqual([]);
    expect(ids(await page(world.memberA, { q: 'currency revised' }))).toEqual([noteId]);
    // Exactly the RPC's own bump and version: search upkeep adds neither.
    expect(await state()).toEqual({ revision: '2', versions: '2' });
  });

  it('phrases keep word order and adjacency, and exclusions apply to every language variant (route and RPC)', async () => {
    const reversed = await seed({ companyId: world.companyA, roomId: world.spaceA, author: world.authorA, title: 'Budget review' });
    const inOrder = await seed({
      companyId: world.companyA,
      roomId: world.spaceA,
      author: world.authorA,
      title: 'Quarterly plan',
      content: '<p>We will review budget lines on Monday.</p>',
    });
    const meetings = await seed({ companyId: world.companyA, roomId: world.spaceA, author: world.authorA, title: 'Budget meetings' });
    const rpc = async (query: string): Promise<string[]> => {
      const { data, error } = await world.memberA.client.rpc('search_meeting_notes', { p_query: query, p_limit: 50 });
      expect(error).toBeNull();
      return (data as { note_id: string }[]).map((row) => row.note_id);
    };

    // "review budget" as a phrase: only the note with those words in that order, adjacent.
    expect(ids(await page(world.memberA, { q: '"review budget"' }))).toEqual([inOrder]);
    expect(await rpc('"review budget"')).toEqual([inOrder]);
    // Without quotes, word order does not matter.
    expect(new Set(ids(await page(world.memberA, { q: 'review budget' })))).toEqual(new Set([reversed, inOrder]));

    // budget -meeting: "meetings" is a variant of "meeting" (English stemming), so that note is excluded.
    for (const result of [ids(await page(world.memberA, { q: 'budget -meeting', limit: '50' })), await rpc('budget -meeting')]) {
      expect(result).not.toContain(meetings);
      expect(result).toEqual(expect.arrayContaining([reversed, inOrder, fieldNotes.summary]));
    }
    // The excluded note itself matches "budget meeting" and "meeting".
    expect(ids(await page(world.memberA, { q: 'budget meeting' }))).toEqual([meetings]);
    expect(ids(await page(world.memberA, { q: '"budget meeting"' }))).toEqual([meetings]);
  });

  it('excerpts highlight English-stemmed matches located far into the text', async () => {
    const filler = 'contexto '.repeat(60);
    const meetingNote = await seed({
      companyId: world.companyA,
      roomId: world.spaceA,
      author: world.authorA,
      title: 'Ata longa',
      content: `<p>${filler}</p><p>Two meetings were moved.</p>`,
    });
    const runningNote = await seed({
      companyId: world.companyA,
      roomId: world.spaceA,
      author: world.authorA,
      title: 'Ata corrida',
      summary: `${filler} The migration is running late.`,
    });

    const meetingHit = (await page(world.memberA, { q: 'meeting', limit: '50' })).items.find((hit) => hit.id === meetingNote);
    expect(meetingHit?.excerpt?.field).toBe('content');
    expect(highlights(meetingHit as Hit)).toEqual(['meetings']);
    expect(excerptText(meetingHit as Hit)).toContain('Two meetings were moved');

    const runHits = (await page(world.memberA, { q: 'run' })).items;
    expect(runHits.map((hit) => hit.id)).toEqual([runningNote]);
    expect(runHits[0].excerpt?.field).toBe('summary');
    expect(highlights(runHits[0])).toEqual(['running']);
    expect(excerptText(runHits[0])).toContain('migration is running late');

    // Portuguese stemming and accents still highlight as before.
    const accentHit = (await page(world.memberA, { q: 'REUNIAO' })).items[0];
    expect(highlights(accentHit)).toEqual(['reunião']);
  });

  it('returns the first page within 1 s at 1,000 notes in the company (plus B notes with the same words)', async () => {
    const filler = 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt. ';
    const seedBulk = async (companyId: string, roomId: string, author: MeetingNotesDbUser, count: number) => {
      const rows = await world.query<{ id: string }>(
        `insert into public.meeting_notes
           (company_id, room_id, title, meeting_date, content, summary, generated_by,
            author_user_id, author_name, created_by, edited_by)
         select $1, $2, format('Projeto %s planejamento', g),
                timestamptz '2025-01-01 00:00:00+00' + g * interval '7 hours',
                format('<p>Projeto %s: discutimos o <strong>cronograma</strong> e as entregas.</p><p>%s</p>', g, repeat($5, 15)),
                case when g % 3 = 0 then format('Resumo do projeto %s', g) end,
                'user', $3, $4, $3, $3
         from generate_series(1, $6::int) as g
         returning id`,
        [companyId, roomId, author.appUserId, author.displayName, filler, count],
      );
      // Items in note_id order (T2: trusted multi-note inserts go in note order).
      await world.query(
        `insert into public.meeting_note_action_items (note_id, description, creator_user_id, creator_name)
         select n.id, format('Tarefa %s do projeto', k), $2, $3
         from unnest($1::uuid[]) as n(id)
         cross join generate_series(1, 2) as k
         order by n.id, k`,
        [rows.map((row) => row.id), author.appUserId, author.displayName],
      );
      return rows.map((row) => row.id);
    };
    const bulkA = new Set(await seedBulk(world.companyA, world.spaceA, world.authorA, 1000));
    const bulkB = new Set(await seedBulk(world.companyB, world.spaceB, world.adminB, 300));
    await world.query('analyze public.meeting_notes');
    await world.query('analyze public.meeting_note_action_items');

    const timed = async (params: Record<string, string>) => {
      const started = performance.now();
      const p = await page(world.memberA, params);
      return { p, ms: performance.now() - started };
    };

    // Every one of the 1,000 notes matches: the whole set is ranked.
    const broad = await timed({ q: 'projeto' });
    const content = await timed({ q: 'cronograma', spaceId: world.spaceA, from: '2025-01-01T00:00:00Z', to: '2026-01-01T00:00:00Z' });
    const listing = await timed({});
    console.info(
      `[AC-014 timing] q=projeto ${broad.ms.toFixed(0)} ms (total ${broad.p.totalCount}); ` +
        `q=cronograma+filters ${content.ms.toFixed(0)} ms (total ${content.p.totalCount}); ` +
        `list mode ${listing.ms.toFixed(0)} ms (total ${listing.p.totalCount})`,
    );

    expect(broad.p.totalCount).toBe(1000);
    expect(broad.p.items).toHaveLength(20);
    for (const hit of broad.p.items) {
      expect(bulkA.has(hit.id)).toBe(true);
      expect(bulkB.has(hit.id)).toBe(false);
      expect(hit.excerpt).not.toBeNull();
    }
    expect(content.p.totalCount).toBe(1000);
    for (const hit of content.p.items) expect(hit.excerpt?.field).toBe('content');
    for (const hit of listing.p.items) expect(bulkB.has(hit.id)).toBe(false);

    expect(broad.ms).toBeLessThan(1000);
    expect(content.ms).toBeLessThan(1000);
    expect(listing.ms).toBeLessThan(1000);
  });
});
