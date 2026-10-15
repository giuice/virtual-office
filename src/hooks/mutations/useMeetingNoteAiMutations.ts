// src/hooks/mutations/useMeetingNoteAiMutations.ts
// The AI flow's requests (Phase 6 T13; FR-015, FR-018, FR-021, FR-031):
// the ticket (provider notice + usage), processing (the draft), and Apply.
// Each runs through useMeetingNotesScopedMutation: its request is aborted
// when the signed-in scope (users.id + company) retires, and a late answer of
// a retired scope runs no callback, so no draft, cache write, or navigation
// of the previous account ever happens. Ticket and processing are also
// aborted when the note view unmounts (leaving the page cancels, FR-021);
// processing can also be cancelled by the user (`cancelSignal`). Settled
// calls leave the MutationCache as soon as nothing observes them (gcTime 0),
// so neither tickets nor drafts linger there.
// A processing response that carries a draft is handed to the flow only
// after a fresh read of the note through the user's own session confirms
// that they still edit it in the same company (FR-021 browser clause): the
// server authorizes the draft when it finalizes, but the 200 may still be in
// transit when an admin removes the member, and this browser retires the
// scope only after membership reconciliation. On a lost access (404/403, a
// note of another company, no edit right) the draft is dropped, the flow
// shows "access lost", and the note's queries are refetched; the scope itself
// retires through the normal membership reconciliation. On success the note
// it read refreshes this viewer's cache when newer, so the review compares
// the draft with the note's current revision.
'use client';

import { useQueryClient, type QueryClient } from '@tanstack/react-query';

import {
  settleMeetingNoteCache,
  settleMeetingNoteConflictCache,
} from '@/hooks/mutations/useMeetingNoteMutations';
import { useMeetingNotesScopedMutation } from '@/hooks/mutations/useMeetingNotesScopedMutation';
import { meetingNoteAiSettingsQueryKey } from '@/hooks/queries/useMeetingNoteAiSettings';
import { meetingNoteQueryKeys } from '@/hooks/queries/useMeetingNotes';
import {
  applyMeetingNoteAiDraft,
  fetchMeetingNoteAiTicket,
  fetchMeetingNoteDetail,
  MeetingNotesApiError,
  processMeetingNoteAiDraft,
  type MeetingNoteAiApplyResponse,
} from '@/lib/meeting-notes/client-api';
import type { MeetingNotesScope } from '@/lib/meeting-notes/scope-fence';
import type {
  MeetingNoteAiApplyInput,
  MeetingNoteAiProcessResponse,
  MeetingNoteAiTicketResponse,
  MeetingNoteDetail,
} from '@/types/meeting-notes';

/** One signal aborted when either input is. */
function eitherSignal(primary: AbortSignal, secondary: AbortSignal | undefined): AbortSignal {
  if (!secondary) return primary;
  const controller = new AbortController();
  if (primary.aborted || secondary.aborted) {
    controller.abort();
    return controller.signal;
  }
  const abort = () => controller.abort();
  primary.addEventListener('abort', abort, { once: true });
  secondary.addEventListener('abort', abort, { once: true });
  return controller.signal;
}

/** After an AI refusal: refresh what it says is outdated (settings, the note, or access). */
function refreshAfterAiError(queryClient: QueryClient, scope: MeetingNotesScope, noteId: string, error: Error): void {
  if (!(error instanceof MeetingNotesApiError) || error.status === 0) return;
  if (error.code === 'MEETING_NOTE_AI_NOT_CONFIGURED' || error.code === 'MEETING_NOTE_AI_SETTINGS_STALE') {
    void queryClient.invalidateQueries({ queryKey: meetingNoteAiSettingsQueryKey(scope.userId, scope.companyId) });
  }
  if (
    error.code === 'MEETING_NOTE_AI_SOURCE_STALE' ||
    error.code === 'MEETING_NOTE_AI_TRANSCRIPT_REQUIRED' ||
    error.status === 404 ||
    error.status === 403
  ) {
    void queryClient.invalidateQueries({ queryKey: meetingNoteQueryKeys.noteRoot(scope.userId, scope.companyId, noteId) });
  }
}

/**
 * Confirms, with the user's session, that the draft's note is still readable
 * and editable by the caller in `scope`'s company, and returns that fresh
 * note; throws the access-lost error the flow shows otherwise. Uses the
 * request's signal, so Cancel, leaving the page, and a retiring scope abort
 * it too.
 */
async function confirmDraftAccess(
  noteId: string,
  scope: MeetingNotesScope,
  signal: AbortSignal
): Promise<MeetingNoteDetail> {
  const note = await fetchMeetingNoteDetail(noteId, {}, signal);
  if (note.id.toLowerCase() !== noteId.toLowerCase() || note.companyId !== scope.companyId) {
    throw new MeetingNotesApiError(404, 'MEETING_NOTE_NOT_FOUND', 'This meeting note is no longer available.');
  }
  if (!note.rights.canEdit) {
    throw new MeetingNotesApiError(403, 'MEETING_NOTE_FORBIDDEN', 'You can no longer edit this meeting note.');
  }
  return note;
}

/**
 * Stores the note read by the access check unless the cache already holds
 * that revision or a newer one: a note edited elsewhere before the ticket was
 * issued would otherwise stay at its old revision in this view, and the
 * review would report the draft's newer source as a conflict. An outstanding
 * fetch of the same note started earlier and may carry an older revision, so
 * it is cancelled first (synchronously: its state reverts and its late answer
 * is dropped).
 */
function storeConfirmedNote(queryClient: QueryClient, scope: MeetingNotesScope, note: MeetingNoteDetail): void {
  const queryKey = meetingNoteQueryKeys.note(scope.userId, scope.companyId, note.id);
  void queryClient.cancelQueries({ queryKey, exact: true });
  const cached = queryClient.getQueryData<MeetingNoteDetail>(queryKey);
  if (cached && cached.revision >= note.revision) return;
  settleMeetingNoteCache(queryClient, scope, note);
}

export interface MeetingNoteAiTicketVariables {
  noteId: string;
}

export function useMeetingNoteAiTicket() {
  const queryClient = useQueryClient();
  return useMeetingNotesScopedMutation<MeetingNoteAiTicketResponse, MeetingNoteAiTicketVariables>({
    name: 'ai-ticket',
    abortOnUnmount: true,
    gcTime: 0,
    mutationFn: ({ noteId }, { signal }) => fetchMeetingNoteAiTicket(noteId, signal),
    onError: (error, { noteId }, scope) => refreshAfterAiError(queryClient, scope, noteId, error),
  });
}

export interface ProcessMeetingNoteAiVariables {
  noteId: string;
  ticket: string;
  /** The user's Cancel. */
  cancelSignal?: AbortSignal;
}

/** The processing answer plus the note read by the access check (null without a draft). */
export interface ProcessMeetingNoteAiResult extends MeetingNoteAiProcessResponse {
  confirmedNote: MeetingNoteDetail | null;
}

export function useProcessMeetingNoteAi() {
  const queryClient = useQueryClient();
  return useMeetingNotesScopedMutation<ProcessMeetingNoteAiResult, ProcessMeetingNoteAiVariables>({
    name: 'ai-process',
    abortOnUnmount: true,
    gcTime: 0,
    mutationFn: async ({ noteId, ticket, cancelSignal }, { scope, signal }) => {
      const requestSignal = eitherSignal(signal, cancelSignal);
      const response = await processMeetingNoteAiDraft(noteId, ticket, requestSignal);
      const confirmedNote = response.draft !== null ? await confirmDraftAccess(noteId, scope, requestSignal) : null;
      return { ...response, confirmedNote };
    },
    onSuccess: ({ confirmedNote }, _variables, scope) => {
      if (confirmedNote) storeConfirmedNote(queryClient, scope, confirmedNote);
    },
    onError: (error, { noteId }, scope) => refreshAfterAiError(queryClient, scope, noteId, error),
  });
}

export interface ApplyMeetingNoteAiDraftVariables {
  noteId: string;
  input: MeetingNoteAiApplyInput;
}

export function useApplyMeetingNoteAiDraft() {
  const queryClient = useQueryClient();
  return useMeetingNotesScopedMutation<MeetingNoteAiApplyResponse, ApplyMeetingNoteAiDraftVariables>({
    name: 'ai-apply',
    gcTime: 0,
    mutationFn: ({ noteId, input }, { signal }) => applyMeetingNoteAiDraft(noteId, input, signal),
    onSuccess: ({ note }, _variables, scope) => settleMeetingNoteCache(queryClient, scope, note),
    onError: (error, { noteId }, scope) => {
      settleMeetingNoteConflictCache(queryClient, scope, error);
      if (error instanceof MeetingNotesApiError && (error.status === 404 || error.status === 403)) {
        void queryClient.invalidateQueries({ queryKey: meetingNoteQueryKeys.noteRoot(scope.userId, scope.companyId, noteId) });
      }
    },
  });
}
