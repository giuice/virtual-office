// src/hooks/queries/useMeetingNoteAiSettings.ts
// The company's AI settings metadata (Phase 6 T8, FR-024). Keyed by the
// viewer's application users.id and company id so one account's cache is never
// shown to another. Never contains an API key.
'use client';

import { useQuery } from '@tanstack/react-query';

import { useMeetingNotesScope } from '@/hooks/queries/useMeetingNotes';
import { shouldRetryMeetingNotesRequest } from '@/lib/meeting-notes/client-api';
import { fetchMeetingNoteAiSettings } from '@/lib/meeting-notes/ai/settings-client-api';

export const meetingNoteAiSettingsQueryKey = (userId: string, companyId: string) =>
  ['meeting-note-ai-settings', userId, companyId] as const;

export function useMeetingNoteAiSettings() {
  const scope = useMeetingNotesScope();
  return useQuery({
    queryKey: meetingNoteAiSettingsQueryKey(scope?.userId ?? '', scope?.companyId ?? ''),
    enabled: scope !== null,
    queryFn: ({ signal }) => fetchMeetingNoteAiSettings(signal),
    staleTime: 30_000,
    retry: shouldRetryMeetingNotesRequest,
  });
}
