// src/components/meeting-notes/MeetingNoteAiSummaryEditor.tsx
// One section of the AI draft summary (key points, decisions, or next steps;
// Phase 6 FR-016, FR-018) as an editable list: each entry is plain text in
// its own labelled textarea, removable; entries can be added. Limits mirror
// the Apply route (at most 100 entries, each at most 2,000 characters).
'use client';

import { Plus, X } from 'lucide-react';
import { useId } from 'react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { codePointLength, MEETING_NOTE_AI_SUMMARY_LIMITS } from '@/lib/meeting-notes/validation';

export interface MeetingNoteAiSummaryEditorProps {
  /** Section key, used in test ids. */
  section: 'keyPoints' | 'decisions' | 'nextSteps';
  title: string;
  entries: string[];
  disabled: boolean;
  onChange: (entries: string[]) => void;
}

export function MeetingNoteAiSummaryEditor({ section, title, entries, disabled, onChange }: MeetingNoteAiSummaryEditorProps) {
  const headingId = useId();
  const full = entries.length >= MEETING_NOTE_AI_SUMMARY_LIMITS.maxEntriesPerSection;

  return (
    <fieldset className="flex flex-col gap-2" aria-labelledby={headingId} data-testid={`meeting-note-ai-summary-${section}`}>
      <legend id={headingId} className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {title}
      </legend>
      {entries.length === 0 ? <p className="text-sm text-muted-foreground">No entries.</p> : null}
      <ol className="flex flex-col gap-2">
        {entries.map((entry, index) => {
          const tooLong = codePointLength(entry) > MEETING_NOTE_AI_SUMMARY_LIMITS.maxEntryChars;
          const label = `${title} ${index + 1}`;
          return (
            <li key={index} className="flex items-start gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Textarea
                  value={entry}
                  rows={2}
                  aria-label={label}
                  aria-invalid={tooLong ? 'true' : 'false'}
                  disabled={disabled}
                  onChange={(event) => onChange(entries.map((value, position) => (position === index ? event.target.value : value)))}
                  data-testid="meeting-note-ai-summary-entry"
                />
                {tooLong ? (
                  <p className="text-xs text-destructive" role="alert">
                    At most {MEETING_NOTE_AI_SUMMARY_LIMITS.maxEntryChars.toLocaleString('en-US')} characters.
                  </p>
                ) : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 text-muted-foreground"
                aria-label={`Remove ${label}`}
                disabled={disabled}
                onClick={() => onChange(entries.filter((_, position) => position !== index))}
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </li>
          );
        })}
      </ol>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 w-fit gap-1.5"
        disabled={disabled || full}
        onClick={() => onChange([...entries, ''])}
        aria-label={`Add an entry to ${title}`}
      >
        <Plus className="size-3.5" aria-hidden="true" />
        Add entry
      </Button>
    </fieldset>
  );
}
