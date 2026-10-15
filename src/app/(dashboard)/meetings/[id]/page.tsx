// src/app/(dashboard)/meetings/[id]/page.tsx
'use client';

import { useParams } from 'next/navigation';

import { DashboardShell } from '@/components/shell/dashboard-shell';
import { MeetingNoteView } from '@/components/meeting-notes/MeetingNoteView';

export default function MeetingNotePage() {
  const params = useParams<{ id: string }>();
  const noteId = typeof params?.id === 'string' ? params.id : '';

  return (
    <DashboardShell heading="Meeting note">
      {/* Remount per note so edit state never carries over to another note. */}
      <MeetingNoteView key={noteId} noteId={noteId} />
    </DashboardShell>
  );
}
