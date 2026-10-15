// src/lib/meeting-notes/markdown-export.ts
// The Markdown export of a note (FR-027, AC-019, AC-003): title, meeting date,
// space (or "Space removed"), author, participants (former members marked),
// the content converted to Markdown, the summary, the action items (assignee,
// due date, status), and — only when asked — the stored transcript. Every
// piece of user or AI text goes through markdown-escape.ts, so the file holds
// no raw HTML and no Markdown structure that came from that text.
import type { MeetingNoteActionItemView, MeetingNoteDetail } from '@/types/meeting-notes';

import { meetingNoteHtmlToMarkdown } from './html-to-markdown';
import { escapeAtxHeadingText, escapeMarkdownBlock, escapeMarkdownLine } from './markdown-escape';

export interface MeetingNoteMarkdownOptions {
  /** Include `note.transcript` (the caller loaded it). */
  includeTranscript: boolean;
  /** IANA time zone the meeting date is written in (the viewer's). */
  timeZone: string;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** The calendar day 'YYYY-MM-DD' of an instant in `timeZone`; null when unparsable. */
export function calendarDayInZone(value: string, timeZone: string): string | null {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? '';
  const day = `${part('year')}-${part('month')}-${part('day')}`;
  return DATE_ONLY.test(day) ? day : null;
}

function personLabel(name: string, isCurrentMember: boolean): string {
  const escaped = escapeMarkdownLine(name);
  return isCurrentMember ? escaped : `${escaped} (Former member)`;
}

function itemLines(item: MeetingNoteActionItemView): string {
  const assignee =
    item.assigneeId === null
      ? 'Unassigned'
      : personLabel(item.assigneeName ?? 'Unknown member', item.assigneeIsCurrentMember === true);
  // A date-only value is written as stored: no Date conversion, no time zone.
  const due = item.dueDate && DATE_ONLY.test(item.dueDate) ? item.dueDate : 'None';
  return [
    `- [${item.completed ? 'x' : ' '}] ${escapeMarkdownBlock(item.description, '  ')}`,
    `  - Assignee: ${assignee}`,
    `  - Due date: ${due}`,
    `  - Status: ${item.completed ? 'done' : 'open'}`,
  ].join('\n');
}

/** The whole .md document of a note. */
export function buildMeetingNoteMarkdown(note: MeetingNoteDetail, options: MeetingNoteMarkdownOptions): string {
  const meetingDay = calendarDayInZone(note.meetingDate, options.timeZone) ?? escapeMarkdownLine(note.meetingDate);
  const space = note.spaceName === null ? 'Space removed' : escapeMarkdownLine(note.spaceName);
  const participants =
    note.participants.length === 0
      ? 'None'
      : note.participants.map((participant) => personLabel(participant.displayName, participant.isCurrentMember)).join(', ');

  const sections: string[] = [
    `# ${escapeAtxHeadingText(escapeMarkdownLine(note.title))}`,
    [
      `- **Meeting date:** ${meetingDay}`,
      `- **Space:** ${space}`,
      `- **Author:** ${escapeMarkdownLine(note.authorName)}`,
      `- **Participants:** ${participants}`,
    ].join('\n'),
    '## Notes',
    // The note's own headings nest under "## Notes" (h1 becomes ###).
    meetingNoteHtmlToMarkdown(note.content, 2) || 'No notes.',
    '## Summary',
    (note.summary ? escapeMarkdownBlock(note.summary) : '') || 'No summary.',
    '## Action items',
    note.actionItems.length === 0 ? 'No action items.' : note.actionItems.map(itemLines).join('\n'),
  ];

  if (options.includeTranscript) {
    sections.push('## Transcript', (note.transcript ? escapeMarkdownBlock(note.transcript) : '') || 'No transcript.');
  }

  return `${sections.join('\n\n')}\n`;
}

const RFC5987_UNSAFE = /['()*!]/g;

/**
 * Download names for a note's export: an ASCII slug for `filename` and the
 * readable UTF-8 title for `filename*`; both end with the meeting day.
 */
export function meetingNoteExportFilenames(title: string, day: string | null): { ascii: string; utf8: string } {
  const suffix = day && DATE_ONLY.test(day) ? `-${day}` : '';
  const slug =
    title
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80)
      .replace(/-+$/, '') || 'meeting-note';
  const readable =
    Array.from(
      title
        .toWellFormed()
        .replace(/[\u0000-\u001f\u007f-\u009f"\\/:*?<>|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
      .slice(0, 120)
      .join('')
      .trim()
      .replace(/^\.+/, '') || 'Meeting note';
  return { ascii: `${slug}${suffix}.md`, utf8: `${readable}${day && DATE_ONLY.test(day) ? ` ${day}` : ''}.md` };
}

/** `Content-Disposition` for the export download. */
export function meetingNoteExportContentDisposition(names: { ascii: string; utf8: string }): string {
  const encoded = encodeURIComponent(names.utf8).replace(
    RFC5987_UNSAFE,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `attachment; filename="${names.ascii}"; filename*=UTF-8''${encoded}`;
}
