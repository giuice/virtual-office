// src/components/messaging/MessageMentions.tsx
'use client';

import { Fragment } from 'react';
import { AtSign } from 'lucide-react';

import { segmentMentions, type MentionCandidate } from '@/lib/messaging/mentions';
import { cn } from '@/lib/utils';

export const MENTIONED_YOU_TEXT = 'Você foi mencionado';

/**
 * Phase 5 T17 (FR-026, AC-027): message text with its stored mentions styled
 * distinctly for every viewer — bold and underlined, so the cue does not rely
 * on colour (it also shows on the sender's own coloured bubble).
 */
export function MessageMentionText({
  text,
  mentions,
  className,
}: {
  text: string;
  mentions: readonly MentionCandidate[];
  className?: string;
}) {
  return (
    <p className={className}>
      {segmentMentions(text, mentions).map((segment, index) =>
        segment.mention ? (
          <span
            key={index}
            data-testid="message-mention"
            data-user-id={segment.mention.userId}
            className="rounded-sm bg-background/25 px-0.5 font-semibold underline decoration-2 underline-offset-2"
          >
            {segment.text}
          </span>
        ) : (
          <Fragment key={index}>{segment.text}</Fragment>
        )
      )}
    </p>
  );
}

/**
 * Phase 5 T17 (FR-026): shown only to a viewer the message mentions, with the
 * highlighted bubble — an icon and a text label, not colour alone.
 */
export function MentionedYouCue({ messageId, className }: { messageId: string; className?: string }) {
  return (
    <div
      className={cn('mb-1 flex items-center gap-1 text-xs font-semibold text-amber-800 dark:text-amber-300', className)}
      data-testid={`message-mentions-you-${messageId}`}
    >
      <AtSign className="size-3.5" aria-hidden="true" />
      <span>{MENTIONED_YOU_TEXT}</span>
    </div>
  );
}
