// src/components/messaging/message-feed.tsx
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useMessaging } from '@/contexts/messaging/MessagingContext';
import { useAuth } from '@/contexts/AuthContext';
import { ConversationType, FileAttachment, Message } from '@/types/messaging';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { AlertCircle, Star } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { isMessageInFeedCache } from '@/lib/messaging/message-cache';
import { MessageItem } from './message-item';
import { MessageComposer } from './message-composer';
import { StarredMessagesView } from './StarredMessagesView';
import { FeedJumpStatus } from './FeedJumpStatus';
import { FeedScrollSnapshot } from './FeedScrollSnapshot';
import { TypingIndicator } from './TypingIndicator';
import { useConversationPresence } from '@/hooks/useConversationPresence';
import { useFeedScrollAnchor } from '@/hooks/ui/use-feed-scroll-anchor';
import { useFeedJump } from '@/hooks/ui/use-feed-jump';
import { useVisibleMessageReceipts } from '@/hooks/ui/use-visible-message-receipts';
import { useCompany } from '@/contexts/CompanyContext';
import { useMessageActions } from '@/hooks/useMessageActions';
import { starredMessagesQueryKey, useStarredMessages } from '@/hooks/queries/useStarredMessages';

interface MessageFeedProps {
  conversationId?: string;
  roomId?: string;
  roomName?: string;
  className?: string;
  maxHeight?: string;
}

export function MessageFeed({
  conversationId,
  roomId,
  roomName,
  className,
  maxHeight = '500px',
}: MessageFeedProps) {
  const { user } = useAuth();
  const {
    messages,
    loadingMessages,
    loadingMoreMessages,
    loadMoreMessagesFailed,
    errorMessages,
    hasMoreMessages,
    loadMoreMessages,
    loadHistoryUntilMessage,
    sendMessage,
    activeConversation,
    setActiveConversation,
    getOrCreateRoomConversation,
    addReaction,
    isDrawerOpen,
    isMinimized,
    activeView,
    markMessagesAsRead,
  } = useMessaging();
  const { currentUserProfile } = useCompany();
  const queryClient = useQueryClient();
  const activeConversationId = activeConversation?.id ?? null;
  const { starMessage, unstarMessage } = useMessageActions({ conversationId: activeConversationId ?? '' });

  // Typing indicators ride the conversation presence channel (audit B-02)
  const { typingUsers, notifyTyping, stopTyping } = useConversationPresence(
    activeConversation?.id ?? null
  );

  const [isLoading, setIsLoading] = useState(false);
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);
  const [expandedThreads, setExpandedThreads] = useState<Record<string, boolean>>({});

  // The starred view belongs to one conversation: switching conversations
  // returns to the normal feed without an extra effect.
  const [starredViewConversationId, setStarredViewConversationId] = useState<string | null>(null);
  const showStarred = !!activeConversationId && starredViewConversationId === activeConversationId;
  const starredQuery = useStarredMessages(activeConversationId, showStarred);
  const starredMessages = useMemo(
    () => starredQuery.data?.pages.flatMap((page) => page.messages) ?? [],
    [starredQuery.data]
  );
  const isStarredRendered = showStarred && !starredQuery.isPending && !starredQuery.isError;

  // Skeleton only for the first load; refetches and older pages keep the feed.
  const showSkeleton = isLoading || loadingMessages;
  // The feed's viewport is unmounted while the starred view is shown, so
  // returning to the feed starts at the newest message again.
  const isFeedRendered = !showSkeleton && !errorMessages && !!activeConversation && !showStarred;
  const { viewportRef, markOwnSend, scrollMessageIntoView, captureBeforeCommit } = useFeedScrollAnchor({
    conversationId: activeConversationId,
    messages,
    isFeedRendered,
  });

  // The scrolling element (feed or starred view; only one is mounted) is also
  // the visibility root for read receipts.
  const [viewportElement, setViewportElement] = useState<HTMLDivElement | null>(null);
  const attachReceiptViewport = useCallback((node: HTMLDivElement | null) => {
    setViewportElement(node);
    return () => {
      setViewportElement((current) => (current === node ? null : current));
    };
  }, []);
  const attachViewport = useCallback(
    (node: HTMLDivElement | null) => {
      const detachReceipts = attachReceiptViewport(node);
      const detachAnchor = viewportRef(node);
      return () => {
        detachAnchor?.();
        detachReceipts();
      };
    },
    [attachReceiptViewport, viewportRef]
  );

  // Only messages actually seen in the drawer's conversation view count as
  // read (BR-001). Starred results are messages of this conversation shown in
  // the same drawer view, so seeing one counts too; the per-conversation
  // "already reported" set is shared, so nothing is reported twice.
  useVisibleMessageReceipts({
    conversationId: activeConversationId,
    viewport: viewportElement,
    enabled:
      (showStarred ? isStarredRendered : isFeedRendered) &&
      isDrawerOpen &&
      !isMinimized &&
      activeView === 'conversation',
    messages: showStarred ? starredMessages : messages,
    currentUserId: currentUserProfile?.id ?? null,
    isDirectConversation: activeConversation?.type === ConversationType.DIRECT,
    submit: markMessagesAsRead,
  });

  const messageMap = useMemo(() => {
    const map = new Map<string, Message>();
    messages.forEach((message) => {
      map.set(message.id, message);
    });
    return map;
  }, [messages]);

  const repliesByParent = useMemo(() => {
    const grouped = new Map<string, Message[]>();
    messages.forEach((message) => {
      if (message.replyToId) {
        const list = grouped.get(message.replyToId) ?? [];
        list.push(message);
        grouped.set(message.replyToId, list);
      }
    });

    grouped.forEach((list) => {
      list.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    });

    return grouped;
  }, [messages]);

  const topLevelMessages = useMemo(() => {
    return messages.filter((message) => {
      if (!message.replyToId) {
        return true;
      }
      // If parent message is not currently loaded, treat as top-level so it remains visible
      return !messageMap.has(message.replyToId);
    });
  }, [messages, messageMap]);

  // A reply renders only inside its expanded parent thread(s).
  const revealMessage = useCallback((messageId: string) => {
    const ancestors: Record<string, boolean> = {};
    let parentId = messageMap.get(messageId)?.replyToId;
    while (parentId && messageMap.has(parentId) && !ancestors[parentId]) {
      ancestors[parentId] = true;
      parentId = messageMap.get(parentId)?.replyToId;
    }
    setExpandedThreads((prev) => ({ ...prev, ...ancestors }));
  }, [messageMap]);

  // Selecting a starred result opens it in the feed (FR-022).
  const isJumpTargetCached = useCallback(
    (messageId: string) =>
      !!activeConversationId && isMessageInFeedCache(queryClient, activeConversationId, messageId),
    [activeConversationId, queryClient]
  );
  const {
    jumpToMessage,
    cancelJump,
    isLoading: isJumpLoading,
    isUnavailable: isJumpUnavailable,
    dismissNotice: dismissJumpNotice,
    targetMessageId: jumpTargetId,
    highlightedMessageId,
  } = useFeedJump({
    conversationId: activeConversationId,
    isFeedRendered,
    messages,
    isMessageLoaded: isJumpTargetCached,
    loadHistoryUntilMessage,
    revealMessage,
    scrollMessageIntoView,
  });

  // Initialize / switch conversation when roomId changes
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      if (!roomId || !roomName) return;
      try {
        setIsLoading(true);
        const conversation = await getOrCreateRoomConversation(roomId, roomName);
        if (!cancelled) {
          setActiveConversation(conversation);
        }
      } catch (error) {
        console.error('Error initializing room conversation:', error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    init();
    return () => { cancelled = true; };
  }, [roomId, roomName, getOrCreateRoomConversation, setActiveConversation]);

  const effectiveExpandedThreads = useMemo(() => {
    const next: Record<string, boolean> = {};
    Object.entries(expandedThreads).forEach(([messageId, expanded]) => {
      if (expanded && repliesByParent.has(messageId) && (repliesByParent.get(messageId)?.length ?? 0) > 0) {
        next[messageId] = true;
      }
    });

    if (!replyToMessage) {
      return next;
    }
    const parentId = replyToMessage.replyToId && messageMap.has(replyToMessage.replyToId)
      ? replyToMessage.replyToId
      : replyToMessage.id;
    next[parentId] = true;
    return next;
  }, [expandedThreads, messageMap, repliesByParent, replyToMessage]);

  // Handle sending a message. Failures propagate to the composer, which keeps
  // the draft with an error and retry; the reply target is only cleared on
  // success, so a retry replies to the same message.
  const handleSendMessage = useCallback(async (
    content: string,
    { clientMessageId, attachments }: { clientMessageId: string; attachments: FileAttachment[] }
  ) => {
    if (!activeConversation) return;

    const replyToId = replyToMessage?.id;
    stopTyping();
    markOwnSend();
    await sendMessage(content, {
      replyToId,
      clientMessageId,
      attachments: attachments.length > 0 ? attachments : undefined,
    });
    // Keep a reply target the user picked while the send was in flight.
    setReplyToMessage((current) => (current?.id === replyToId ? null : current));
  }, [activeConversation, markOwnSend, replyToMessage?.id, sendMessage, stopTyping]);

  // Handle reply
  const handleReply = useCallback((message: Message) => {
    setReplyToMessage(message);
  }, []);

  // Handle reaction
  const handleReaction = useCallback((messageId: string, emoji: string) => {
    addReaction(messageId, emoji);
  }, [addReaction]);

  // Reactions update the feed cache optimistically; the starred list picks up
  // the saved state once the toggle has been stored.
  const handleStarredReaction = useCallback((messageId: string, emoji: string) => {
    if (!activeConversationId) return;
    void addReaction(messageId, emoji).then(
      () => queryClient.invalidateQueries({ queryKey: starredMessagesQueryKey(activeConversationId) }),
      // addReaction already reported the failure and rolled the feed back;
      // the starred list was never changed.
      () => undefined
    );
  }, [activeConversationId, addReaction, queryClient]);

  const toggleStarredView = useCallback(() => {
    cancelJump();
    setStarredViewConversationId((current) =>
      current === activeConversationId ? null : activeConversationId
    );
  }, [activeConversationId, cancelJump]);

  const openStarredInFeed = useCallback((messageId: string) => {
    setStarredViewConversationId(null);
    jumpToMessage(messageId);
  }, [jumpToMessage]);

  const toggleThread = useCallback((messageId: string) => {
    setExpandedThreads((prev) => ({
      ...prev,
      [messageId]: !prev[messageId],
    }));
  }, []);

  const renderMessageTree = useCallback((message: Message, depth = 0): React.ReactNode => {
    const replies = repliesByParent.get(message.id) ?? [];
    const replyCount = replies.length;
    const isExpanded = effectiveExpandedThreads[message.id] ?? false;
    const parentMessage = depth > 0 && message.replyToId ? messageMap.get(message.replyToId) ?? null : null;
    const isJumpTarget = message.id === jumpTargetId;
    const isHighlighted = message.id === highlightedMessageId;

    return (
      <div
        key={`${message.id}-${depth}`}
        data-message-id={message.id}
        data-thread-depth={depth}
        data-jump-highlighted={isHighlighted ? 'true' : undefined}
        tabIndex={isJumpTarget ? -1 : undefined}
        className={cn(
          depth > 0 && 'mt-2',
          isJumpTarget && 'outline-none',
          isHighlighted &&
            'rounded-md bg-yellow-100/70 ring-2 ring-inset ring-yellow-400 transition-colors dark:bg-yellow-500/15'
        )}
      >
        <MessageItem
          message={message}
          onReply={handleReply}
          onReaction={handleReaction}
          replyCount={replyCount}
          onToggleThread={replyCount > 0 ? () => toggleThread(message.id) : undefined}
          isThreadExpanded={isExpanded}
          depth={depth}
          parentMessage={parentMessage}
          onStar={starMessage}
          onUnstar={unstarMessage}
        />
        {replyCount > 0 && isExpanded && (
          <div
            className="ml-6 border-l border-border/60 pl-4 space-y-2 pt-2"
            data-testid={`thread-panel-${message.id}`}
          >
            {replies.map((reply) => renderMessageTree(reply, depth + 1))}
          </div>
        )}
      </div>
    );
  }, [effectiveExpandedThreads, handleReaction, handleReply, repliesByParent, toggleThread, messageMap, starMessage, unstarMessage, jumpTargetId, highlightedMessageId]);

  // Render loading state
  if (showSkeleton) {
    return (
      <Card className={cn("w-full", className)}>
        <CardHeader>
          <CardTitle>
            <Skeleton className="h-6 w-40" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-12 w-3/4" />
            <Skeleton className="h-12 w-1/2 ml-auto" />
            <Skeleton className="h-12 w-2/3" />
          </div>
        </CardContent>
        <CardFooter>
          <Skeleton className="h-10 w-full" />
        </CardFooter>
      </Card>
    );
  }

  // Render error state
  if (errorMessages) {
    return (
      <Card className={cn("w-full", className)}>
        <CardContent className="p-6">
          <div className="text-center text-red-500">
            <AlertCircle className="size-8 mx-auto mb-2" />
            <p>Failed to load messages. Please try again.</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => window.location.reload()}
            >
              Reload
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Render empty state
  if (!activeConversation) {
    return (
      <Card className={cn("w-full", className)}>
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">
            <p>No conversation selected.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("size-full min-h-0 flex flex-col", className)} data-testid="messages-feed">
      {/* Legacy test hook for older specs */}
      <div data-testid="message-feed" className="sr-only" />
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="min-w-0 truncate">{activeConversation.name || 'Conversation'}</CardTitle>
        <Button
          type="button"
          variant={showStarred ? 'secondary' : 'ghost'}
          size="sm"
          className="h-7 shrink-0 gap-1 px-2 text-xs"
          aria-pressed={showStarred}
          title={showStarred ? 'Voltar para todas as mensagens' : 'Mostrar só as minhas mensagens favoritas'}
          onClick={toggleStarredView}
          data-testid="starred-filter-toggle"
        >
          <Star
            className={cn('size-3.5', showStarred && 'fill-yellow-400 text-yellow-400')}
            aria-hidden="true"
          />
          Favoritas
        </Button>
      </CardHeader>

      <CardContent className="relative flex-1 p-0 overflow-hidden min-h-0">
        {showStarred ? (
          <StarredMessagesView
            messages={starredMessages}
            isLoading={starredQuery.isPending}
            isError={starredQuery.isError}
            hasMore={starredQuery.hasNextPage}
            isLoadingMore={starredQuery.isFetchingNextPage}
            onLoadMore={() => void starredQuery.fetchNextPage()}
            onRetry={() => void starredQuery.refetch()}
            viewportRef={attachReceiptViewport}
            onReply={handleReply}
            onReaction={handleStarredReaction}
            onStar={starMessage}
            onUnstar={unstarMessage}
            onOpenInFeed={openStarredInFeed}
          />
        ) : (
          <>
            <FeedJumpStatus
              isLoading={isJumpLoading}
              isUnavailable={isJumpUnavailable}
              onDismiss={dismissJumpNotice}
            />
            <FeedScrollSnapshot messages={messages} onBeforeCommit={captureBeforeCommit} />
            <ScrollArea className="h-full" viewportRef={attachViewport}>
              {hasMoreMessages && (
                <div className="text-center py-2">
                  {loadMoreMessagesFailed && !loadingMoreMessages && (
                    <p
                      role="alert"
                      className="px-4 pb-1 text-xs text-destructive"
                      data-testid="load-more-error"
                    >
                      Não foi possível carregar mensagens anteriores. Tente de novo.
                    </p>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void loadMoreMessages()}
                    disabled={loadingMoreMessages}
                  >
                    Load more messages
                  </Button>
                </div>
              )}

              <div className="py-4">
                {topLevelMessages.length === 0 ? (
                  <div className="text-center text-muted-foreground p-4">
                    <p>No messages yet. Start the conversation!</p>
                  </div>
                ) : (
                  topLevelMessages.map((message) => renderMessageTree(message))
                )}
              </div>
            </ScrollArea>
          </>
        )}
      </CardContent>

      <CardFooter className="flex-col items-stretch gap-1 p-4 pt-2">
        <TypingIndicator typingUsers={typingUsers.map((t) => t.displayName)} />
        <MessageComposer
          onSendMessage={handleSendMessage}
          conversationId={activeConversationId}
          replyToMessage={replyToMessage}
          onCancelReply={() => setReplyToMessage(null)}
          initialValue={""}
          onValueChange={(value) => (value.trim() ? notifyTyping() : stopTyping())}
        />
      </CardFooter>
    </Card>
  );
}
