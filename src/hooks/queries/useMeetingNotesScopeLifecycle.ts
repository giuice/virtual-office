// src/hooks/queries/useMeetingNotesScopeLifecycle.ts
// Retires a meeting-notes scope when the signed-in application user or the
// company changes (sign-out, account switch in this or another tab, company
// change; Phase 6 FR-021 browser clause, block B review B-1/B-2): requests of
// the old scope are aborted, its meeting-note and AI-settings queries are
// cancelled and removed, and its mutations (variables, results, errors) leave
// the MutationCache. Mounted once, by MeetingNotesScopeBoundary.
'use client';

import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { meetingNoteAiSettingsQueryKey } from '@/hooks/queries/useMeetingNoteAiSettings';
import { meetingNoteQueryKeys, useMeetingNotesScope } from '@/hooks/queries/useMeetingNotes';
import {
  abortMeetingNotesScopeRequests,
  meetingNotesScopeKey,
  setCurrentMeetingNotesScope,
  type MeetingNotesScope,
} from '@/lib/meeting-notes/scope-fence';

/** Drops everything the client holds for a scope that is no longer signed in. */
export function retireMeetingNotesScope(queryClient: QueryClient, scope: MeetingNotesScope): void {
  abortMeetingNotesScopeRequests(scope);
  const keys = [
    meetingNoteQueryKeys.scope(scope.userId, scope.companyId),
    meetingNoteAiSettingsQueryKey(scope.userId, scope.companyId),
  ];
  for (const queryKey of keys) {
    void queryClient.cancelQueries({ queryKey });
    queryClient.removeQueries({ queryKey });
  }
  // Scoped mutations carry the scope as their mutationKey prefix.
  const mutationCache = queryClient.getMutationCache();
  for (const mutation of mutationCache.findAll({ mutationKey: meetingNoteQueryKeys.scope(scope.userId, scope.companyId) })) {
    mutationCache.remove(mutation);
  }
}

export function useMeetingNotesScopeLifecycle(): void {
  const queryClient = useQueryClient();
  const scope = useMeetingNotesScope();
  const previous = useRef<MeetingNotesScope | null>(null);

  useEffect(() => {
    const before = previous.current;
    if (before && (!scope || meetingNotesScopeKey(before) !== meetingNotesScopeKey(scope))) {
      // Retire first: from here on no callback of the old scope applies.
      setCurrentMeetingNotesScope(null);
      retireMeetingNotesScope(queryClient, before);
    }
    previous.current = scope;
    setCurrentMeetingNotesScope(scope);
  }, [queryClient, scope]);
}
