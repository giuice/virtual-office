// src/hooks/mutations/useMeetingNoteTranscriptMutations.ts
// Transcript uploads (Phase 6 FR-012, FR-013; T10 routes, T13 UI): "New note
// from transcript" creates the note at upload; "Attach transcript" replaces
// the stored transcript of a note against its revision (409 →
// MeetingNoteConflictError with the newer note). Both run through the scope
// fence (useMeetingNotesScopedMutation) and settle the viewer's meeting-note
// cache like every other note write.
'use client';

import { useQueryClient } from '@tanstack/react-query';

import {
  settleMeetingNoteCache,
  settleMeetingNoteConflictCache,
} from '@/hooks/mutations/useMeetingNoteMutations';
import { useMeetingNotesScopedMutation } from '@/hooks/mutations/useMeetingNotesScopedMutation';
import { attachMeetingNoteTranscript, createMeetingNoteFromTranscript } from '@/lib/meeting-notes/client-api';
import type { MeetingNoteDetail } from '@/types/meeting-notes';

export interface CreateMeetingNoteFromTranscriptVariables {
  spaceId: string;
  file: File;
}

export function useCreateMeetingNoteFromTranscript() {
  const queryClient = useQueryClient();
  return useMeetingNotesScopedMutation<MeetingNoteDetail, CreateMeetingNoteFromTranscriptVariables>({
    name: 'create-note-from-transcript',
    // The file leaves the MutationCache once nothing observes the call.
    gcTime: 0,
    mutationFn: ({ spaceId, file }, { signal }) => createMeetingNoteFromTranscript(spaceId, file, signal),
    onSuccess: (note, _variables, scope) => settleMeetingNoteCache(queryClient, scope, note),
  });
}

export interface AttachMeetingNoteTranscriptVariables {
  noteId: string;
  expectedRevision: number;
  file: File;
}

export function useAttachMeetingNoteTranscript() {
  const queryClient = useQueryClient();
  return useMeetingNotesScopedMutation<MeetingNoteDetail, AttachMeetingNoteTranscriptVariables>({
    name: 'attach-transcript',
    gcTime: 0,
    mutationFn: ({ noteId, expectedRevision, file }, { signal }) =>
      attachMeetingNoteTranscript(noteId, expectedRevision, file, signal),
    onSuccess: (note, _variables, scope) => settleMeetingNoteCache(queryClient, scope, note),
    onError: (error, _variables, scope) => settleMeetingNoteConflictCache(queryClient, scope, error),
  });
}
