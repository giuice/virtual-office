// src/components/meeting-notes/MeetingNoteRichTextEditorLazy.tsx
// Loads the Tiptap editor in the browser only (no server rendering), so the
// editor library never runs during SSR or the build's prerender.
'use client';

import dynamic from 'next/dynamic';

export const MeetingNoteRichTextEditorLazy = dynamic(() => import('./editor/MeetingNoteRichTextEditor'), {
  ssr: false,
  loading: () => (
    <div className="min-h-[14.5rem] rounded-md border border-input bg-background p-4 text-sm text-muted-foreground" role="status">
      Loading editor…
    </div>
  ),
});
