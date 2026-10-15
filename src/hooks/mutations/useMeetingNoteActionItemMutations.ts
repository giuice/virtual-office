// src/hooks/mutations/useMeetingNoteActionItemMutations.ts
// Action-item changes (Phase 6 FR-011, BR-005): add, edit, delete (editors)
// and completion (editors and the item's current assignee). Each change is
// checked by the route and the database against the item's revision; a stale
// one fails with MeetingNoteItemConflictError (409) carrying the newer item.
// Every change the server answered writes the returned item into the cached
// note and refreshes the viewer's meeting-note scope (search indexes item
// text); a request that never reached the server (offline, aborted) changes
// nothing in the cache. Every change runs through
// useMeetingNotesScopedMutation (scope fence).
'use client';

import { useQueryClient, type QueryClient } from '@tanstack/react-query';

import { useMeetingNotesScopedMutation } from '@/hooks/mutations/useMeetingNotesScopedMutation';
import { meetingNoteQueryKeys } from '@/hooks/queries/useMeetingNotes';
import {
  createMeetingNoteActionItem,
  deleteMeetingNoteActionItem,
  MeetingNoteItemConflictError,
  MeetingNotesApiError,
  setMeetingNoteActionItemCompleted,
  updateMeetingNoteActionItem,
} from '@/lib/meeting-notes/client-api';
import type { MeetingNotesScope } from '@/lib/meeting-notes/scope-fence';
import type {
  MeetingNoteActionItemFieldsInput,
  MeetingNoteActionItemView,
  MeetingNoteDetail,
} from '@/types/meeting-notes';

type Scope = MeetingNotesScope;

type ItemChange = { kind: 'upsert'; item: MeetingNoteActionItemView } | { kind: 'remove'; itemId: string };

function applyChange(items: MeetingNoteActionItemView[], change: ItemChange): MeetingNoteActionItemView[] {
  if (change.kind === 'remove') return items.filter((item) => item.id !== change.itemId);
  const index = items.findIndex((item) => item.id === change.item.id);
  if (index === -1) return [...items, change.item];
  // Never replace a newer cached state with an older response.
  if (items[index].revision > change.item.revision) return items;
  return items.map((item, position) => (position === index ? change.item : item));
}

/** Writes the change into the cached note (if any), then refreshes everything of this viewer. */
function settleItem(queryClient: QueryClient, scope: Scope, noteId: string, change: ItemChange | null): void {
  if (change) {
    queryClient.setQueryData<MeetingNoteDetail>(meetingNoteQueryKeys.note(scope.userId, scope.companyId, noteId), (note) =>
      note ? { ...note, actionItems: applyChange(note.actionItems, change) } : note
    );
  }
  void queryClient.invalidateQueries({ queryKey: meetingNoteQueryKeys.scope(scope.userId, scope.companyId) });
}

/**
 * After a failure: a 409 brings the newer item; another answer from the server
 * refreshes; a request that never got an answer (status 0, aborted) changes nothing.
 */
function settleItemError(queryClient: QueryClient, scope: Scope, noteId: string, error: unknown): void {
  if (!(error instanceof MeetingNotesApiError) || error.status === 0) return;
  settleItem(
    queryClient,
    scope,
    noteId,
    error instanceof MeetingNoteItemConflictError ? { kind: 'upsert', item: error.item } : null
  );
}

export interface CreateMeetingNoteActionItemVariables {
  noteId: string;
  fields: MeetingNoteActionItemFieldsInput;
}

export function useCreateMeetingNoteActionItem() {
  const queryClient = useQueryClient();
  return useMeetingNotesScopedMutation<MeetingNoteActionItemView, CreateMeetingNoteActionItemVariables>({
    name: 'create-item',
    mutationFn: ({ noteId, fields }, { signal }) => createMeetingNoteActionItem(noteId, fields, signal),
    onSuccess: (item, { noteId }, scope) => settleItem(queryClient, scope, noteId, { kind: 'upsert', item }),
    onError: (error, { noteId }, scope) => settleItemError(queryClient, scope, noteId, error),
  });
}

export interface UpdateMeetingNoteActionItemVariables {
  noteId: string;
  itemId: string;
  expectedRevision: number;
  fields: MeetingNoteActionItemFieldsInput;
}

export function useUpdateMeetingNoteActionItem() {
  const queryClient = useQueryClient();
  return useMeetingNotesScopedMutation<MeetingNoteActionItemView, UpdateMeetingNoteActionItemVariables>({
    name: 'update-item',
    mutationFn: ({ noteId, itemId, expectedRevision, fields }, { signal }) =>
      updateMeetingNoteActionItem(noteId, itemId, expectedRevision, fields, signal),
    onSuccess: (item, { noteId }, scope) => settleItem(queryClient, scope, noteId, { kind: 'upsert', item }),
    onError: (error, { noteId }, scope) => settleItemError(queryClient, scope, noteId, error),
  });
}

export interface DeleteMeetingNoteActionItemVariables {
  noteId: string;
  itemId: string;
  expectedRevision: number;
}

export function useDeleteMeetingNoteActionItem() {
  const queryClient = useQueryClient();
  return useMeetingNotesScopedMutation<void, DeleteMeetingNoteActionItemVariables>({
    name: 'delete-item',
    mutationFn: ({ noteId, itemId, expectedRevision }, { signal }) =>
      deleteMeetingNoteActionItem(noteId, itemId, expectedRevision, signal),
    onSuccess: (_result, { noteId, itemId }, scope) => settleItem(queryClient, scope, noteId, { kind: 'remove', itemId }),
    onError: (error, { noteId }, scope) => settleItemError(queryClient, scope, noteId, error),
  });
}

export interface SetMeetingNoteActionItemCompletedVariables {
  noteId: string;
  itemId: string;
  expectedRevision: number;
  completed: boolean;
}

export function useSetMeetingNoteActionItemCompleted() {
  const queryClient = useQueryClient();
  return useMeetingNotesScopedMutation<MeetingNoteActionItemView, SetMeetingNoteActionItemCompletedVariables>({
    name: 'complete-item',
    mutationFn: ({ noteId, itemId, expectedRevision, completed }, { signal }) =>
      setMeetingNoteActionItemCompleted(noteId, itemId, expectedRevision, completed, signal),
    onSuccess: (item, { noteId }, scope) => settleItem(queryClient, scope, noteId, { kind: 'upsert', item }),
    onError: (error, { noteId }, scope) => settleItemError(queryClient, scope, noteId, error),
  });
}
