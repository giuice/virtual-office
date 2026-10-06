// src/components/messaging/StarredMessagesView.tsx
'use client';

import type { MouseEvent } from 'react';
import { CornerDownRight } from 'lucide-react';
import { format } from 'date-fns';
import type { Message } from '@/types/messaging';
import { isVoiceNoteAttachment } from '@/lib/messaging/attachment-policy';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { MessageItem } from './message-item';

interface StarredMessagesViewProps {
  /** The viewer's starred messages, newest message first. */
  messages: Message[];
  isLoading: boolean;
  isError: boolean;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
  /** Callback ref for the scrolling element (the read-receipt visibility root). */
  viewportRef: (node: HTMLDivElement | null) => (() => void) | undefined;
  onReply: (message: Message) => void;
  onReaction: (messageId: string, emoji: string) => void;
  onStar: (messageId: string) => void;
  onUnstar: (messageId: string) => void;
  /** Opens the message in the normal feed (FR-022). */
  onOpenInFeed: (messageId: string) => void;
}

/**
 * Clicks on a result open it in the feed, except those aimed at its own
 * controls, at portaled menus (their React events bubble here although they
 * are outside the result in the DOM), or that end a text selection.
 */
function isResultBodyClick(event: MouseEvent<HTMLElement>): boolean {
  const target = event.target;
  if (!(target instanceof Element) || !event.currentTarget.contains(target)) return false;
  if (
    target.closest(
      'a, button, input, textarea, select, [role="button"], [role="menuitem"], [data-avatar-interactive], [data-space-action]'
    )
  ) {
    return false;
  }
  const selection = typeof window !== 'undefined' ? window.getSelection() : null;
  return !selection || selection.isCollapsed;
}

const OPEN_IN_FEED_TEXT = 'Ver na conversa';
const RESULT_PREVIEW_MAX_LENGTH = 60;

/**
 * Accessible name of a result's "Ver na conversa" button: the visible text
 * followed by what the message is and when it was sent, so each button in
 * the list is distinguishable to screen-reader and voice-control users.
 */
function openInFeedLabel(message: Message): string {
  const text = message.content.trim().replace(/\s+/g, ' ');
  const firstAttachment = message.attachments?.[0];
  let preview = 'mensagem';
  if (text) {
    preview = text.length > RESULT_PREVIEW_MAX_LENGTH ? `${text.slice(0, RESULT_PREVIEW_MAX_LENGTH - 1)}…` : text;
  } else if (firstAttachment) {
    preview = isVoiceNoteAttachment(firstAttachment) ? 'nota de voz' : firstAttachment.name;
  }
  const sentAt = new Date(message.timestamp);
  const when = Number.isNaN(sentAt.getTime()) ? '' : `, ${format(sentAt, 'dd/MM HH:mm')}`;
  return `${OPEN_IN_FEED_TEXT}: ${preview}${when}`;
}

/**
 * "My starred messages in this conversation" (Phase 4 FR-021 / BR-009),
 * shown in place of the feed. Each result is a standalone message wrapper
 * keyed by message id (`data-starred-result-id`). A result opens the message
 * in the normal feed with its "Ver na conversa" button (keyboard) or a click
 * on the result itself.
 */
export function StarredMessagesView({
  messages,
  isLoading,
  isError,
  hasMore,
  isLoadingMore,
  onLoadMore,
  onRetry,
  viewportRef,
  onReply,
  onReaction,
  onStar,
  onUnstar,
  onOpenInFeed,
}: StarredMessagesViewProps) {
  if (isLoading) {
    return (
      <div className="space-y-4 p-4" data-testid="starred-messages-loading">
        <Skeleton className="h-12 w-3/4" />
        <Skeleton className="ml-auto h-12 w-1/2" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground" role="alert">
        <p>Não foi possível carregar as mensagens favoritas.</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full" viewportRef={viewportRef}>
      <section aria-label="Mensagens favoritas" data-testid="starred-messages-view" className="py-4">
        {messages.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground" data-testid="starred-messages-empty">
            Nenhuma mensagem favoritada nesta conversa
          </p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              data-message-id={message.id}
              data-starred-result-id={message.id}
              data-testid={`starred-result-${message.id}`}
              className="cursor-pointer hover:bg-muted/40"
              onClick={(event) => {
                if (isResultBodyClick(event)) onOpenInFeed(message.id);
              }}
            >
              <MessageItem
                message={message}
                onReply={onReply}
                onReaction={onReaction}
                onStar={onStar}
                onUnstar={onUnstar}
              />
              <div className="-mt-3 mb-3 flex justify-end px-4">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={() => onOpenInFeed(message.id)}
                  aria-label={openInFeedLabel(message)}
                  data-testid={`starred-open-${message.id}`}
                >
                  <CornerDownRight className="size-3.5" aria-hidden="true" />
                  {OPEN_IN_FEED_TEXT}
                </Button>
              </div>
            </div>
          ))
        )}

        {hasMore && (
          <div className="py-2 text-center">
            <Button variant="ghost" size="sm" onClick={onLoadMore} disabled={isLoadingMore}>
              Carregar mais favoritas
            </Button>
          </div>
        )}
      </section>
    </ScrollArea>
  );
}
