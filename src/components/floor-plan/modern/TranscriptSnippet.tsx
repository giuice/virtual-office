// src/components/floor-plan/modern/TranscriptSnippet.tsx
// Story 3.11 - AC5: Transcript Snippet
'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { format, isToday, formatDistanceToNow } from 'date-fns';
import { MessageSquare } from 'lucide-react';

/**
 * Story 3.11 - AC5: Transcript Snippet
 * - Shows last transcript snippet (latest message or meeting note)
 * - Preview text truncated to 2-3 lines with ellipsis
 * - Timestamp and speaker attribution
 */
export interface TranscriptSnippetProps {
  text: string;
  speaker: string;
  timestamp: Date;
  className?: string;
}

/**
 * Format timestamp for display
 */
function formatTimestamp(date: Date): string {
  if (isToday(date)) {
    return format(date, 'HH:mm');
  }
  return formatDistanceToNow(date, { addSuffix: true });
}

export const TranscriptSnippet: React.FC<TranscriptSnippetProps> = ({
  text,
  speaker,
  timestamp,
  className,
}) => {
  if (!text) {
    return null;
  }

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {/* Header */}
      <div className="flex items-center gap-1.5">
        <MessageSquare className="w-3 h-3 text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
          Latest
        </span>
      </div>

      {/* Transcript content */}
      <div 
        className={cn(
          'p-2 rounded-lg',
          'bg-[var(--vo-log-bg)]',
          'border-l-2 border-[var(--vo-accent)]'
        )}
      >
        {/* Speaker and timestamp */}
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-semibold text-foreground">
            {speaker}
          </span>
          <span className="text-[10px] font-mono text-muted-foreground">
            {formatTimestamp(timestamp)}
          </span>
        </div>

        {/* Transcript text - truncated to 3 lines (AC5) */}
        <p 
          className={cn(
            'text-xs text-muted-foreground',
            'font-mono leading-relaxed',
            'line-clamp-3'
          )}
        >
          &ldquo;{text}&rdquo;
        </p>
      </div>
    </div>
  );
};

export default TranscriptSnippet;
