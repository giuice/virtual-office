// Phase 6 block C review C-3: every mutating meeting-notes route refuses a
// cross-origin browser request (Origin not the app's own, or Sec-Fetch-Site
// cross-site/same-site) with 403 MEETING_NOTE_ORIGIN_FORBIDDEN and no side
// effect — a sibling origin of the same site still gets the SameSite=Lax
// session cookies. The real route handlers run in-process with real local
// sessions (route-session.ts); the forged headers are what a browser would
// send from the attacking page. Same-origin requests and requests without
// Origin/Sec-Fetch-Site (non-browser clients) keep working.
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { POST as createNote } from '@/app/api/meeting-notes/route';
import { POST as createFromTranscript } from '@/app/api/meeting-notes/transcript/route';
import { POST as createItem } from '@/app/api/meeting-notes/[id]/items/route';
import { PATCH as updateItem } from '@/app/api/meeting-notes/[id]/items/[itemId]/route';
import { PUT as putAiSettings } from '@/app/api/companies/ai-settings/route';

import { createMeetingNotesWorld, type MeetingNotesDbUser, type MeetingNotesDbWorld, type SeededNote } from './fixtures';
import { callRoute, signInSessionCookies, useLocalSupabaseEnv, type RouteResult, type SessionCookie } from './route-session';

vi.mock('next/headers', async () => (await import('./route-session')).nextHeadersMock);

const MEETING_DATE = '2026-10-13T14:00:00.000Z';

/** Headers a browser sends for a request initiated by a page on another origin. */
const FORGED: ReadonlyArray<{ label: string; headers: Record<string, string> }> = [
  { label: 'cross-site Origin', headers: { origin: 'https://attacker.example', 'sec-fetch-site': 'cross-site' } },
  { label: 'sibling origin (same-site)', headers: { origin: 'https://notes.localhost', 'sec-fetch-site': 'same-site' } },
  { label: 'foreign Origin without Sec-Fetch-Site', headers: { origin: 'https://attacker.example' } },
  { label: 'opaque Origin (null)', headers: { origin: 'null' } },
  { label: 'Sec-Fetch-Site cross-site without Origin', headers: { 'sec-fetch-site': 'cross-site' } },
  { label: 'Sec-Fetch-Site same-site with the app Origin', headers: { origin: 'http://localhost', 'sec-fetch-site': 'same-site' } },
];

const SAME_ORIGIN: Record<string, string> = { origin: 'http://localhost', 'sec-fetch-site': 'same-origin' };

describe('meeting-notes mutating routes refuse cross-origin requests (local Supabase)', () => {
  let world: MeetingNotesDbWorld;
  let seeded: SeededNote;
  const sessions = new Map<string, SessionCookie[]>();

  const as = (user: MeetingNotesDbUser): SessionCookie[] => {
    const cookies = sessions.get(user.appUserId);
    if (!cookies) throw new Error(`no session for ${user.displayName}`);
    return cookies;
  };

  const count = async (sql: string, params: unknown[]): Promise<number> =>
    Number((await world.query<{ n: string }>(sql, params))[0].n);

  const noteCount = (): Promise<number> =>
    count('select count(*)::text as n from public.meeting_notes where company_id = $1', [world.companyA]);

  const itemState = async (): Promise<{ items: number; description: string }> => {
    const [row] = await world.query<{ items: string; description: string }>(
      `select (select count(*) from public.meeting_note_action_items where note_id = $1)::text as items,
              (select description from public.meeting_note_action_items where id = $2) as description`,
      [seeded.noteId, seeded.itemId],
    );
    return { items: Number(row.items), description: row.description };
  };

  const settingsRows = (): Promise<number> =>
    count('select count(*)::text as n from public.meeting_note_ai_settings where company_id = $1', [world.companyA]);

  const transcriptForm = (): FormData => {
    const data = new FormData();
    data.append('spaceId', world.spaceA);
    data.append('file', new File([new TextEncoder().encode('Ana: origin guard check')], 'origin.txt'), 'origin.txt');
    return data;
  };

  const calls = {
    createNote: (headers?: Record<string, string>): Promise<RouteResult> =>
      callRoute(as(world.authorA), createNote, {
        method: 'POST',
        path: '/api/meeting-notes',
        headers,
        body: { spaceId: world.spaceA, title: `Origin ${randomUUID().slice(0, 6)}`, meetingDate: MEETING_DATE, participantIds: [] },
      }),
    uploadTranscript: (headers?: Record<string, string>): Promise<RouteResult> =>
      callRoute(as(world.authorA), createFromTranscript, {
        method: 'POST',
        path: '/api/meeting-notes/transcript',
        headers,
        form: transcriptForm(),
      }),
    createItem: (headers?: Record<string, string>): Promise<RouteResult> =>
      callRoute(as(world.authorA), createItem, {
        method: 'POST',
        path: `/api/meeting-notes/${seeded.noteId}/items`,
        headers,
        body: { description: 'Origin guard item' },
        params: { id: seeded.noteId },
      }),
    updateItem: (headers?: Record<string, string>): Promise<RouteResult> =>
      callRoute(as(world.authorA), updateItem, {
        method: 'PATCH',
        path: `/api/meeting-notes/${seeded.noteId}/items/${seeded.itemId}`,
        headers,
        body: { expectedRevision: 1, description: 'Changed by another origin', assigneeUserId: null, dueDate: null },
        params: { id: seeded.noteId, itemId: seeded.itemId },
      }),
    putAiSettings: (headers?: Record<string, string>): Promise<RouteResult> =>
      callRoute(as(world.adminA), putAiSettings, {
        method: 'PUT',
        path: '/api/companies/ai-settings',
        headers,
        body: {
          expectedRevision: null,
          provider: 'openai',
          model: 'gpt-6.1-sol',
          reasoningLevel: 'high',
          dailyLimit: 50,
          apiKey: `mn-canary-origin-${world.ns}-${randomUUID().slice(0, 8)}-Z9q`,
        },
      }),
  };

  beforeAll(async () => {
    useLocalSupabaseEnv();
    world = await createMeetingNotesWorld();
    for (const user of [world.adminA, world.authorA]) {
      sessions.set(user.appUserId, await signInSessionCookies(user.email));
    }
    seeded = await world.seedNote({ companyId: world.companyA, roomId: world.spaceA, author: world.authorA });
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await world?.cleanup();
  });

  it('refuses every forged-origin variant on the transcript upload, note create, item writes, and AI settings save, with no side effect', async () => {
    const notesBefore = await noteCount();
    const itemsBefore = await itemState();
    expect(await settingsRows()).toBe(0);

    // Sequential: sessions travel through one module-level cookie jar.
    for (const { label, headers } of FORGED) {
      for (const [route, call] of Object.entries(calls)) {
        const result = await call(headers);
        expect({ label, route, status: result.status, code: result.body.code }).toEqual({
          label,
          route,
          status: 403,
          code: 'MEETING_NOTE_ORIGIN_FORBIDDEN',
        });
        expect(typeof result.body.correlationId).toBe('string');
      }
    }

    expect(await noteCount()).toBe(notesBefore);
    expect(await itemState()).toEqual(itemsBefore);
    expect(await settingsRows()).toBe(0);
  });

  it('accepts the same requests from the app origin and from non-browser clients (no Origin, no Sec-Fetch-Site)', async () => {
    const notesBefore = await noteCount();

    expect((await calls.createNote(SAME_ORIGIN)).status).toBe(201);
    expect((await calls.uploadTranscript(SAME_ORIGIN)).status).toBe(201);
    expect((await calls.createItem(SAME_ORIGIN)).status).toBe(201);
    expect((await calls.putAiSettings(SAME_ORIGIN)).status).toBe(200);
    expect(await noteCount()).toBe(notesBefore + 2);
    expect(await settingsRows()).toBe(1);

    // A user-initiated request (Sec-Fetch-Site: none) and a non-browser client.
    expect((await calls.createNote({ 'sec-fetch-site': 'none' })).status).toBe(201);
    expect((await calls.createNote()).status).toBe(201);
    expect(await noteCount()).toBe(notesBefore + 4);
  });

  it('accepts the configured public app origin (NEXT_PUBLIC_APP_URL) behind a proxy', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://office.example.test/');
    try {
      const allowed = await calls.createNote({ origin: 'https://office.example.test', 'sec-fetch-site': 'same-origin' });
      expect(allowed.status).toBe(201);
      const sibling = await calls.createNote({ origin: 'https://evil.office.example.test' });
      expect(sibling).toMatchObject({ status: 403, body: { code: 'MEETING_NOTE_ORIGIN_FORBIDDEN' } });
    } finally {
      vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    }
  });
});
