// src/components/meeting-notes/MeetingNoteAiNotice.tsx
// The provider notice shown before processing (Phase 6 FR-015, FR-023): which
// provider and model receive the transcript text, today's usage with the
// reset time in the viewer's local time, and "Process". When the company has
// reached its limit, Process is disabled and the limit message is shown.
// Shown again (with a banner) when the AI settings changed or the notice
// expired; the user must confirm again.
'use client';

import { Info, Loader2, Sparkles } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { describeMeetingNoteAiLimit } from '@/lib/meeting-notes/ai/client-flow-errors';
import { formatMeetingNoteTimestamp } from '@/lib/meeting-notes/format';
import type { MeetingNoteAiNoticeBanner } from '@/hooks/ui/useMeetingNoteAiFlow';
import type { MeetingNoteAiTicketResponse } from '@/types/meeting-notes';

export interface MeetingNoteAiNoticeProps {
  ticket: MeetingNoteAiTicketResponse;
  providerLabel: string;
  modelLabel: string;
  banner: MeetingNoteAiNoticeBanner | null;
  onProcess: () => void;
  onCancel: () => void;
}

function bannerText(banner: MeetingNoteAiNoticeBanner): string {
  if (banner.kind === 'expired') return 'The previous notice expired. Review it again before processing.';
  return banner.providerLabel
    ? `The AI settings changed: the provider is now ${banner.providerLabel}. Review the new notice before processing.`
    : 'The AI settings changed. Review the new notice before processing.';
}

export function MeetingNoteAiNotice({ ticket, providerLabel, modelLabel, banner, onProcess, onCancel }: MeetingNoteAiNoticeProps) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { usage } = ticket;
  const limitReached = usage.limitReached || usage.used >= usage.limit;

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div
      className="flex flex-col gap-3 rounded-lg border border-[var(--vo-line-soft)] bg-muted/30 p-4"
      role="region"
      aria-labelledby={headingId}
      data-testid="meeting-note-ai-notice"
      data-provider={ticket.provider}
      data-reset-at={usage.resetAt}
    >
      {banner ? (
        <p
          className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
          role="alert"
          data-testid="meeting-note-ai-notice-banner"
        >
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {bannerText(banner)}
        </p>
      ) : null}
      <h4 id={headingId} ref={headingRef} tabIndex={-1} className="text-sm font-semibold outline-none">
        Before processing
      </h4>
      <p className="text-sm" data-testid="meeting-note-ai-notice-provider">
        The transcript text of this note will be sent to <strong>{providerLabel}</strong> (model {modelLabel}) to
        draft a summary and action items. Nothing in the note changes until you review and apply the draft.
      </p>
      <p className="text-xs text-muted-foreground" data-testid="meeting-note-ai-notice-usage">
        AI processings today: {usage.used} of {usage.limit}. The count resets at {formatMeetingNoteTimestamp(usage.resetAt)}.
      </p>
      {limitReached ? (
        <p className="text-sm text-destructive" role="alert" data-testid="meeting-note-ai-limit">
          {describeMeetingNoteAiLimit(usage.limit, usage.resetAt)}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          className="gap-1.5"
          disabled={limitReached}
          onClick={onProcess}
          data-testid="meeting-note-ai-process"
        >
          <Sparkles className="size-4" aria-hidden="true" />
          Process
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} data-testid="meeting-note-ai-notice-cancel">
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** Shown while the notice (ticket) is being prepared. */
export function MeetingNoteAiNoticeLoading() {
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status" data-testid="meeting-note-ai-preparing">
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      Preparing the AI notice…
    </p>
  );
}
