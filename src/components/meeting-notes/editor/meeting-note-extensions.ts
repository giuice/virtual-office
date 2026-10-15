// src/components/meeting-notes/editor/meeting-note-extensions.ts
// The Tiptap schema of a meeting note (FR-002): paragraphs, line breaks,
// bold, italic, headings 1–3, bulleted and numbered lists, checklists, and
// http/https/mailto links. Nothing else exists in the schema, so pasted code
// blocks, images, tables, quotes, strike, or rules are reduced to plain text.
// The HTML it emits is a subset of src/lib/meeting-notes/content-sanitizer.ts.
import type { Extensions } from '@tiptap/core';
import Bold from '@tiptap/extension-bold';
import Document from '@tiptap/extension-document';
import HardBreak from '@tiptap/extension-hard-break';
import Heading from '@tiptap/extension-heading';
import Italic from '@tiptap/extension-italic';
import Link from '@tiptap/extension-link';
import { BulletList, ListItem, ListKeymap, OrderedList, TaskItem, TaskList } from '@tiptap/extension-list';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { Placeholder, UndoRedo } from '@tiptap/extensions';

import { isSafeMeetingNoteLink } from '@/lib/meeting-notes/link-url';
import { MEETING_NOTE_LINK_REL } from '@/lib/meeting-notes/content-sanitizer';

export const MEETING_NOTE_HEADING_LEVELS = [1, 2, 3] as const;

export function createMeetingNoteExtensions(placeholder: string): Extensions {
  return [
    Document,
    Paragraph,
    Text,
    HardBreak,
    Bold,
    Italic,
    Heading.configure({ levels: [...MEETING_NOTE_HEADING_LEVELS] }),
    BulletList,
    OrderedList,
    ListItem,
    TaskList,
    TaskItem.configure({ nested: true }),
    ListKeymap,
    Link.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      defaultProtocol: 'https',
      protocols: ['mailto'],
      isAllowedUri: (url) => isSafeMeetingNoteLink(url),
      shouldAutoLink: (url) => isSafeMeetingNoteLink(url),
      HTMLAttributes: { rel: MEETING_NOTE_LINK_REL, target: '_blank' },
    }),
    UndoRedo,
    Placeholder.configure({ placeholder }),
  ];
}
