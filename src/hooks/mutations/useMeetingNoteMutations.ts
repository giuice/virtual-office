// src/hooks/mutations/useMeetingNoteMutations.ts
// Meeting-note changes (Phase 6 FR-001, FR-007, FR-009, FR-010). The routes
// and the database authorize each change against the note's current
// revision; a stale one fails with MeetingNoteConflictError (409) and never
// overwrites. A successful change, and a 409 (which carries the newer note),
// refresh the viewer's meeting-note scope (space Notes tabs, Meetings search,
// the note and its history). Any other failure leaves the cache alone: a
// request that never reached the server proves nothing changed, and a refetch
// that fails offline must not disturb an open editor (block B review B-3).
// Every change runs through useMeetingNotesScopedMutation (scope fence).
'use client';

import { hashKey, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { useMeetingNotesScopedMutation } from '@/hooks/mutations/useMeetingNotesScopedMutation';
import { meetingNoteQueryKeys } from '@/hooks/queries/useMeetingNotes';
import {
  createMeetingNote,
  deleteMeetingNote,
  MeetingNoteConflictError,
  restoreMeetingNoteVersion,
  updateMeetingNote,
  type MeetingNoteFieldsPayload,
} from '@/lib/meeting-notes/client-api';
import type { MeetingNotesScope } from '@/lib/meeting-notes/scope-fence';
import type { MeetingNoteDetail } from '@/types/meeting-notes';

type Scope = MeetingNotesScope;

/** Stores the note the route returned and marks every list and history of this viewer stale. */
function settleNote(queryClient: QueryClient, scope: Scope, note: MeetingNoteDetail | null): void {
  if (note) {
    queryClient.setQueryData(meetingNoteQueryKeys.note(scope.userId, scope.companyId, note.id), note);
  }
  void queryClient.invalidateQueries({
    queryKey: meetingNoteQueryKeys.scope(scope.userId, scope.companyId),
    // The view just written above is current; everything else refetches.
    predicate: (query) =>
      !note || query.queryHash !== hashKey(meetingNoteQueryKeys.note(scope.userId, scope.companyId, note.id)),
  });
}

/** After a 409 the cache takes the newer note the route returned; other failures change nothing. */
function settleConflict(queryClient: QueryClient, scope: Scope, error: unknown): void {
  if (error instanceof MeetingNoteConflictError) settleNote(queryClient, scope, error.note);
}

export interface CreateMeetingNoteVariables {
  spaceId: string;
  fields: MeetingNoteFieldsPayload;
}

export function useCreateMeetingNote() {
  const queryClient = useQueryClient();
  return useMeetingNotesScopedMutation<MeetingNoteDetail, CreateMeetingNoteVariables>({
    name: 'create-note',
    mutationFn: ({ spaceId, fields }, { signal }) => createMeetingNote(spaceId, fields, signal),
    onSuccess: (note, _variables, scope) => settleNote(queryClient, scope, note),
  });
}

export interface UpdateMeetingNoteVariables {
  noteId: string;
  expectedRevision: number;
  fields: MeetingNoteFieldsPayload;
}

export function useUpdateMeetingNote() {
  const queryClient = useQueryClient();
  return useMeetingNotesScopedMutation<MeetingNoteDetail, UpdateMeetingNoteVariables>({
    name: 'update-note',
    mutationFn: ({ noteId, expectedRevision, fields }, { signal }) =>
      updateMeetingNote(noteId, expectedRevision, fields, signal),
    onSuccess: (note, _variables, scope) => settleNote(queryClient, scope, note),
    onError: (error, _variables, scope) => settleConflict(queryClient, scope, error),
  });
}

export interface RestoreMeetingNoteVariables {
  noteId: string;
  expectedRevision: number;
  versionId: string;
}

export function useRestoreMeetingNoteVersion() {
  const queryClient = useQueryClient();
  return useMeetingNotesScopedMutation<MeetingNoteDetail, RestoreMeetingNoteVariables>({
    name: 'restore-note',
    mutationFn: ({ noteId, expectedRevision, versionId }, { signal }) =>
      restoreMeetingNoteVersion(noteId, expectedRevision, versionId, signal),
    onSuccess: (note, _variables, scope) => settleNote(queryClient, scope, note),
    onError: (error, _variables, scope) => settleConflict(queryClient, scope, error),
  });
}

export interface DeleteMeetingNoteVariables {
  noteId: string;
  expectedRevision: number;
}

export function useDeleteMeetingNote() {
  const queryClient = useQueryClient();
  return useMeetingNotesScopedMutation<void, DeleteMeetingNoteVariables>({
    name: 'delete-note',
    mutationFn: ({ noteId, expectedRevision }, { signal }) => deleteMeetingNote(noteId, expectedRevision, signal),
    onSuccess: (_result, { noteId }, scope) => {
      // The deleted note's own queries would only answer 404 now: they are
      // left alone here and dropped by the view once it stops observing them
      // (removeMeetingNoteQueries); every list refetches.
      const root = meetingNoteQueryKeys.noteRoot(scope.userId, scope.companyId, noteId);
      void queryClient.invalidateQueries({
        queryKey: meetingNoteQueryKeys.scope(scope.userId, scope.companyId),
        predicate: (query) => !root.every((part, index) => query.queryKey[index] === part),
      });
    },
    onError: (error, _variables, scope) => settleConflict(queryClient, scope, error),
  });
}

/** Drops everything cached for a deleted note (call once nothing observes it any more). */
export function removeMeetingNoteQueries(queryClient: QueryClient, scope: Scope, noteId: string): void {
  queryClient.removeQueries({ queryKey: meetingNoteQueryKeys.noteRoot(scope.userId, scope.companyId, noteId) });
}

/** For other note writes (transcript upload/attach, AI Apply): the same cache settlement. */
export { settleNote as settleMeetingNoteCache, settleConflict as settleMeetingNoteConflictCache };
