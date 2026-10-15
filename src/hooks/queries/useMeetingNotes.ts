// src/hooks/queries/useMeetingNotes.ts
// Meeting-note read queries (Phase 6 FR-003, FR-004, FR-026). Every key starts
// with the viewer's application users.id and company id, so a cached page of
// one account or company is never shown to another.
'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useCompany } from '@/contexts/CompanyContext';
import {
  fetchMeetingNoteSearch,
  fetchSpaceMeetingNotes,
  shouldRetryMeetingNotesRequest,
  type MeetingNoteSearchParams,
} from '@/lib/meeting-notes/client-api';
import type { MeetingNotesScope } from '@/lib/meeting-notes/scope-fence';

/** Prefix of every meeting-note query; mutations invalidate below it. */
export const MEETING_NOTES_QUERY_KEY = ['meeting-notes'] as const;

export const meetingNoteQueryKeys = {
  /** Everything one viewer has cached for one company. */
  scope: (userId: string, companyId: string) => [...MEETING_NOTES_QUERY_KEY, userId, companyId] as const,
  /** A space's Notes tab. */
  space: (userId: string, companyId: string, spaceId: string) =>
    [...meetingNoteQueryKeys.scope(userId, companyId), 'space', spaceId] as const,
  /** Every search / list on the Meetings page. */
  searches: (userId: string, companyId: string) =>
    [...meetingNoteQueryKeys.scope(userId, companyId), 'search'] as const,
  search: (userId: string, companyId: string, params: MeetingNoteSearchParams) =>
    [
      ...meetingNoteQueryKeys.searches(userId, companyId),
      {
        q: params.q,
        spaceId: params.spaceId,
        spaceRemoved: params.spaceRemoved,
        from: params.from,
        to: params.to,
      },
    ] as const,
  /** Everything cached for one note (view, transcript, history). */
  noteRoot: (userId: string, companyId: string, noteId: string) =>
    [...meetingNoteQueryKeys.scope(userId, companyId), 'note', noteId] as const,
  /** A note's view (without the transcript text). */
  note: (userId: string, companyId: string, noteId: string) =>
    [...meetingNoteQueryKeys.noteRoot(userId, companyId, noteId), 'detail'] as const,
  /** A note's view with the stored transcript text. */
  noteTranscript: (userId: string, companyId: string, noteId: string) =>
    [...meetingNoteQueryKeys.noteRoot(userId, companyId, noteId), 'transcript'] as const,
  /** A note's version list. */
  versions: (userId: string, companyId: string, noteId: string) =>
    [...meetingNoteQueryKeys.noteRoot(userId, companyId, noteId), 'versions'] as const,
  /** One immutable version. */
  version: (userId: string, companyId: string, noteId: string, versionId: string) =>
    [...meetingNoteQueryKeys.versions(userId, companyId, noteId), versionId] as const,
};

/**
 * The signed-in viewer's application user id and company id; null until both
 * are known. The object keeps its identity while both ids stay the same.
 */
export function useMeetingNotesScope(): MeetingNotesScope | null {
  const { company, currentUserProfile } = useCompany();
  const userId = currentUserProfile?.id;
  const companyId = company?.id;
  return useMemo(() => (userId && companyId ? { userId, companyId } : null), [userId, companyId]);
}

/** A space's notes, newest meeting date first, paged by the route's offset cursor. */
export function useSpaceMeetingNotes(spaceId: string) {
  const scope = useMeetingNotesScope();
  return useInfiniteQuery({
    queryKey: meetingNoteQueryKeys.space(scope?.userId ?? '', scope?.companyId ?? '', spaceId),
    enabled: scope !== null && spaceId.length > 0,
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => fetchSpaceMeetingNotes(spaceId, pageParam, signal),
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor ?? undefined : undefined),
    staleTime: 30_000,
    retry: shouldRetryMeetingNotesRequest,
  });
}

/**
 * Company notes for the Meetings page: ranked search when `params.q` is set,
 * otherwise every note within the filters by meeting date. Callers debounce
 * `params.q` (the route allows 120 requests per minute per user) and pass
 * `enabled: false` while the filters are invalid.
 */
export function useMeetingNoteSearch(params: MeetingNoteSearchParams, enabled = true) {
  const scope = useMeetingNotesScope();
  const userId = scope?.userId ?? '';
  const companyId = scope?.companyId ?? '';
  return useInfiniteQuery({
    queryKey: meetingNoteQueryKeys.search(userId, companyId, params),
    enabled: enabled && scope !== null,
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => fetchMeetingNoteSearch(params, pageParam, signal),
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor ?? undefined : undefined),
    // While new filters load, keep the previous results of the SAME viewer and
    // company on screen (shown as stale); never another account's results.
    placeholderData: (previous, previousQuery) => {
      const key = previousQuery?.queryKey;
      return key && key[1] === userId && key[2] === companyId && userId !== '' ? previous : undefined;
    },
    staleTime: 30_000,
    retry: shouldRetryMeetingNotesRequest,
  });
}
