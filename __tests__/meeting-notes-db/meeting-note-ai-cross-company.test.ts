// Phase 6 T12 (AC-023, SM-3, BR-001, BR-009, FR-029): cross-company isolation
// matrix over EVERY meeting-notes route (notes, list, create, versions,
// restore, items, completion, transcript upload/attach, export, search, AI
// settings, ticket, processing, Apply, usage) plus direct table and RPC access
// through PostgREST. A member and an admin of each company attack the other
// company's note, space, settings, and usage; every attempt is denied or
// empty, and the victim's note, items, versions, settings, key, and usage are
// byte-for-byte unchanged afterwards. Real local sessions, real RLS and RPCs,
// the T16 fake as the only provider (it must receive nothing).
import { randomBytes, randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as getSettings, PUT as putSettings } from '@/app/api/companies/ai-settings/route';
import { POST as postApply } from '@/app/api/meeting-notes/[id]/ai/apply/route';
import { POST as postProcess } from '@/app/api/meeting-notes/[id]/ai/process/route';
import { POST as postTicket } from '@/app/api/meeting-notes/[id]/ai/ticket/route';
import { GET as getExport } from '@/app/api/meeting-notes/[id]/export/route';
import { PUT as putCompletion } from '@/app/api/meeting-notes/[id]/items/[itemId]/completion/route';
import { DELETE as deleteItem, PATCH as patchItem } from '@/app/api/meeting-notes/[id]/items/[itemId]/route';
import { POST as postItem } from '@/app/api/meeting-notes/[id]/items/route';
import { POST as postRestore } from '@/app/api/meeting-notes/[id]/restore/route';
import { DELETE as deleteNote, GET as getNote, PATCH as patchNote } from '@/app/api/meeting-notes/[id]/route';
import { PUT as putTranscript } from '@/app/api/meeting-notes/[id]/transcript/route';
import { GET as getVersion } from '@/app/api/meeting-notes/[id]/versions/[versionId]/route';
import { GET as getVersions } from '@/app/api/meeting-notes/[id]/versions/route';
import { GET as listNotes, POST as createNote } from '@/app/api/meeting-notes/route';
import { GET as searchNotes } from '@/app/api/meeting-notes/search/route';
import { POST as postFromTranscript } from '@/app/api/meeting-notes/transcript/route';

import { MeetingNotesFakeAiControl } from '../meeting-notes-ai-fake/control-client';
import { createMeetingNotesWorld, MEETING_NOTE_TABLES, visibleRowCount, type MeetingNotesDbUser, type MeetingNotesDbWorld } from './fixtures';
import { callRoute, signInSessionCookies, useLocalSupabaseEnv, type RouteResult, type SessionCookie } from './route-session';

vi.mock('next/headers', async () => (await import('./route-session')).nextHeadersMock);

const control = new MeetingNotesFakeAiControl();

interface Target {
  label: 'A' | 'B';
  companyId: string;
  spaceId: string;
  noteId: string;
  itemId: string;
  versionId: string;
  revision: number;
  word: string;
  keyLastFour: string;
  /** A valid ticket issued to the victim's own editor for this note. */
  ticket: string;
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  data.append('file', new File([new TextEncoder().encode('Ana: hostile upload.')], 'x.txt'), 'x.txt');
  return data;
}

describe('AC-023: cross-company isolation across every meeting-notes route and direct access (local Supabase)', () => {
  let world: MeetingNotesDbWorld;
  const sessions = new Map<string, SessionCookie[]>();
  const targets = new Map<'A' | 'B', Target>();

  const as = (user: MeetingNotesDbUser): SessionCookie[] => {
    const cookies = sessions.get(user.appUserId);
    if (!cookies) throw new Error(`no session for ${user.displayName}`);
    return cookies;
  };

  /** Everything of a company an attack could change, read with trusted SQL. */
  const snapshot = async (target: Target) =>
    world.query(
      `select
         (select row_to_json(n)::text from (select revision, title, content, summary, transcript, transcript_id, generated_by, updated_at
                                             from public.meeting_notes where id = $1) as n) as note,
         (select coalesce(json_agg(i order by i.id)::text, '[]') from (select id, description, assignee_id, completed, revision, updated_at
                                             from public.meeting_note_action_items where note_id = $1) as i) as items,
         (select count(*)::int from public.meeting_note_versions where note_id = $1) as versions,
         (select count(*)::int from public.meeting_note_participants where note_id = $1) as participants,
         (select count(*)::int from public.meeting_notes where company_id = $2) as company_notes,
         (select row_to_json(s)::text from (select revision, provider, model, daily_limit, key_last_four, updated_at
                                             from public.meeting_note_ai_settings where company_id = $2) as s) as settings,
         (select count(*)::int from public.meeting_note_ai_operations where company_id = $2) as operations,
         (select ds.decrypted_secret from vault.decrypted_secrets as ds where ds.name = 'meeting_notes_ai_key:' || $2::text) as key`,
      [target.noteId, target.companyId],
    );

  beforeAll(async () => {
    useLocalSupabaseEnv();
    vi.stubEnv('MEETING_NOTES_TICKET_SECRET', randomBytes(48).toString('base64url'));
    vi.stubEnv('MEETING_NOTES_TICKET_SECRET_PREVIOUS', '');
    world = await createMeetingNotesWorld();
    for (const user of [world.adminA, world.authorA, world.memberA, world.adminB, world.memberB]) {
      sessions.set(user.appUserId, await signInSessionCookies(user.email));
    }
    for (const [label, companyId, spaceId, admin, author] of [
      ['A', world.companyA, world.spaceA, world.adminA, world.authorA],
      ['B', world.companyB, world.spaceB, world.adminB, world.memberB],
    ] as const) {
      const key = `mn-canary-t12-x${label}-${world.ns}-${randomUUID().slice(0, 6)}${label}${label}${label}${label}`;
      const { error } = await world.service.rpc('save_meeting_note_ai_settings', {
        p_actor_user_id: admin.appUserId,
        p_company_id: companyId,
        p_expected_revision: null,
        p_provider: 'openai',
        p_model: 'gpt-6.1-sol',
        p_reasoning_level: 'high',
        p_daily_limit: 20,
        p_api_key: key,
      });
      if (error) throw new Error(`settings: ${error.message}`);
      const word = `zebraword${label.toLowerCase()}${world.ns}`;
      const seeded = await world.seedNote({ companyId, roomId: spaceId, author, title: `Isolation ${word}` });
      const [row] = await world.query<{ revision: number }>(
        `update public.meeting_notes set transcript = 'Ana: secret plans.', transcript_id = gen_random_uuid(),
                summary = 'Secret summary', revision = revision + 1
         where id = $1 returning revision::int as revision`,
        [seeded.noteId],
      );
      // One counted operation of the victim company (its usage must not move or leak).
      await world.query(
        `insert into public.meeting_note_ai_operations
           (idempotency_key, company_id, user_id, note_id, source_revision, transcript_id, settings_revision,
            ticket_issued_at, provider, model, reasoning_level, admission_day, status, admitted_at, dispatched_at, settled_at)
         values (gen_random_uuid(), $1, $2, $3, 1, gen_random_uuid(), 1, now(), 'openai', 'gpt-6.1-sol', 'high',
                 private.meeting_note_ai_usage_day(now()), 'succeeded', now(), now(), now())`,
        [companyId, author.appUserId, seeded.noteId],
      );
      const ticket = await callRoute(sessions.get(author.appUserId) ?? [], postTicket, {
        method: 'POST',
        path: `/api/meeting-notes/${seeded.noteId}/ai/ticket`,
        params: { id: seeded.noteId },
      });
      expect(ticket.status).toBe(200);
      targets.set(label, {
        label,
        companyId,
        spaceId,
        noteId: seeded.noteId,
        itemId: seeded.itemId,
        versionId: seeded.versionIds[0],
        revision: row.revision,
        word,
        keyLastFour: key.slice(-4),
        ticket: ticket.body.ticket as string,
      });
    }
  }, 120_000);

  beforeEach(async () => {
    await control.reset();
    await world.query(
      `delete from private.rate_limit_counters where action like 'meeting-note:%' and user_id in (
         select id from public.users where email like $1)`,
      [`%-${world.ns}@local.test`],
    );
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await world?.cleanup();
  });

  const attackers = (): Array<{ attacker: MeetingNotesDbUser; role: string; own: 'A' | 'B'; victim: 'A' | 'B' }> => [
    { attacker: world.memberB, role: 'member', own: 'B', victim: 'A' },
    { attacker: world.adminB, role: 'admin', own: 'B', victim: 'A' },
    { attacker: world.memberA, role: 'member', own: 'A', victim: 'B' },
    { attacker: world.adminA, role: 'admin', own: 'A', victim: 'B' },
  ];

  for (const index of [0, 1, 2, 3]) {
    it(`attacker #${index + 1} (member/admin of one company against the other): every route denied or empty, direct access denied, victim unchanged`, async () => {
      const { attacker, own, victim } = attackers()[index];
      const target = targets.get(victim);
      const mine = targets.get(own);
      if (!target || !mine) throw new Error('targets missing');
      const cookies = as(attacker);
      const before = await snapshot(target);
      const n = target.noteId;

      const denied: Array<[string, RouteResult]> = [
        ['GET note', await callRoute(cookies, getNote, { method: 'GET', path: `/api/meeting-notes/${n}?include=transcript`, params: { id: n } })],
        [
          'PATCH note',
          await callRoute(cookies, patchNote, {
            method: 'PATCH',
            path: `/api/meeting-notes/${n}`,
            params: { id: n },
            body: { expectedRevision: target.revision, title: 'Hijacked', meetingDate: new Date().toISOString(), content: '', participantIds: [attacker.appUserId] },
          }),
        ],
        ['DELETE note', await callRoute(cookies, deleteNote, { method: 'DELETE', path: `/api/meeting-notes/${n}?expectedRevision=${target.revision}`, params: { id: n } })],
        ['GET versions', await callRoute(cookies, getVersions, { method: 'GET', path: `/api/meeting-notes/${n}/versions`, params: { id: n } })],
        [
          'GET version',
          await callRoute(cookies, getVersion, { method: 'GET', path: `/api/meeting-notes/${n}/versions/${target.versionId}`, params: { id: n, versionId: target.versionId } }),
        ],
        [
          'POST restore',
          await callRoute(cookies, postRestore, { method: 'POST', path: `/api/meeting-notes/${n}/restore`, params: { id: n }, body: { expectedRevision: target.revision, versionId: target.versionId } }),
        ],
        ['POST item', await callRoute(cookies, postItem, { method: 'POST', path: `/api/meeting-notes/${n}/items`, params: { id: n }, body: { description: 'Hostile' } })],
        [
          'PATCH item',
          await callRoute(cookies, patchItem, {
            method: 'PATCH',
            path: `/api/meeting-notes/${n}/items/${target.itemId}`,
            params: { id: n, itemId: target.itemId },
            body: { expectedRevision: 1, description: 'Hostile', assigneeId: null, dueDate: null },
          }),
        ],
        [
          'PUT completion',
          await callRoute(cookies, putCompletion, {
            method: 'PUT',
            path: `/api/meeting-notes/${n}/items/${target.itemId}/completion`,
            params: { id: n, itemId: target.itemId },
            body: { expectedRevision: 1, completed: true },
          }),
        ],
        [
          'DELETE item',
          await callRoute(cookies, deleteItem, { method: 'DELETE', path: `/api/meeting-notes/${n}/items/${target.itemId}?expectedRevision=1`, params: { id: n, itemId: target.itemId } }),
        ],
        [
          'PUT transcript',
          await callRoute(cookies, putTranscript, { method: 'PUT', path: `/api/meeting-notes/${n}/transcript`, params: { id: n }, form: form({ expectedRevision: String(target.revision) }) }),
        ],
        ['POST transcript note', await callRoute(cookies, postFromTranscript, { method: 'POST', path: '/api/meeting-notes/transcript', form: form({ spaceId: target.spaceId }) })],
        [
          'POST note in victim space',
          await callRoute(cookies, createNote, { method: 'POST', path: '/api/meeting-notes', body: { spaceId: target.spaceId, title: 'Hostile', meetingDate: new Date().toISOString() } }),
        ],
        ['GET export', await callRoute(cookies, getExport, { method: 'GET', path: `/api/meeting-notes/${n}/export?includeTranscript=true`, params: { id: n } })],
        ['POST ticket', await callRoute(cookies, postTicket, { method: 'POST', path: `/api/meeting-notes/${n}/ai/ticket`, params: { id: n } })],
        // The victim editor's own valid ticket, presented by the attacker.
        ['POST process (victim ticket)', await callRoute(cookies, postProcess, { method: 'POST', path: `/api/meeting-notes/${n}/ai/process`, params: { id: n }, body: { ticket: target.ticket } })],
        // The attacker's own company ticket pointed at the victim's note.
        ['POST process (own ticket)', await callRoute(cookies, postProcess, { method: 'POST', path: `/api/meeting-notes/${n}/ai/process`, params: { id: n }, body: { ticket: mine.ticket } })],
        [
          'POST apply',
          await callRoute(cookies, postApply, {
            method: 'POST',
            path: `/api/meeting-notes/${n}/ai/apply`,
            params: { id: n },
            body: { expectedRevision: target.revision, summary: { keyPoints: ['Hostile'], decisions: [], nextSteps: [] }, items: [] },
          }),
        ],
      ];
      for (const [label, result] of denied) {
        expect([403, 404, 409], `${label}: ${result.status} ${JSON.stringify(result.body)}`).toContain(result.status);
        const text = JSON.stringify(result.body);
        expect(text, label).not.toContain('Secret');
        expect(text, label).not.toContain(target.word);
        expect(text, label).not.toContain(target.keyLastFour);
      }

      // Reads scoped to the caller's company: empty for the victim's space and words.
      const list = await callRoute(cookies, listNotes, { method: 'GET', path: `/api/meeting-notes?spaceId=${target.spaceId}` });
      expect(list.status).toBe(200);
      expect(list.body.items).toEqual([]);
      const search = await callRoute(cookies, searchNotes, { method: 'GET', path: `/api/meeting-notes/search?q=${target.word}` });
      expect(search.status).toBe(200);
      expect(search.body.items).toEqual([]);
      const settings = await callRoute(cookies, getSettings, { method: 'GET', path: '/api/companies/ai-settings' });
      expect(settings.status).toBe(200);
      expect((settings.body.settings as { keyLastFour: string }).keyLastFour).toBe(mine.keyLastFour);
      expect(JSON.stringify(settings.body)).not.toContain(target.keyLastFour);
      const save = await callRoute(cookies, putSettings, {
        method: 'PUT',
        path: '/api/companies/ai-settings',
        body: { expectedRevision: 999, provider: 'glm', model: 'glm-5.3', reasoningLevel: 'max', dailyLimit: 200, apiKey: `hostile-${randomUUID()}` },
      });
      expect([403, 409]).toContain(save.status);

      // Direct PostgREST access with the attacker's session.
      const client = attacker.client;
      for (const table of MEETING_NOTE_TABLES) {
        expect(await visibleRowCount(client, table, n), table).toBe(0);
      }
      expect((await client.from('meeting_note_ai_settings').select('*').eq('company_id', target.companyId)).data).toEqual([]);
      expect((await client.from('meeting_note_ai_operations').select('*')).error?.code).toBe('42501');
      expect((await client.from('meeting_notes').update({ company_id: mine.companyId }).eq('id', n)).error?.code).toBe('42501');
      const usage = await client.rpc('get_meeting_note_ai_usage');
      expect(usage.error).toBeNull();
      const ownUsed = (
        await world.query<{ n: number }>(
          `select private.meeting_note_ai_used_count($1, private.meeting_note_ai_usage_day(now())) as n`,
          [mine.companyId],
        )
      )[0].n;
      expect((usage.data as { used: number }).used).toBe(ownUsed);

      const rpcDenials: Array<[string, Record<string, unknown>, string[]]> = [
        ['update_meeting_note', { p_note_id: n, p_expected_revision: target.revision, p_title: 'x', p_meeting_date: new Date().toISOString(), p_content: '', p_participant_ids: [] }, ['MEETING_NOTE_NOT_FOUND']],
        ['delete_meeting_note', { p_note_id: n, p_expected_revision: target.revision }, ['MEETING_NOTE_NOT_FOUND']],
        ['restore_meeting_note_version', { p_note_id: n, p_expected_revision: target.revision, p_version_id: target.versionId }, ['MEETING_NOTE_NOT_FOUND']],
        ['attach_meeting_note_transcript', { p_note_id: n, p_expected_revision: target.revision, p_transcript: 'x' }, ['MEETING_NOTE_NOT_FOUND']],
        ['create_meeting_note_action_item', { p_note_id: n, p_description: 'x', p_assignee_id: null, p_due_date: null }, ['MEETING_NOTE_NOT_FOUND']],
        ['set_meeting_note_action_item_completed', { p_item_id: target.itemId, p_expected_revision: 1, p_completed: true }, ['MEETING_NOTE_ITEM_NOT_FOUND']],
        ['apply_meeting_note_ai_draft', { p_note_id: n, p_expected_revision: target.revision, p_summary: 'x', p_items: [] }, ['MEETING_NOTE_NOT_FOUND']],
        [
          'admit_meeting_note_ai_operation',
          {
            p_actor_user_id: attacker.appUserId,
            p_company_id: target.companyId,
            p_note_id: n,
            p_idempotency_key: randomUUID(),
            p_ticket_issued_at: new Date().toISOString(),
            p_source_revision: target.revision,
            p_transcript_id: randomUUID(),
            p_settings_revision: 1,
          },
          ['permission denied for function admit_meeting_note_ai_operation'],
        ],
        ['settle_meeting_note_ai_operation', { p_operation_id: randomUUID(), p_outcome: 'refunded' }, ['permission denied for function settle_meeting_note_ai_operation']],
        [
          'finalize_meeting_note_ai_success',
          { p_operation_id: randomUUID(), p_actor_user_id: attacker.appUserId },
          ['permission denied for function finalize_meeting_note_ai_success'],
        ],
        ['read_meeting_note_ai_key', { p_company_id: target.companyId }, ['permission denied for function read_meeting_note_ai_key']],
      ];
      for (const [fn, args, messages] of rpcDenials) {
        const { data, error } = await client.rpc(fn, args);
        expect(data, fn).toBeNull();
        expect(messages, `${fn}: ${error?.message}`).toContain(error?.message);
      }
      expect((await client.schema('vault' as never).from('decrypted_secrets' as never).select('*')).data ?? []).toEqual([]);

      expect(await control.received('openai')).toBe(0);
      expect(await snapshot(target)).toEqual(before);
    });
  }
});
