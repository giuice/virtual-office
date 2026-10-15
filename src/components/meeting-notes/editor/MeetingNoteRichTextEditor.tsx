// src/components/meeting-notes/editor/MeetingNoteRichTextEditor.tsx
// The meeting-note rich-text editor (FR-002): Tiptap limited to the SPEC's
// formatting set (meeting-note-extensions.ts). Client-only; load it through
// MeetingNoteRichTextEditorLazy so server rendering never touches Tiptap.
// Emits '' for an empty document, otherwise the editor HTML; the routes
// sanitize it again on write and the views sanitize it again on render.
'use client';

import { EditorContent, useEditor } from '@tiptap/react';
import { useEffect, useRef } from 'react';

import { cn } from '@/lib/utils';
import styles from '../meeting-note-content.module.css';
import { createMeetingNoteExtensions } from './meeting-note-extensions';
import { MeetingNoteEditorToolbar } from './MeetingNoteEditorToolbar';

export interface MeetingNoteRichTextEditorProps {
  /** id of the editable surface. */
  id: string;
  /** id of the visible label of the field. */
  labelId: string;
  /** ids of the help / error texts. */
  describedById?: string;
  /** Saved (sanitized) HTML to start from; later changes of this prop are ignored (remount to reset). */
  initialContent: string;
  invalid?: boolean;
  disabled?: boolean;
  placeholder?: string;
  onChange: (html: string) => void;
}

export default function MeetingNoteRichTextEditor({
  id,
  labelId,
  describedById,
  initialContent,
  invalid = false,
  disabled = false,
  placeholder = 'Write the meeting notes…',
  onChange,
}: MeetingNoteRichTextEditorProps) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editable: !disabled,
    extensions: createMeetingNoteExtensions(placeholder),
    content: initialContent,
    editorProps: {
      attributes: {
        id,
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-labelledby': labelId,
        ...(describedById ? { 'aria-describedby': describedById } : {}),
        'aria-invalid': invalid ? 'true' : 'false',
        'data-testid': 'meeting-note-editor',
        class: cn(styles.content, styles.editor),
      },
    },
    onCreate: ({ editor: created }) => {
      onChangeRef.current(created.isEmpty ? '' : created.getHTML());
    },
    onUpdate: ({ editor: updated }) => {
      onChangeRef.current(updated.isEmpty ? '' : updated.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  useEffect(() => {
    if (!editor) return;
    editor.setOptions({
      editorProps: {
        attributes: {
          ...((editor.options.editorProps?.attributes as Record<string, string> | undefined) ?? {}),
          'aria-invalid': invalid ? 'true' : 'false',
        },
      },
    });
  }, [editor, invalid]);

  return (
    <div
      className={cn(
        'overflow-hidden rounded-md border bg-background focus-within:ring-2 focus-within:ring-ring',
        invalid ? 'border-destructive' : 'border-input',
        disabled && 'opacity-70'
      )}
    >
      <MeetingNoteEditorToolbar editor={editor} editorId={id} disabled={disabled} />
      {editor ? (
        <EditorContent editor={editor} />
      ) : (
        <div className={cn(styles.editor, 'text-sm text-muted-foreground')} aria-hidden="true">
          Loading editor…
        </div>
      )}
    </div>
  );
}
