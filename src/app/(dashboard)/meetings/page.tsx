// src/app/(dashboard)/meetings/page.tsx
'use client';

import { DashboardShell } from '@/components/shell/dashboard-shell';
import { MeetingsBrowser } from '@/components/meeting-notes/MeetingsBrowser';

export default function MeetingsPage() {
  return (
    <DashboardShell
      heading="Meetings"
      description="Meeting notes from every space of your company"
    >
      <MeetingsBrowser />
    </DashboardShell>
  );
}
