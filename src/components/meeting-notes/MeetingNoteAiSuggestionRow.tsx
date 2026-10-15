// src/components/meeting-notes/MeetingNoteAiSuggestionRow.tsx
// One suggested action item of the AI draft under review (Phase 6 FR-017,
// FR-018, AC-010, AC-027): accept checkbox (a suggestion that repeats an
// existing item arrives unchecked, marked "Already exists"), editable
// description (1–1,000 characters), assignee from the current members
// (pre-filled only when the suggested name resolved to exactly one member;
// otherwise unassigned with the suggested name as a hint), optional due date
// (calendar date, never converted through Date), and Reject / Undo. AI text
// is rendered as text only.
'use client';

import { Undo2, X } from 'lucide-react';
import { useId } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { codePointLength, MEETING_NOTE_LIMITS } from '@/lib/meeting-notes/validation';
import type { MeetingNoteAiEditableSuggestion } from '@/hooks/ui/useMeetingNoteAiFlow';
import type { User } from '@/types/database';
import { MeetingNoteActionItemAssigneeSelect } from './MeetingNoteActionItemAssigneeSelect';

export interface MeetingNoteAiSuggestionRowProps {
  suggestion: MeetingNoteAiEditableSuggestion;
  index: number;
  members: readonly User[];
  disabled: boolean;
  onChange: (next: MeetingNoteAiEditableSuggestion) => void;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function preview(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed || 'empty suggestion';
}

/** Whether an accepted suggestion can be applied as written. */
export function isMeetingNoteAiSuggestionValid(suggestion: MeetingNoteAiEditableSuggestion): boolean {
  const length = codePointLength(suggestion.description.trim());
  return (
    length >= 1 &&
    length <= MEETING_NOTE_LIMITS.itemDescriptionMaxChars &&
    (suggestion.dueDate === '' || DATE_ONLY.test(suggestion.dueDate))
  );
}

export function MeetingNoteAiSuggestionRow({ suggestion, index, members, disabled, onChange }: MeetingNoteAiSuggestionRowProps) {
  const ids = { description: useId(), descriptionError: useId(), assignee: useId(), hint: useId(), dueDate: useId() };
  const number = index + 1;
  const length = codePointLength(suggestion.description.trim());
  const descriptionInvalid = length < 1 || length > MEETING_NOTE_LIMITS.itemDescriptionMaxChars;
  const duplicate = suggestion.duplicateOfItemId !== null;
  const state = suggestion.rejected ? 'rejected' : suggestion.accepted ? 'accepted' : 'unchecked';
  const unmatchedName =
    suggestion.suggestedAssigneeName !== null && suggestion.resolvedAssignee === null ? suggestion.suggestedAssigneeName : null;
  const storedAssignee = suggestion.resolvedAssignee
    ? { id: suggestion.resolvedAssignee.userId, name: suggestion.resolvedAssignee.displayName, isFormerMember: false }
    : null;

  if (suggestion.rejected) {
    return (
      <li
        className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-[var(--vo-line-soft)] px-3 py-2"
        data-testid="meeting-note-ai-suggestion"
        data-state={state}
        data-duplicate={duplicate ? 'true' : 'false'}
      >
        <p className="min-w-0 truncate text-sm text-muted-foreground line-through">{suggestion.description}</p>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 shrink-0 gap-1.5"
          disabled={disabled}
          aria-label={`Undo reject of suggestion ${number}: ${preview(suggestion.description)}`}
          onClick={() => onChange({ ...suggestion, rejected: false })}
          data-testid="meeting-note-ai-suggestion-undo"
        >
          <Undo2 className="size-3.5" aria-hidden="true" />
          Undo
        </Button>
      </li>
    );
  }

  return (
    <li
      className={cn(
        'flex flex-col gap-3 rounded-lg border border-[var(--vo-line-soft)] p-3',
        !suggestion.accepted && 'bg-muted/30'
      )}
      data-testid="meeting-note-ai-suggestion"
      data-state={state}
      data-duplicate={duplicate ? 'true' : 'false'}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={suggestion.accepted}
            disabled={disabled}
            onChange={(event) => onChange({ ...suggestion, accepted: event.target.checked })}
            aria-label={`Accept suggestion ${number}: ${preview(suggestion.description)}`}
            data-testid="meeting-note-ai-suggestion-accept"
          />
          Accept
        </label>
        <div className="flex items-center gap-2">
          {duplicate ? (
            <Badge variant="outline" className="text-[11px]" data-testid="meeting-note-ai-suggestion-duplicate">
              Already exists
            </Badge>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 text-muted-foreground"
            disabled={disabled}
            aria-label={`Reject suggestion ${number}: ${preview(suggestion.description)}`}
            onClick={() => onChange({ ...suggestion, rejected: true })}
            data-testid="meeting-note-ai-suggestion-reject"
          >
            <X className="size-3.5" aria-hidden="true" />
            Reject
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.description}>Description</Label>
        <Textarea
          id={ids.description}
          value={suggestion.description}
          rows={2}
          disabled={disabled}
          aria-invalid={descriptionInvalid ? 'true' : 'false'}
          aria-describedby={descriptionInvalid ? ids.descriptionError : undefined}
          onChange={(event) => onChange({ ...suggestion, description: event.target.value })}
          data-testid="meeting-note-ai-suggestion-description"
        />
        {descriptionInvalid ? (
          <p id={ids.descriptionError} className="text-xs text-destructive" role="alert">
            Enter a description of 1 to {MEETING_NOTE_LIMITS.itemDescriptionMaxChars.toLocaleString('en-US')} characters.
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5" data-testid="meeting-note-ai-suggestion-assignee">
          <Label htmlFor={ids.assignee}>Assignee</Label>
          <MeetingNoteActionItemAssigneeSelect
            id={ids.assignee}
            value={suggestion.assigneeId}
            members={members}
            storedAssignee={storedAssignee}
            disabled={disabled}
            describedById={unmatchedName ? ids.hint : undefined}
            onChange={(assigneeId) => onChange({ ...suggestion, assigneeId })}
          />
          {unmatchedName ? (
            <p id={ids.hint} className="text-xs text-muted-foreground" data-testid="meeting-note-ai-suggestion-hint">
              Suggested: <span>{unmatchedName}</span> (not matched to one member)
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.dueDate}>Due date</Label>
          <Input
            id={ids.dueDate}
            type="date"
            className="h-9"
            value={suggestion.dueDate}
            disabled={disabled}
            onChange={(event) => onChange({ ...suggestion, dueDate: event.target.value })}
            data-testid="meeting-note-ai-suggestion-due-date"
          />
        </div>
      </div>
    </li>
  );
}
