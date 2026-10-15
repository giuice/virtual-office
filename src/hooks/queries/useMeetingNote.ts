// src/hooks/queries/useMeetingNote.ts
// One meeting note's reads (Phase 6 FR-005, FR-009): the note view, its stored
// transcript, its version list, and one version. Keys sit under
// meetingNoteQueryKeys.scope(users.id, company.id), so a cached note of one
// account or company is never shown to another and every note mutation's
// scope invalidation refreshes them.
'use client';

import { useQuery } from '@tanstack/react-query';

import { meetingNoteQueryKeys, useMeetingNotesScope } from '@/hooks/queries/useMeetingNotes';
import {
  fetchMeetingNoteDetail,
  fetchMeetingNoteVersion,
  fetchMeetingNoteVersions,
  shouldRetryMeetingNotesRequest,
} from '@/lib/meeting-notes/client-api';

/** The note view; 404 means missing or not visible (another company). */
export function useMeetingNoteDetail(noteId: string, enabled = true) {
  const scope = useMeetingNotesScope();
  return useQuery({
    queryKey: meetingNoteQueryKeys.note(scope?.userId ?? '', scope?.companyId ?? '', noteId),
    enabled: enabled && scope !== null && noteId.length > 0,
    queryFn: ({ signal }) => fetchMeetingNoteDetail(noteId, {}, signal),
    staleTime: 15_000,
    retry: shouldRetryMeetingNotesRequest,
  });
}

/** The stored transcript text (up to 1 MB), loaded only when asked for. */
export function useMeetingNoteTranscript(noteId: string, transcriptId: string | null, enabled: boolean) {
  const scope = useMeetingNotesScope();
  return useQuery({
    queryKey: [...meetingNoteQueryKeys.noteTranscript(scope?.userId ?? '', scope?.companyId ?? '', noteId), transcriptId],
    enabled: enabled && scope !== null && noteId.length > 0 && transcriptId !== null,
    queryFn: async ({ signal }) => {
      const note = await fetchMeetingNoteDetail(noteId, { includeTranscript: true }, signal);
      return note.transcript ?? null;
    },
    staleTime: 60_000,
    retry: shouldRetryMeetingNotesRequest,
  });
}

/** The note's versions, newest first, with the note's current revision. */
export function useMeetingNoteVersions(noteId: string, enabled: boolean) {
  const scope = useMeetingNotesScope();
  return useQuery({
    queryKey: meetingNoteQueryKeys.versions(scope?.userId ?? '', scope?.companyId ?? '', noteId),
    enabled: enabled && scope !== null && noteId.length > 0,
    queryFn: ({ signal }) => fetchMeetingNoteVersions(noteId, signal),
    staleTime: 15_000,
    retry: shouldRetryMeetingNotesRequest,
  });
}

/** One immutable version (never changes once written, so it stays cached). */
export function useMeetingNoteVersion(noteId: string, versionId: string | null) {
  const scope = useMeetingNotesScope();
  return useQuery({
    queryKey: meetingNoteQueryKeys.version(scope?.userId ?? '', scope?.companyId ?? '', noteId, versionId ?? ''),
    enabled: scope !== null && noteId.length > 0 && versionId !== null,
    queryFn: ({ signal }) => fetchMeetingNoteVersion(noteId, versionId ?? '', signal),
    staleTime: Infinity,
    retry: shouldRetryMeetingNotesRequest,
  });
}
