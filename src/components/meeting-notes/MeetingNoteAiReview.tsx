// src/components/meeting-notes/MeetingNoteAiReview.tsx
// Review of the transient AI draft (Phase 6 FR-016–FR-019, BR-006, AC-010,
// AC-027): edit the three summary sections, accept / edit / reassign /
// reject each suggested action item, then "Apply" (one version; the summary
// replaces the note's summary, accepted items are appended; existing items
// are never changed) or "Discard draft". Apply is checked by the route
// against the draft's source revision: when the note changed since (edited,
// or its transcript replaced) the draft cannot be applied and a reprocess is
// offered. Nothing here is stored before Apply; AI text is shown as text only.
'use client';

import { AlertTriangle, Check, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';

import { Button } from '@/components/ui/button';
import {
  meetingNoteAiApplyInput,
  type MeetingNoteAiEditableDraft,
  type MeetingNoteAiEditableSuggestion,
} from '@/hooks/ui/useMeetingNoteAiFlow';
import { codePointLength, MEETING_NOTE_AI_SUMMARY_LIMITS, MEETING_NOTE_LIMITS } from '@/lib/meeting-notes/validation';
import type { User } from '@/types/database';
import type { MeetingNoteAiDraftSummary } from '@/types/meeting-notes';
import { isMeetingNoteAiSuggestionValid, MeetingNoteAiSuggestionRow } from './MeetingNoteAiSuggestionRow';
import { MeetingNoteAiSummaryEditor } from './MeetingNoteAiSummaryEditor';

export interface MeetingNoteAiReviewProps {
  draft: MeetingNoteAiEditableDraft;
  /** The note's current revision and item count as last read. */
  noteRevision: number;
  existingItemCount: number;
  members: readonly User[];
  applying: boolean;
  applyError: string | null;
  conflict: boolean;
  onChange: (update: (draft: MeetingNoteAiEditableDraft) => MeetingNoteAiEditableDraft) => void;
  onApply: () => void;
  onDiscard: () => void;
  onReprocess: () => void;
}

const SECTIONS: ReadonlyArray<[keyof MeetingNoteAiDraftSummary, string]> = [
  ['keyPoints', 'Key points'],
  ['decisions', 'Decisions'],
  ['nextSteps', 'Next steps'],
];

function summaryValid(summary: MeetingNoteAiDraftSummary): boolean {
  return SECTIONS.every(([key]) => {
    const entries = summary[key];
    return (
      entries.length <= MEETING_NOTE_AI_SUMMARY_LIMITS.maxEntriesPerSection &&
      entries.every((entry) => codePointLength(entry) <= MEETING_NOTE_AI_SUMMARY_LIMITS.maxEntryChars)
    );
  });
}

export function MeetingNoteAiReview({
  draft,
  noteRevision,
  existingItemCount,
  members,
  applying,
  applyError,
  conflict,
  onChange,
  onApply,
  onDiscard,
  onReprocess,
}: MeetingNoteAiReviewProps) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const input = meetingNoteAiApplyInput(draft);
  const accepted = draft.items.filter((item) => item.accepted && !item.rejected);
  const keepsSummary = SECTIONS.every(([key]) => input.summary[key].length === 0);
  const itemsValid = accepted.every(isMeetingNoteAiSuggestionValid);
  const nothingToApply = keepsSummary && accepted.length === 0;
  // The cached note moved past the draft's source: the route will refuse Apply.
  const sourceChanged = conflict || noteRevision !== draft.sourceRevision;
  const overCapacity = existingItemCount + accepted.length > MEETING_NOTE_LIMITS.maxItemsPerNote;
  const canApply = !applying && !sourceChanged && !nothingToApply && itemsValid && summaryValid(draft.summary);

  const setSummary = (key: keyof MeetingNoteAiDraftSummary, entries: string[]) =>
    onChange((current) => ({ ...current, summary: { ...current.summary, [key]: entries } }));
  const setItem = (next: MeetingNoteAiEditableSuggestion) =>
    onChange((current) => ({
      ...current,
      items: current.items.map((item) => (item.key === next.key ? next : item)),
    }));

  return (
    <div
      className="flex flex-col gap-5 rounded-lg border border-[var(--vo-line-soft)] p-4"
      role="region"
      aria-labelledby={headingId}
      aria-busy={applying}
      data-testid="meeting-note-ai-review"
      data-source-revision={draft.sourceRevision}
    >
      <div className="flex flex-col gap-1">
        <h4 id={headingId} ref={headingRef} tabIndex={-1} className="text-sm font-semibold outline-none">
          Review the AI draft
        </h4>
        <p className="text-xs text-muted-foreground">
          Nothing is saved until you apply. The summary replaces the note&apos;s summary; accepted action items are
          added to the note. Existing action items are never changed.
          {draft.usage ? ` AI processings today: ${draft.usage.used} of ${draft.usage.limit}.` : ''}
        </p>
      </div>

      {sourceChanged ? (
        <div
          className="flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
          role="alert"
          data-testid="meeting-note-ai-conflict"
        >
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            The note changed since this draft was generated (it was edited or its transcript was replaced), so this
            draft can no longer be applied. Reprocess the current transcript to get a new draft.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" className="gap-1.5" onClick={onReprocess} data-testid="meeting-note-ai-reprocess">
              <RefreshCw className="size-4" aria-hidden="true" />
              Reprocess
            </Button>
          </div>
        </div>
      ) : null}

      <section className="flex flex-col gap-4" aria-label="Draft summary">
        <h5 className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Summary</h5>
        {SECTIONS.map(([key, title]) => (
          <MeetingNoteAiSummaryEditor
            key={key}
            section={key}
            title={title}
            entries={draft.summary[key]}
            disabled={applying}
            onChange={(entries) => setSummary(key, entries)}
          />
        ))}
        {keepsSummary ? (
          <p className="text-xs text-muted-foreground" data-testid="meeting-note-ai-keeps-summary">
            All summary sections are empty: the note&apos;s current summary will be kept.
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-3" aria-label="Suggested action items">
        <h5 className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Suggested action items ({accepted.length} of {draft.items.length} accepted)
        </h5>
        {draft.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No action items were suggested.</p>
        ) : (
          <ul className="flex flex-col gap-3" aria-label="Suggested action items">
            {draft.items.map((item, index) => (
              <MeetingNoteAiSuggestionRow
                key={item.key}
                suggestion={item}
                index={index}
                members={members}
                disabled={applying}
                onChange={setItem}
              />
            ))}
          </ul>
        )}
        {overCapacity ? (
          <p className="text-xs text-destructive" role="status" data-testid="meeting-note-ai-capacity">
            {MEETING_NOTE_LIMITS.maxItemsPerNote} items maximum: this note has {existingItemCount} action items, so
            accepting {accepted.length} would exceed the limit and nothing would be applied.
          </p>
        ) : null}
      </section>

      {applyError ? (
        <p className="text-sm text-destructive" role="alert" data-testid="meeting-note-ai-apply-error">
          {applyError}
        </p>
      ) : null}
      {nothingToApply && !sourceChanged ? (
        <p className="text-xs text-muted-foreground" role="status">
          Nothing to apply: keep a summary entry or accept at least one action item.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" className="gap-1.5" disabled={!canApply} onClick={onApply} data-testid="meeting-note-ai-apply">
          {applying ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
          {applying ? 'Applying…' : 'Apply'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="gap-1.5"
          disabled={applying}
          onClick={onDiscard}
          data-testid="meeting-note-ai-discard"
        >
          <Trash2 className="size-4" aria-hidden="true" />
          Discard draft
        </Button>
      </div>
    </div>
  );
}
