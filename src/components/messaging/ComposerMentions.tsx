// src/components/messaging/ComposerMentions.tsx
'use client';

import { useEffect } from 'react';

import type { ComposerMentionList } from '@/hooks/ui/use-composer-mentions';
import type { MentionSegment } from '@/lib/messaging/mentions';
import { cn } from '@/lib/utils';

const MENTION_LIST_LABEL = 'Mencionar membro da conversa';

/**
 * Phase 5 T17 (FR-023, AC-037): the "@" list of the composer — a listbox
 * driven from the text field (aria-activedescendant), so focus never leaves
 * the field; options are also picked with the mouse.
 */
export function ComposerMentionListbox({ list }: { list: ComposerMentionList }) {
  const activeId = list.optionId(list.activeIndex);
  useEffect(() => {
    document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' });
  }, [activeId]);

  return (
    <div
      id={list.id}
      role="listbox"
      aria-label={MENTION_LIST_LABEL}
      data-testid="mention-listbox"
      className="absolute bottom-full left-0 z-20 mb-1 max-h-48 w-64 max-w-full overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
    >
      {list.options.map((option, index) => {
        const isActive = index === list.activeIndex;
        return (
          <div
            key={option.userId}
            id={list.optionId(index)}
            role="option"
            aria-selected={isActive}
            data-testid="mention-option"
            data-user-id={option.userId}
            className={cn(
              'cursor-pointer truncate rounded-sm px-2 py-1.5 text-sm',
              isActive && 'bg-accent text-accent-foreground'
            )}
            // Keeps the focus (and the caret) in the text field.
            onMouseDown={(event) => event.preventDefault()}
            onMouseMove={() => {
              if (!isActive) list.setActiveIndex(index);
            }}
            onClick={() => list.choose(option)}
          >
            {option.label}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Phase 5 T17: highlights the chosen mentions inside the composer. A copy of
 * the text with the same box metrics as the (transparent) textarea is drawn
 * behind it with the text itself invisible, so only the mention backgrounds
 * show through; it scrolls with the field.
 */
export function ComposerMentionHighlights({
  segments,
  className,
  ref,
}: {
  segments: readonly MentionSegment[];
  className?: string;
  ref?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={ref}
      aria-hidden="true"
      data-testid="composer-mention-highlights"
      className={cn(
        'pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words rounded-md border border-transparent px-3 py-2 text-base text-transparent md:text-sm',
        className
      )}
    >
      {segments.map((segment, index) =>
        segment.mention ? (
          <mark
            key={index}
            data-testid="composer-mention"
            data-user-id={segment.mention.userId}
            className="rounded-sm bg-primary/20 text-transparent"
          >
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        )
      )}
      {/* Keeps the height of a trailing line break. */}
      {'​'}
    </div>
  );
}
