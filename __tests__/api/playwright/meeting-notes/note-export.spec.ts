import { expect, test } from '../fixtures/meeting-notes';
import { MEETING_NOTES_E2E_PREFIX } from '../helpers/meeting-notes-e2e';
import { exportNoteMarkdown, openNote } from '../helpers/meeting-notes-ui';

/**
 * AC-019 (FR-005, FR-027): "Export Markdown" downloads a .md with title, date,
 * space, author, participants, the content as Markdown, the summary, and the
 * action items; "Include transcript" adds the transcript. The export is
 * offered to every viewer; here the secondary member downloads it.
 *
 * AC-003, export side (FR-002, FR-027): hostile markup in the title, a
 * participant's name, the stored content, an item, the summary (AI output),
 * and the transcript is exported escaped — no raw HTML, no live javascript:
 * link — and nothing runs in the page while exporting.
 *
 * The summary and transcript are stored with trusted local SQL (no product
 * route writes them before T12/T13).
 */

/** A Markdown link or image whose `]` is not escaped and whose target is javascript:. */
const LIVE_JAVASCRIPT_LINK = /(?<!\\)\]\(\s*<?\s*javascript:/i;

const FORMATTED_CONTENT = [
  '<h1>Agenda</h1>',
  '<p>Plain <strong>bold</strong> and <em>italic</em> with <a href="https://example.com/doc">a link</a></p>',
  '<ul><li><p>First bullet</p></li></ul>',
  '<ol><li><p>First step</p></li></ol>',
  '<ul data-type="taskList">',
  '<li data-checked="true" data-type="taskItem"><label><input type="checkbox" checked="checked"><span></span></label><div><p>Done task</p></div></li>',
  '<li data-checked="false" data-type="taskItem"><label><input type="checkbox"><span></span></label><div><p>Open task</p></div></li>',
  '</ul>',
].join('');

test.describe('meeting notes — Markdown export (AC-019, AC-003)', () => {
  test('exports the note without, then with, the transcript', async ({
    primaryPage,
    secondaryPage,
    messagingData,
    notesWorld,
  }) => {
    const space = await notesWorld.createSpace('Export room');
    const tag = notesWorld.runTag;
    const title = `${MEETING_NOTES_E2E_PREFIX} Export ${tag}`;
    const secondaryName = await notesWorld.displayNameOf(messagingData.secondary.userId);
    const authorName = await notesWorld.displayNameOf(messagingData.primary.userId);
    const noteId = await notesWorld.createNote(primaryPage, {
      spaceId: space.id,
      title,
      meetingDate: new Date(),
      content: FORMATTED_CONTENT,
      participantIds: [messagingData.secondary.userId],
    });
    await notesWorld.addActionItem(primaryPage, noteId, `Send the minutes ${tag}`, {
      assigneeId: messagingData.secondary.userId,
      dueDate: '2026-11-05',
    });
    await notesWorld.addActionItem(primaryPage, noteId, `Book the room ${tag}`);
    await notesWorld.setSummaryAndTranscriptUnsafe(noteId, {
      summary: `Summary of the meeting ${tag}`,
      transcript: `Ana: transcript words ${tag}`,
    });

    const viewer = secondaryPage;
    await openNote(viewer, noteId);
    const shownDate = (await viewer.getByTestId('meeting-note-date').getAttribute('datetime')) ?? '';
    expect(shownDate).not.toBe('');
    const localDay = await viewer.evaluate((iso) => {
      const date = new Date(iso);
      const pad = (value: number) => String(value).padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }, shownDate);

    // Without the transcript (the box starts unticked).
    await expect(viewer.getByLabel('Include transcript')).not.toBeChecked();
    const plain = await exportNoteMarkdown(viewer);
    expect(plain.filename).toBe(`${title} ${localDay}.md`);
    const md = plain.text;
    expect(md.startsWith(`# ${title}\n`)).toBe(true);
    expect(md).toContain(`- **Meeting date:** ${localDay}\n`);
    expect(md).toContain(`- **Space:** ${space.name}\n`);
    expect(md).toContain(`- **Author:** ${authorName}\n`);
    expect(md).toContain(`- **Participants:** ${secondaryName}\n`);
    expect(md).toContain('### Agenda');
    expect(md).toContain('Plain **bold** and *italic* with [a link](https://example.com/doc)');
    expect(md).toContain('- First bullet');
    expect(md).toContain('1. First step');
    expect(md).toContain('- [x] Done task\n- [ ] Open task');
    expect(md).toContain(`## Summary\n\nSummary of the meeting ${tag}\n`);
    expect(md).toContain(
      [
        `- [ ] Send the minutes ${tag}`,
        `  - Assignee: ${secondaryName}`,
        '  - Due date: 2026-11-05',
        '  - Status: open',
        `- [ ] Book the room ${tag}`,
        '  - Assignee: Unassigned',
        '  - Due date: None',
        '  - Status: open',
      ].join('\n'),
    );
    expect(md).not.toContain('## Transcript');
    expect(md).not.toContain('transcript words');

    // With the transcript.
    const full = await exportNoteMarkdown(viewer, { includeTranscript: true });
    expect(full.text).toContain(`## Transcript\n\nAna: transcript words ${tag}\n`);
    expect(full.text.startsWith(md.trimEnd())).toBe(true);
  });

  test('exports hostile user and AI text escaped, with nothing executed', async ({
    primaryPage,
    secondaryPage,
    notesWorld,
  }) => {
    const space = await notesWorld.createSpace('Hostile export room');
    const tag = notesWorld.runTag;
    const hostileMember = await notesWorld.createCompanyMember('<b onmouseover="alert(1)">Eve</b> [p](javascript:alert(2))');
    const noteId = await notesWorld.createNote(primaryPage, {
      spaceId: space.id,
      title: `${MEETING_NOTES_E2E_PREFIX} <script>alert("t")</script> [click](javascript:alert(3)) ${tag}`,
      meetingDate: new Date(),
      content: '<p>placeholder</p>',
      participantIds: [hostileMember.id],
    });
    // Raw markup that never went through the write-side sanitizer.
    await notesWorld.overwriteStoredContentUnsafe(
      noteId,
      [
        '<p>Hi<script>window.__mnXss = "script"</script><img src="x" onerror="window.__mnXss = \'img\'">',
        '<a href="javascript:window.__mnXss = \'link\'">bad link</a> &lt;b&gt;typed tag&lt;/b&gt;',
        ' [md](javascript:alert(4)) <a href="https://example.com/ok">good</a></p>',
      ].join(''),
    );
    await notesWorld.addActionItem(primaryPage, noteId, '<img src=x onerror=alert(5)> [x](javascript:alert(6))');
    await notesWorld.setSummaryAndTranscriptUnsafe(noteId, {
      summary: '<script>alert(7)</script> <a href="javascript:alert(8)">s</a> ![i](javascript:alert(9))',
      transcript: 'Bob: <script>alert(10)</script>\n<iframe src="javascript:alert(11)"></iframe>',
    });

    const viewer = secondaryPage;
    const dialogs: string[] = [];
    viewer.on('dialog', (dialog) => {
      dialogs.push(dialog.message());
      void dialog.dismiss();
    });
    await openNote(viewer, noteId);
    const file = await exportNoteMarkdown(viewer, { includeTranscript: true });
    const md = file.text;

    expect(md).not.toContain('<');
    expect(md).not.toMatch(LIVE_JAVASCRIPT_LINK);
    expect(md).not.toMatch(/!\[/);
    expect(md).not.toContain('__mnXss');
    expect(md).toContain('[good](https://example.com/ok)');
    expect(md).toContain('&lt;script&gt;alert("t")&lt;/script&gt; \\[click\\](javascript:alert(3))');
    expect(md).toContain('&lt;b onmouseover="alert(1)"&gt;Eve&lt;/b&gt; \\[p\\](javascript:alert(2))');
    expect(md).toContain('&lt;b&gt;typed tag&lt;/b&gt; \\[md\\](javascript:alert(4))');
    expect(md).toContain('- [ ] &lt;img src=x onerror=alert(5)&gt; \\[x\\](javascript:alert(6))');
    expect(md).toContain('&lt;script&gt;alert(7)&lt;/script&gt;');
    expect(md).toContain('Bob: &lt;script&gt;alert(10)&lt;/script&gt;');
    expect(file.filename).not.toMatch(/[<>:"/\\|?*]/);

    // Nothing ran in the page.
    expect(dialogs).toEqual([]);
    expect(await viewer.evaluate(() => (window as unknown as { __mnXss?: string }).__mnXss ?? null)).toBeNull();
  });
});
