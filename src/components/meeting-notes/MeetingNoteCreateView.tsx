// src/components/meeting-notes/MeetingNoteCreateView.tsx
// /meetings/new?spaceId=<id> (FR-001, J1): a new note in a space of the
// caller's company; after saving, the note's view opens. The route rejects a
// space of another company (MEETING_NOTE_SPACE_NOT_FOUND). "New note from
// transcript" (FR-012) is offered here too.
'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useCompany } from '@/contexts/CompanyContext';
import { useCreateMeetingNote } from '@/hooks/mutations/useMeetingNoteMutations';
import { MEETINGS_PATH, meetingNotePath } from '@/lib/meeting-notes/ui-paths';
import { MeetingNoteForm, type MeetingNoteFormInitialValues } from './MeetingNoteForm';
import { MeetingNoteTranscriptUpload } from './MeetingNoteTranscriptUpload';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EMPTY_NOTE: MeetingNoteFormInitialValues = { title: '', meetingDate: null, participants: [], content: '' };

export function MeetingNoteCreateView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const spaceId = searchParams.get('spaceId') ?? '';
  const { spaces, isLoading } = useCompany();
  const create = useCreateMeetingNote();

  const space = spaces.find((candidate) => candidate.id === spaceId) ?? null;
  const back = (
    <Button asChild variant="ghost" size="sm" className="-ml-2 h-8 w-fit gap-1.5">
      <Link href={MEETINGS_PATH}>
        <ArrowLeft className="size-4" aria-hidden="true" />
        Meetings
      </Link>
    </Button>
  );

  if (!UUID.test(spaceId) || (!isLoading && !space)) {
    return (
      <div className="flex max-w-3xl flex-col gap-4">
        {back}
        <div className="rounded-xl border border-[var(--vo-line-soft)] bg-card p-6" role="alert">
          <p className="font-medium">Choose a space first.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            A meeting note belongs to a space. Open a space on the floor plan, go to its Notes tab, and choose
            &quot;New note&quot;.
          </p>
        </div>
      </div>
    );
  }

  if (!space) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Loading…
      </p>
    );
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      {back}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-[var(--vo-line-soft)] px-4 py-3">
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">
          Have a transcript (.txt, .vtt, .srt)? Create the note from it and let AI draft the summary.
        </p>
        <MeetingNoteTranscriptUpload mode="create" spaceId={space.id} spaceName={space.name} />
      </div>
      <div className="rounded-xl border border-[var(--vo-line-soft)] bg-card p-6">
        <MeetingNoteForm
          initial={EMPTY_NOTE}
          submitLabel="Save note"
          submitting={create.isPending}
          submitError={create.error}
          header={
            <p className="text-sm text-muted-foreground">
              Space: <span className="font-medium text-foreground" data-testid="meeting-note-form-space">{space.name}</span>
            </p>
          }
          onCancel={() => (window.history.length > 1 ? router.back() : router.push(MEETINGS_PATH))}
          onSubmit={(fields) =>
            create.mutate(
              { spaceId, fields },
              { onSuccess: (note) => router.replace(meetingNotePath(note.id)) }
            )
          }
        />
      </div>
    </div>
  );
}
