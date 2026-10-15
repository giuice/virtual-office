// src/components/meeting-notes/editor/MeetingNoteEditorToolbar.tsx
// Formatting toolbar of the meeting-note editor (§13): every control has an
// accessible name and a pressed state, Left/Right/Home/End move between
// controls (roving tab stop), and buttons keep the editor's selection.
'use client';

import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import {
  Bold,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListChecks,
  ListOrdered,
  Redo2,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { useRef, useState, type KeyboardEvent } from 'react';

import { MeetingNoteLinkControl } from './MeetingNoteLinkControl';
import { toolbarButtonClass } from './toolbar-styles';

interface ToolbarState {
  bold: boolean;
  italic: boolean;
  h1: boolean;
  h2: boolean;
  h3: boolean;
  bulletList: boolean;
  orderedList: boolean;
  taskList: boolean;
  link: boolean;
  linkHref: string;
  canUndo: boolean;
  canRedo: boolean;
}

const EMPTY_STATE: ToolbarState = {
  bold: false,
  italic: false,
  h1: false,
  h2: false,
  h3: false,
  bulletList: false,
  orderedList: false,
  taskList: false,
  link: false,
  linkHref: '',
  canUndo: false,
  canRedo: false,
};

interface ToggleSpec {
  key: keyof Pick<ToolbarState, 'bold' | 'italic' | 'h1' | 'h2' | 'h3' | 'bulletList' | 'orderedList' | 'taskList'>;
  label: string;
  icon: LucideIcon;
  run: (editor: Editor) => void;
}

const TOGGLES: ToggleSpec[] = [
  { key: 'bold', label: 'Bold', icon: Bold, run: (e) => e.chain().focus().toggleBold().run() },
  { key: 'italic', label: 'Italic', icon: Italic, run: (e) => e.chain().focus().toggleItalic().run() },
  { key: 'h1', label: 'Heading 1', icon: Heading1, run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run() },
  { key: 'h2', label: 'Heading 2', icon: Heading2, run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
  { key: 'h3', label: 'Heading 3', icon: Heading3, run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run() },
  { key: 'bulletList', label: 'Bulleted list', icon: List, run: (e) => e.chain().focus().toggleBulletList().run() },
  { key: 'orderedList', label: 'Numbered list', icon: ListOrdered, run: (e) => e.chain().focus().toggleOrderedList().run() },
  { key: 'taskList', label: 'Checklist', icon: ListChecks, run: (e) => e.chain().focus().toggleTaskList().run() },
];

export interface MeetingNoteEditorToolbarProps {
  editor: Editor | null;
  editorId: string;
  disabled: boolean;
}

export function MeetingNoteEditorToolbar({ editor, editorId, disabled }: MeetingNoteEditorToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [focusIndex, setFocusIndex] = useState(0);

  const state =
    useEditorState({
      editor,
      selector: ({ editor: current }): ToolbarState => {
        if (!current) return EMPTY_STATE;
        return {
          bold: current.isActive('bold'),
          italic: current.isActive('italic'),
          h1: current.isActive('heading', { level: 1 }),
          h2: current.isActive('heading', { level: 2 }),
          h3: current.isActive('heading', { level: 3 }),
          bulletList: current.isActive('bulletList'),
          orderedList: current.isActive('orderedList'),
          taskList: current.isActive('taskList'),
          link: current.isActive('link'),
          linkHref: String(current.getAttributes('link').href ?? ''),
          canUndo: current.can().undo(),
          canRedo: current.can().redo(),
        };
      },
    }) ?? EMPTY_STATE;

  const inactive = disabled || !editor;

  const controls = (): HTMLElement[] =>
    Array.from(toolbarRef.current?.querySelectorAll<HTMLElement>('[data-toolbar-control]:not(:disabled)') ?? []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = controls();
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (event.key === 'ArrowRight') next = (current + 1) % items.length;
    else if (event.key === 'ArrowLeft') next = (current - 1 + items.length) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    if (next < 0) return;
    event.preventDefault();
    items[next]?.focus();
  };

  // Roving tab stop: control indexes in DOM order (toggles, link, undo, redo).
  const LINK_INDEX = TOGGLES.length;
  const UNDO_INDEX = LINK_INDEX + 1;
  const REDO_INDEX = LINK_INDEX + 2;
  const undoDisabled = inactive || !state.canUndo;
  const redoDisabled = inactive || !state.canRedo;
  const tabStop =
    (focusIndex === UNDO_INDEX && undoDisabled) || (focusIndex === REDO_INDEX && redoDisabled) ? 0 : focusIndex;
  const tabIndexFor = (control: number) => (control === tabStop ? 0 : -1);
  const indexOf = (control: number) => () => setFocusIndex(control);

  return (
    <div
      ref={toolbarRef}
      role="toolbar"
      aria-label="Formatting"
      aria-controls={editorId}
      className="flex flex-wrap items-center gap-0.5 border-b border-input bg-muted/40 px-1.5 py-1"
      onKeyDown={onKeyDown}
    >
      {TOGGLES.map((toggle, own) => {
        const Icon = toggle.icon;
        return (
          <button
            key={toggle.key}
            type="button"
            data-toolbar-control
            className={toolbarButtonClass}
            aria-label={toggle.label}
            title={toggle.label}
            aria-pressed={state[toggle.key]}
            disabled={inactive}
            tabIndex={tabIndexFor(own)}
            onFocus={indexOf(own)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => editor && toggle.run(editor)}
          >
            <Icon className="size-4" aria-hidden="true" />
          </button>
        );
      })}
      <MeetingNoteLinkControl
        editor={editor}
        disabled={inactive}
        active={state.link}
        currentHref={state.linkHref}
        tabIndex={tabIndexFor(LINK_INDEX)}
        onFocus={indexOf(LINK_INDEX)}
      />
      <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
      <button
        type="button"
        data-toolbar-control
        className={toolbarButtonClass}
        aria-label="Undo"
        title="Undo"
        disabled={undoDisabled}
        tabIndex={tabIndexFor(UNDO_INDEX)}
        onFocus={indexOf(UNDO_INDEX)}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor?.chain().focus().undo().run()}
      >
        <Undo2 className="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        data-toolbar-control
        className={toolbarButtonClass}
        aria-label="Redo"
        title="Redo"
        disabled={redoDisabled}
        tabIndex={tabIndexFor(REDO_INDEX)}
        onFocus={indexOf(REDO_INDEX)}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor?.chain().focus().redo().run()}
      >
        <Redo2 className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
