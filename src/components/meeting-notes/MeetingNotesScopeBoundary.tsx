// src/components/meeting-notes/MeetingNotesScopeBoundary.tsx
// Renders nothing; keeps the meeting-notes scope fence in step with the
// signed-in user and company (useMeetingNotesScopeLifecycle). Mounted once in
// the root layout inside CompanyProvider, so it outlives every page.
'use client';

import { useMeetingNotesScopeLifecycle } from '@/hooks/queries/useMeetingNotesScopeLifecycle';

export function MeetingNotesScopeBoundary(): null {
  useMeetingNotesScopeLifecycle();
  return null;
}
