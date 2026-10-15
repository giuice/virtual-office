// src/components/meeting-notes/MeetingsBrowser.tsx
// The Meetings page body (FR-004, FR-026, FR-028): every note of the company,
// newest meeting first when the search box is empty, ranked results with
// excerpts otherwise; space and meeting-date filters; "Load more" paging.
'use client';

import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useCompany } from '@/contexts/CompanyContext';
import { useMeetingNoteSearch } from '@/hooks/queries/useMeetingNotes';
import { useDebouncedValue } from '@/hooks/ui/use-debounced-value';
import { MeetingNotesApiError, type MeetingNoteSearchParams } from '@/lib/meeting-notes/client-api';
import { resolveMeetingPeriod } from '@/lib/meeting-notes/period';
import { MeetingNoteResultItem } from './MeetingNoteResultItem';
import {
  MeetingNotesFilters,
  SPACE_FILTER_ALL,
  SPACE_FILTER_REMOVED,
  type MeetingNotesFilterValues,
} from './MeetingNotesFilters';

/** Typing pause before a search request (the route allows 120 requests/min/user). */
const SEARCH_DEBOUNCE_MS = 350;

const INITIAL_FILTERS: MeetingNotesFilterValues = {
  query: '',
  space: SPACE_FILTER_ALL,
  fromDay: '',
  toDay: '',
};

const PERIOD_ERRORS = {
  'invalid-day': 'Enter valid dates for the period.',
  'from-after-to': 'The start date must be on or before the end date.',
} as const;

function describeError(error: unknown): string {
  if (error instanceof MeetingNotesApiError) {
    if (error.status === 429) return 'Too many searches in a short time. Wait a moment and try again.';
    if (error.status === 400) return 'This search could not be run. Check the search words and filters.';
    if (error.status === 401) return 'Your session has ended. Sign in again to see meeting notes.';
    if (error.status === 403) return 'You do not have access to meeting notes.';
  }
  return 'Meeting notes could not be loaded.';
}

export function MeetingsBrowser() {
  const { spaces } = useCompany();
  const [filters, setFilters] = useState<MeetingNotesFilterValues>(INITIAL_FILTERS);
  const debouncedQuery = useDebouncedValue(filters.query.trim(), SEARCH_DEBOUNCE_MS);

  const sortedSpaces = useMemo(
    () => [...spaces].map(({ id, name }) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    [spaces]
  );
  const spaceNames = useMemo(() => new Map(spaces.map((space) => [space.id, space.name])), [spaces]);

  const period = resolveMeetingPeriod(filters.fromDay, filters.toDay);
  const params: MeetingNoteSearchParams = {
    q: debouncedQuery,
    spaceId: filters.space !== SPACE_FILTER_ALL && filters.space !== SPACE_FILTER_REMOVED ? filters.space : null,
    spaceRemoved: filters.space === SPACE_FILTER_REMOVED,
    from: period.ok ? period.from : null,
    to: period.ok ? period.to : null,
  };
  const results = useMeetingNoteSearch(params, period.ok);

  const items = results.data?.pages.flatMap((page) => page.items) ?? [];
  const totalCount = results.data?.pages[0]?.totalCount ?? null;
  const isSearching = debouncedQuery.length > 0;
  const isStale = results.isPlaceholderData || filters.query.trim() !== debouncedQuery;

  return (
    <div className="space-y-6">
      <MeetingNotesFilters
        values={filters}
        spaces={sortedSpaces}
        periodError={period.ok ? null : PERIOD_ERRORS[period.reason]}
        onChange={setFilters}
      />

      <section aria-labelledby="meeting-notes-results-heading" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="meeting-notes-results-heading" className="text-lg font-semibold">
            {isSearching ? 'Search results' : 'All meeting notes'}
          </h2>
          <p className="text-sm text-muted-foreground" aria-live="polite" data-testid="meeting-notes-count">
            {results.isSuccess && totalCount !== null
              ? `${totalCount} ${totalCount === 1 ? 'note' : 'notes'}`
              : null}
          </p>
        </div>

        {!period.ok ? null : results.isPending ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Loading meeting notes…
          </p>
        ) : results.isError && items.length === 0 ? (
          <div className="rounded-xl border border-[var(--vo-line-soft)] p-4 text-sm" role="alert">
            <p className="text-muted-foreground">{describeError(results.error)}</p>
            <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => void results.refetch()}>
              Try again
            </Button>
          </div>
        ) : items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--vo-line-soft)] p-6 text-center text-sm text-muted-foreground">
            {isSearching ? 'No notes match this search.' : 'No meeting notes yet.'}
          </p>
        ) : (
          <ul
            className={`flex flex-col gap-3 transition-opacity ${isStale ? 'opacity-60' : ''}`}
            aria-busy={isStale || undefined}
            data-testid="meeting-notes-results"
          >
            {items.map((note) => (
              <MeetingNoteResultItem key={note.id} note={note} spaceNames={spaceNames} />
            ))}
          </ul>
        )}

        {results.isError && items.length > 0 ? (
          <p className="text-sm text-destructive" role="alert">{describeError(results.error)}</p>
        ) : null}

        {period.ok && results.hasNextPage ? (
          <div className="flex justify-center">
            <Button
              type="button"
              variant="outline"
              disabled={results.isFetchingNextPage}
              onClick={() => void results.fetchNextPage()}
            >
              {results.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
