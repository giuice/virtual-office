// src/components/messaging/TypingIndicator.tsx
'use client';

import { cn } from '@/lib/utils';

interface TypingIndicatorProps {
  /** Display names of the typists, in arrival order. */
  typingUsers: string[];
  className?: string;
}

/** Phase 5 FR-018: 1 → "<Nome> está digitando…", 2 → "<A> e <B> estão digitando…", 3+ → "N pessoas estão digitando…". */
export function typingMessage(typingUsers: readonly string[]): string {
  if (typingUsers.length === 1) return `${typingUsers[0]} está digitando…`;
  if (typingUsers.length === 2) return `${typingUsers[0]} e ${typingUsers[1]} estão digitando…`;
  return `${typingUsers.length} pessoas estão digitando…`;
}

export function TypingIndicator({ typingUsers, className }: TypingIndicatorProps) {
  if (typingUsers.length === 0) return null;

  return (
    <div
      data-testid="typing-indicator"
      className={cn(
        "flex items-center px-4 py-2 text-sm text-muted-foreground italic",
        className
      )}
    >
      <div className="flex gap-x-1 mr-2" aria-hidden="true">
        {/* Animated typing dots */}
        <div className="size-2 bg-muted-foreground/40 rounded-full animate-pulse"></div>
        <div
          className="size-2 bg-muted-foreground/40 rounded-full animate-pulse"
          style={{ animationDelay: '0.2s' }}
        ></div>
        <div
          className="size-2 bg-muted-foreground/40 rounded-full animate-pulse"
          style={{ animationDelay: '0.4s' }}
        ></div>
      </div>
      <span>{typingMessage(typingUsers)}</span>
    </div>
  );
}
