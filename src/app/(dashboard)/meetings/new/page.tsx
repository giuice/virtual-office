// src/app/(dashboard)/meetings/new/page.tsx
'use client';

import { Suspense } from 'react';

import { DashboardShell } from '@/components/shell/dashboard-shell';
import { MeetingNoteCreateView } from '@/components/meeting-notes/MeetingNoteCreateView';

export default function NewMeetingNotePage() {
  return (
    <DashboardShell heading="New meeting note" description="Record what was discussed and decided">
      {/* useSearchParams (spaceId) needs a Suspense boundary. */}
      <Suspense fallback={null}>
        <MeetingNoteCreateView />
      </Suspense>
    </DashboardShell>
  );
}
