// src/components/meeting-notes/MeetingNoteConflictDialog.tsx
// Conflict warning (FR-007, AC-005): someone else changed the note first.
// Shows the newer state the route returned and, for a rejected save, the
// user's own unsaved text so it can be copied — nothing is overwritten and
// nothing is dropped silently. The user decides when to load the newer version.
'use client';

import { Check, Copy } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { MeetingNoteFieldsPayload } from '@/lib/meeting-notes/client-api';
import { formatMeetingDate } from '@/lib/meeting-notes/format';
import { meetingNoteHtmlToText } from '@/lib/meeting-notes/html-text';
import type { MeetingNoteDetail } from '@/types/meeting-notes';
import { MeetingNoteContent } from './MeetingNoteContent';

export interface MeetingNoteConflictDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The note as it is now (from the 409 response). */
  newer: MeetingNoteDetail;
  /** What the user tried to save; null for a restore or delete. */
  mine: MeetingNoteFieldsPayload | null;
  /** Replace the form with the newer version (save conflicts only). */
  onLoadNewer?: () => void;
}

export function MeetingNoteConflictDialog({ open, onOpenChange, newer, mine, onLoadNewer }: MeetingNoteConflictDialogProps) {
  const [copied, setCopied] = useState(false);
  const mineText = useMemo(
    () => (mine ? `${mine.title}\n\n${meetingNoteHtmlToText(mine.content)}`.trim() : ''),
    [mine]
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(mineText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" data-testid="meeting-note-conflict-dialog">
        <DialogHeader>
          <DialogTitle>This note was changed by someone else</DialogTitle>
          <DialogDescription>
            {mine
              ? 'Your changes were not saved. Review the newer version below; your text is kept here so you can copy it.'
              : 'Nothing was changed. The newer version is shown below.'}
          </DialogDescription>
        </DialogHeader>

        <section aria-labelledby="meeting-note-conflict-newer" className="flex flex-col gap-2 rounded-lg border p-3" data-testid="meeting-note-conflict-newer">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="meeting-note-conflict-newer" className="text-sm font-semibold">
              Newer version
            </h3>
            <Badge variant="outline">Revision {newer.revision}</Badge>
          </div>
          <p className="break-words font-medium" data-testid="meeting-note-conflict-newer-title">
            {newer.title}
          </p>
          <p className="text-xs text-muted-foreground">
            <time dateTime={newer.meetingDate}>{formatMeetingDate(newer.meetingDate)}</time>
            {newer.participants.length > 0 ? (
              <>
                <span aria-hidden="true"> · </span>
                {newer.participants
                  .map((participant) =>
                    participant.isCurrentMember ? participant.displayName : `${participant.displayName} (Former member)`
                  )
                  .join(', ')}
              </>
            ) : null}
          </p>
          <div className="max-h-48 overflow-y-auto rounded-md bg-muted/40 p-2">
            <MeetingNoteContent html={newer.content} testId="meeting-note-conflict-newer-content" />
          </div>
        </section>

        {mine ? (
          <section aria-labelledby="meeting-note-conflict-mine" className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <h3 id="meeting-note-conflict-mine" className="text-sm font-semibold">
                Your unsaved changes
              </h3>
              <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => void copy()}>
                {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
                {copied ? 'Copied' : 'Copy my text'}
              </Button>
            </div>
            <textarea
              readOnly
              aria-labelledby="meeting-note-conflict-mine"
              className="min-h-28 w-full resize-y rounded-md border border-input bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={mineText}
              data-testid="meeting-note-conflict-mine"
            />
          </section>
        ) : null}

        <DialogFooter className="gap-2">
          {mine && onLoadNewer ? (
            <>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Keep editing my copy
              </Button>
              <Button type="button" onClick={onLoadNewer}>
                Load newer version
              </Button>
            </>
          ) : (
            <Button type="button" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
