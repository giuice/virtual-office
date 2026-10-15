import { randomUUID } from 'node:crypto';

import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { POST as createNote } from '@/app/api/meeting-notes/route';
import { GET as exportNote } from '@/app/api/meeting-notes/[id]/export/route';
import { POST as createItem } from '@/app/api/meeting-notes/[id]/items/route';
import { PUT as setItemCompletion } from '@/app/api/meeting-notes/[id]/items/[itemId]/completion/route';

import { createMeetingNotesWorld, type MeetingNotesDbUser, type MeetingNotesDbWorld } from './fixtures';
import { asSession, callRoute, signInSessionCookies, useLocalSupabaseEnv, type SessionCookie } from './route-session';

vi.mock('next/headers', async () => (await import('./route-session')).nextHeadersMock);

interface ExportResult {
  status: number;
  contentType: string | null;
  disposition: string | null;
  text: string;
}

/** A markdown link or image whose `]` is not escaped and whose target is javascript:. */
const LIVE_JAVASCRIPT_LINK = /(?<!\\)\]\(\s*<?\s*javascript:/i;

// Phase 6 T7 (FR-027; AC-019, AC-003 export side, AC-009 export side): the
// real GET /api/meeting-notes/[id]/export handler, in-process, with real local
// sessions. Notes and items are written through the real routes; only the
// summary and the transcript (no API writes them yet — T12) and a raw
// content overwrite that models markup reaching the database by another path
// are trusted SQL.
describe('meeting-note Markdown export route (local Supabase)', () => {
  let world: MeetingNotesDbWorld;
  let leaver: MeetingNotesDbUser;
  let hostileMember: MeetingNotesDbUser;
  const sessions = new Map<string, SessionCookie[]>();

  const as = (user: MeetingNotesDbUser): SessionCookie[] => {
    const cookies = sessions.get(user.appUserId);
    if (!cookies) throw new Error(`no session for ${user.displayName}`);
    return cookies;
  };

  const runExport = (cookies: readonly SessionCookie[], noteId: string, query = ''): Promise<ExportResult> =>
    asSession(cookies, async () => {
      const request = new NextRequest(`http://localhost/api/meeting-notes/${noteId}/export${query}`, { method: 'GET' });
      const response = await exportNote(request, { params: Promise.resolve({ id: noteId }) });
      return {
        status: response.status,
        contentType: response.headers.get('content-type'),
        disposition: response.headers.get('content-disposition'),
        text: await response.text(),
      };
    });

  const newNote = async (body: Record<string, unknown>): Promise<string> => {
    const result = await callRoute(as(world.authorA), createNote, {
      method: 'POST',
      path: '/api/meeting-notes',
      body: { spaceId: world.spaceA, ...body },
    });
    expect(result.status, JSON.stringify(result.body)).toBe(201);
    return (result.body.note as { id: string }).id;
  };

  const addItem = async (noteId: string, body: Record<string, unknown>): Promise<{ id: string; revision: number }> => {
    const result = await callRoute(as(world.authorA), createItem, {
      method: 'POST',
      path: `/api/meeting-notes/${noteId}/items`,
      body,
      params: { id: noteId },
    });
    expect(result.status, JSON.stringify(result.body)).toBe(201);
    return result.body.item as { id: string; revision: number };
  };

  const complete = async (noteId: string, item: { id: string; revision: number }): Promise<void> => {
    const result = await callRoute(as(world.authorA), setItemCompletion, {
      method: 'PUT',
      path: `/api/meeting-notes/${noteId}/items/${item.id}/completion`,
      body: { expectedRevision: item.revision, completed: true },
      params: { id: noteId, itemId: item.id },
    });
    expect(result.status, JSON.stringify(result.body)).toBe(200);
  };

  const seedSummaryAndTranscript = async (noteId: string, summary: string, transcript: string): Promise<void> => {
    await world.query(
      'update public.meeting_notes set summary = $1, transcript = $2, transcript_id = gen_random_uuid() where id = $3',
      [summary, transcript, noteId],
    );
  };

  beforeAll(async () => {
    useLocalSupabaseEnv();
    world = await createMeetingNotesWorld();
    leaver = await world.createUser('export-leaver', world.companyA, 'member');
    hostileMember = await world.createUser('export-hostile', world.companyA, 'member');
    for (const user of [world.authorA, world.memberA, world.adminB]) {
      sessions.set(user.appUserId, await signInSessionCookies(user.email));
    }
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await world?.cleanup();
  });

  it('AC-019: exports title, date, space, author, participants, Markdown content, summary, and items; the transcript only on request', async () => {
    const title = `Quarterly sync ${world.ns}`;
    const content = [
      '<h1>Agenda</h1>',
      '<p>Plain <strong>bold</strong> and <em>italic</em> with <a href="https://example.com/doc" target="_blank">a link</a></p>',
      '<ul><li><p>First bullet</p></li></ul>',
      '<ol><li><p>First step</p></li></ol>',
      '<ul data-type="taskList">',
      '<li data-checked="true" data-type="taskItem"><label><input type="checkbox" checked="checked"><span></span></label><div><p>Done task</p></div></li>',
      '<li data-checked="false" data-type="taskItem"><label><input type="checkbox"><span></span></label><div><p>Open task</p></div></li>',
      '</ul>',
    ].join('');
    const noteId = await newNote({
      title,
      // 23:30 UTC: 2026-10-13 in UTC and Los Angeles, 2026-10-14 in Tokyo.
      meetingDate: '2026-10-13T23:30:00.000Z',
      content,
      participantIds: [world.participantA.appUserId, leaver.appUserId],
    });
    await addItem(noteId, { description: 'Send the minutes', assigneeId: world.memberA.appUserId, dueDate: '2026-11-05' });
    const booked = await addItem(noteId, { description: 'Book the room', assigneeId: null, dueDate: null });
    await complete(noteId, booked);
    await seedSummaryAndTranscript(noteId, `Summary line one ${world.ns}\nSummary line two`, `Ana: transcript words ${world.ns}`);
    // The leaver is a participant who is no longer a member ("Former member").
    const [removal] = await world.query<{ result: { ok: boolean } }>(
      'select public.remove_company_member_and_presence($1, $2, $3) as result',
      [world.adminA.appUserId, leaver.appUserId, world.companyA],
    );
    expect(removal.result.ok).toBe(true);

    // A plain member (not an editor) may export too.
    const plain = await runExport(as(world.memberA), noteId);
    expect(plain.status, plain.text).toBe(200);
    expect(plain.contentType).toBe('text/markdown; charset=utf-8');
    expect(plain.disposition).toBe(
      `attachment; filename="quarterly-sync-${world.ns}-2026-10-13.md"; filename*=UTF-8''Quarterly%20sync%20${world.ns}%202026-10-13.md`,
    );
    const md = plain.text;
    const [spaceRow] = await world.query<{ name: string }>('select name from public.spaces where id = $1', [world.spaceA]);

    expect(md.startsWith(`# ${title}\n`)).toBe(true);
    expect(md).toContain('- **Meeting date:** 2026-10-13\n');
    expect(md).toContain(`- **Space:** ${spaceRow.name}\n`);
    expect(md).toContain(`- **Author:** ${world.authorA.displayName}\n`);
    expect(md).toContain(
      `- **Participants:** ${world.participantA.displayName}, ${leaver.displayName} (Former member)\n`,
    );
    // Content as Markdown, its headings nested under "## Notes".
    expect(md).toContain('## Notes\n\n### Agenda\n\n');
    expect(md).toContain('Plain **bold** and *italic* with [a link](https://example.com/doc)');
    expect(md).toContain('- First bullet\n\n1. First step\n\n- [x] Done task\n- [ ] Open task');
    expect(md).toContain(`## Summary\n\nSummary line one ${world.ns}\\\nSummary line two\n`);
    expect(md).toContain(
      [
        '## Action items',
        '',
        '- [ ] Send the minutes',
        `  - Assignee: ${world.memberA.displayName}`,
        '  - Due date: 2026-11-05',
        '  - Status: open',
        '- [x] Book the room',
        '  - Assignee: Unassigned',
        '  - Due date: None',
        '  - Status: done',
      ].join('\n'),
    );
    expect(md).not.toContain('## Transcript');
    expect(md).not.toContain('transcript words');

    const withTranscript = await runExport(as(world.memberA), noteId, '?includeTranscript=true');
    expect(withTranscript.status).toBe(200);
    expect(withTranscript.text).toContain(`## Transcript\n\nAna: transcript words ${world.ns}\n`);
    // Everything else is the same document.
    expect(withTranscript.text.startsWith(md.trimEnd())).toBe(true);

    const explicitNo = await runExport(as(world.memberA), noteId, '?includeTranscript=false');
    expect(explicitNo.text).toBe(md);

    // AC-009 export side: the meeting day follows the viewer's zone; the due
    // date is a calendar date and never moves.
    const tokyo = await runExport(as(world.memberA), noteId, '?timeZone=Asia%2FTokyo');
    expect(tokyo.status).toBe(200);
    expect(tokyo.text).toContain('- **Meeting date:** 2026-10-14\n');
    expect(tokyo.text).toContain('  - Due date: 2026-11-05\n');
    expect(tokyo.disposition).toContain(`filename="quarterly-sync-${world.ns}-2026-10-14.md"`);
    const losAngeles = await runExport(as(world.memberA), noteId, '?timeZone=America%2FLos_Angeles');
    expect(losAngeles.text).toContain('- **Meeting date:** 2026-10-13\n');
    expect(losAngeles.text).toContain('  - Due date: 2026-11-05\n');
  });

  it('AC-003 export side: hostile title, names, content, summary, items, and transcript are escaped — no raw HTML, no javascript: link', async () => {
    // A member whose display name carries markup becomes a participant.
    await world.query('update public.users set display_name = $1 where id = $2', [
      `Eve <b onmouseover="alert(8)">x</b> [p](javascript:alert(9)) ${world.ns}`,
      hostileMember.appUserId,
    ]);
    const noteId = await newNote({
      title: `<script>alert("t")</script> [click](javascript:alert(1)) ![img](javascript:alert(2)) ${world.ns}`,
      meetingDate: '2026-10-13T14:00:00.000Z',
      content: '<p>safe</p>',
      participantIds: [hostileMember.appUserId],
    });
    // Raw markup that never went through the write-side sanitizer.
    await world.query('update public.meeting_notes set content = $1 where id = $2', [
      [
        '<p>Hi<script>alert(3)</script><img src=x onerror=alert(4)>',
        '<a href="javascript:alert(5)">bad link</a> <a href="JaVaScRiPt:alert(6)">bad two</a>',
        ' <a href="data:text/html,<script>alert(7)</script>">data link</a>',
        ' &lt;b&gt;typed tag&lt;/b&gt; [md](javascript:alert(10)) <a href="https://ok.example/x">good</a></p>',
        '<iframe src="https://evil.example"></iframe><style>p{}</style>',
        '<h2 onclick="alert(11)">Heading <em>here</em></h2>',
      ].join(''),
      noteId,
    ]);
    await addItem(noteId, {
      description: '<img src=x onerror=alert(12)> [x](javascript:alert(13)) `code` *star*',
      assigneeId: null,
      dueDate: null,
    });
    await seedSummaryAndTranscript(
      noteId,
      '<script>alert(14)</script> <a href="javascript:alert(15)">s</a> ![i](javascript:alert(16))',
      'Bob: <script>alert(17)</script>\n```\n<iframe src=x></iframe>',
    );

    const result = await runExport(as(world.memberA), noteId, '?includeTranscript=true');
    expect(result.status, result.text).toBe(200);
    const md = result.text;

    // No raw HTML at all: every `<` from user or AI text became an entity.
    expect(md).not.toContain('<');
    expect(md).not.toMatch(LIVE_JAVASCRIPT_LINK);
    expect(md).not.toMatch(/!\[/);
    expect(md).not.toMatch(/\]\(\s*(?:data|vbscript):/i);
    // Dropped by the sanitizer before conversion (not even as text).
    expect(md).not.toContain('alert(3)');
    expect(md).not.toContain('alert(4)');
    expect(md).not.toContain('alert(11)');
    expect(md).not.toContain('evil.example');
    // Unsafe links keep only their text; the safe one stays a link.
    expect(md).toContain('bad link bad two data link');
    expect(md).toContain('[good](https://ok.example/x)');
    expect(md).toContain('#### Heading *here*');
    // User text stays readable, escaped.
    expect(md).toContain(
      `# &lt;script&gt;alert("t")&lt;/script&gt; \\[click\\](javascript:alert(1)) !\\[img\\](javascript:alert(2)) ${world.ns}\n`,
    );
    expect(md).toContain('&lt;b&gt;typed tag&lt;/b&gt; \\[md\\](javascript:alert(10))');
    expect(md).toContain(
      `- **Participants:** Eve &lt;b onmouseover="alert(8)"&gt;x&lt;/b&gt; \\[p\\](javascript:alert(9)) ${world.ns}\n`,
    );
    expect(md).toContain('- [ ] &lt;img src=x onerror=alert(12)&gt; \\[x\\](javascript:alert(13)) \\`code\\` \\*star\\*\n');
    expect(md).toContain(
      '&lt;script&gt;alert(14)&lt;/script&gt; &lt;a href="javascript:alert(15)"&gt;s&lt;/a&gt; !\\[i\\](javascript:alert(16))',
    );
    expect(md).toContain('Bob: &lt;script&gt;alert(17)&lt;/script&gt;\\\n\\`\\`\\`\\\n&lt;iframe src=x&gt;&lt;/iframe&gt;\n');
    // The download name carries no path or header syntax.
    expect(result.disposition).toMatch(/^attachment; filename="[a-z0-9-]+\.md"; filename\*=UTF-8''[A-Za-z0-9%._~-]+$/);
  });

  it('block B review B-6: markers assembled across text fragments and trailing heading hashes stay plain text', async () => {
    const noteId = await newNote({
      title: `Topic ${world.ns} #`,
      meetingDate: '2026-10-13T14:00:00.000Z',
      content: '<p>safe</p>',
    });
    // Each line's marker is split across adjacent inline fragments (spans are
    // in the note schema), which per-fragment escaping alone cannot see.
    await world.query('update public.meeting_notes set content = $1 where id = $2', [
      [
        '<p><span>1</span>. text</p>',
        '<p><span>2</span><span>) second</span></p>',
        '<p>first line<br><span>3</span>. after a break</p>',
        '<p><span> </span><span>-</span> dash</p>',
        '<p><span>#</span> not a heading</p>',
        '<h2>Agenda ##</h2>',
      ].join(''),
      noteId,
    ]);

    const result = await runExport(as(world.memberA), noteId);
    expect(result.status, result.text).toBe(200);
    const md = result.text;

    // The trailing `#` of the title is escaped, so it is not a closing sequence.
    expect(md).toContain(`# Topic ${world.ns} \\#\n`);
    expect(md).toContain('\n1\\. text\n');
    expect(md).toContain('\n2\\) second\n');
    expect(md).toContain('first line\\\n3\\. after a break');
    expect(md).toContain('\n\\- dash\n');
    expect(md).toContain('\n\\# not a heading\n');
    expect(md).toContain('\n#### Agenda \\##\n');
    // No line of the notes became an ordered or bulleted list item or a heading.
    const notes = md.slice(md.indexOf('## Notes'), md.indexOf('## Summary'));
    expect(notes).not.toMatch(/^\s*\d+[.)]\s/m);
    expect(notes).not.toMatch(/^\s*[-+*]\s/m);
    expect(notes.split('\n').filter((line) => /^#{1,6}\s/.test(line))).toEqual(['## Notes', '#### Agenda \\##']);
  });

  it('answers a note of another company exactly like a random id (404), refuses bad options (400), and needs a session (401)', async () => {
    const noteId = await newNote({ title: `Private ${world.ns}`, meetingDate: '2026-10-13T14:00:00.000Z', content: '' });

    const otherCompany = await runExport(as(world.adminB), noteId);
    const randomId = await runExport(as(world.adminB), randomUUID());
    expect(otherCompany.status).toBe(404);
    expect(randomId.status).toBe(404);
    const strip = (text: string) => {
      const body = JSON.parse(text) as Record<string, unknown>;
      delete body.correlationId;
      return body;
    };
    expect(strip(otherCompany.text)).toEqual(strip(randomId.text));
    expect(strip(otherCompany.text)).toMatchObject({ code: 'MEETING_NOTE_NOT_FOUND' });
    expect(otherCompany.text).not.toContain('Private');

    const malformed = await runExport(as(world.authorA), 'not-a-uuid');
    expect(malformed.status).toBe(404);

    for (const query of ['?includeTranscript=yes', '?timeZone=Not%2FAZone', '?timeZone=%3Cscript%3E']) {
      const refused = await runExport(as(world.authorA), noteId, query);
      expect(refused.status, query).toBe(400);
    }

    const anonymous = await runExport([], noteId);
    expect(anonymous.status).toBe(401);
    expect(anonymous.text).not.toContain('Private');
  });
});
