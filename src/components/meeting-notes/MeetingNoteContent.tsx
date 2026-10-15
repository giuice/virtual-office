// src/components/meeting-notes/MeetingNoteContent.tsx
// Renders stored meeting-note rich text (FR-002, AC-003). The HTML is passed
// through the same allow-list sanitizer the routes use on write before it
// reaches the DOM, so a script, event handler, or unsafe link that reached
// the database by any path still never runs. Checklist boxes are read-only.
'use client';

import { useMemo } from 'react';

import { sanitizeMeetingNoteHtmlForDisplay } from '@/lib/meeting-notes/content-sanitizer';
import { cn } from '@/lib/utils';
import styles from './meeting-note-content.module.css';

export interface MeetingNoteContentProps {
  html: string;
  className?: string;
  emptyText?: string;
  testId?: string;
}

export function MeetingNoteContent({
  html,
  className,
  emptyText = 'No content.',
  testId = 'meeting-note-content',
}: MeetingNoteContentProps) {
  const safeHtml = useMemo(() => sanitizeMeetingNoteHtmlForDisplay(html), [html]);

  if (safeHtml.trim() === '') {
    return (
      <p className={cn('text-sm italic text-muted-foreground', className)} data-testid={testId}>
        {emptyText}
      </p>
    );
  }

  return (
    <div
      className={cn(styles.content, className)}
      data-testid={testId}
      // Sanitized just above with the meeting-note allow-list.
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  );
}
