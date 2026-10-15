// src/components/meeting-notes/MeetingNotesFilters.tsx
// Search box, space filter, and meeting-date period of the Meetings page.
'use client';

import { Search } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MEETING_NOTE_SEARCH_LIMITS } from '@/lib/meeting-notes/validation';

/** Space filter value meaning "notes whose space was deleted". */
export const SPACE_FILTER_REMOVED = '__removed__';
/** Space filter value meaning "every space". */
export const SPACE_FILTER_ALL = '';

export interface MeetingNotesFilterValues {
  query: string;
  /** SPACE_FILTER_ALL, SPACE_FILTER_REMOVED, or a space id. */
  space: string;
  /** 'YYYY-MM-DD' or ''. */
  fromDay: string;
  /** 'YYYY-MM-DD' or ''. */
  toDay: string;
}

export interface MeetingNotesFiltersProps {
  values: MeetingNotesFilterValues;
  spaces: ReadonlyArray<{ id: string; name: string }>;
  periodError: string | null;
  onChange: (values: MeetingNotesFilterValues) => void;
}

const selectClassName =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

export function MeetingNotesFilters({ values, spaces, periodError, onChange }: MeetingNotesFiltersProps) {
  const set = (patch: Partial<MeetingNotesFilterValues>) => onChange({ ...values, ...patch });

  return (
    <form
      role="search"
      aria-label="Search meeting notes"
      className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]"
      onSubmit={(event) => event.preventDefault()}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="meeting-notes-query">Search notes</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            id="meeting-notes-query"
            type="search"
            value={values.query}
            maxLength={MEETING_NOTE_SEARCH_LIMITS.queryMaxChars}
            placeholder="Words in titles, notes, summaries, action items"
            className="pl-9"
            autoComplete="off"
            onChange={(event) => set({ query: event.target.value })}
          />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="meeting-notes-space">Space</Label>
        <select
          id="meeting-notes-space"
          className={selectClassName}
          value={values.space}
          onChange={(event) => set({ space: event.target.value })}
        >
          <option value={SPACE_FILTER_ALL}>All spaces</option>
          {spaces.map((space) => (
            <option key={space.id} value={space.id}>
              {space.name}
            </option>
          ))}
          <option value={SPACE_FILTER_REMOVED}>Space removed</option>
        </select>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="meeting-notes-from">Meeting from</Label>
        <Input
          id="meeting-notes-from"
          type="date"
          value={values.fromDay}
          max={values.toDay || undefined}
          aria-invalid={periodError ? true : undefined}
          aria-describedby={periodError ? 'meeting-notes-period-error' : undefined}
          onChange={(event) => set({ fromDay: event.target.value })}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="meeting-notes-to">Meeting to</Label>
        <Input
          id="meeting-notes-to"
          type="date"
          value={values.toDay}
          min={values.fromDay || undefined}
          aria-invalid={periodError ? true : undefined}
          aria-describedby={periodError ? 'meeting-notes-period-error' : undefined}
          onChange={(event) => set({ toDay: event.target.value })}
        />
      </div>

      {periodError ? (
        <p id="meeting-notes-period-error" className="text-sm text-destructive md:col-span-4" role="alert">
          {periodError}
        </p>
      ) : null}
    </form>
  );
}
