// src/components/messaging/FeedJumpStatus.tsx
'use client';

import { useEffect, useRef } from 'react';
import { AlertCircle, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FeedJumpStatusProps {
  isLoading: boolean;
  isUnavailable: boolean;
  onDismiss: () => void;
}

/**
 * Overlay at the top of the feed while a starred message is being opened
 * (Phase 4 FR-022): a loading indicator while older history loads, or a
 * notice when the message can no longer be reached. The feed underneath
 * stays as it is.
 */
export function FeedJumpStatus({ isLoading, isUnavailable, onDismiss }: FeedJumpStatusProps) {
  const noticeRef = useRef<HTMLDivElement | null>(null);

  // The control that started the jump (in the starred view) is gone; move
  // focus to the notice so keyboard and screen-reader users land on it.
  useEffect(() => {
    if (isUnavailable) noticeRef.current?.focus();
  }, [isUnavailable]);

  if (isLoading) {
    return (
      <div className="pointer-events-none absolute inset-x-0 top-2 z-10 flex justify-center px-4">
        <div
          role="status"
          className="flex items-center gap-2 rounded-full border bg-background/95 px-3 py-1 text-xs text-muted-foreground shadow-sm"
          data-testid="feed-jump-loading"
        >
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          Carregando mensagens anteriores…
        </div>
      </div>
    );
  }

  if (isUnavailable) {
    return (
      <div className="absolute inset-x-0 top-2 z-10 px-3">
        <div
          ref={noticeRef}
          role="alert"
          tabIndex={-1}
          className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:border-amber-500/40 dark:bg-amber-950 dark:text-amber-100"
          data-testid="feed-jump-notice"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1">
            Não foi possível mostrar esta mensagem. Ela pode ter sido apagada ou você não tem mais acesso a
            ela nesta conversa.
          </p>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6 shrink-0"
            aria-label="Fechar aviso"
            onClick={onDismiss}
          >
            <X className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
