// src/components/messaging/EnhancedMessageFeed.tsx
'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Message } from '@/types/messaging';
import { MessageItem } from './message-item';
import { TypingIndicator } from './TypingIndicator';
import { useConversationPresence } from '@/hooks/useConversationPresence';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCompany } from '@/contexts/CompanyContext';
import type { User } from '@/types/database';

interface EnhancedMessageFeedProps {
  messages: Message[];
  conversationId: string | null;
  onReply?: (message: Message) => void;
  onReaction?: (messageId: string, emoji: string) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loading?: boolean;
  className?: string;
}

export function EnhancedMessageFeed({
  messages,
  conversationId,
  onReply,
  onReaction,
  onLoadMore,
  hasMore = false,
  loading = false,
  className
}: EnhancedMessageFeedProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { companyUsers, currentUserProfile } = useCompany();
  
  // Use conversation presence for typing indicators
  const { typingUsers, presentUsers } = useConversationPresence(conversationId);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const participantsById = useMemo(() => {
    const entries: Array<[string, User]> = companyUsers.map((user) => [user.id, user]);
    if (currentUserProfile) {
      entries.push([currentUserProfile.id, currentUserProfile]);
    }
    return new Map<string, User>(entries);
  }, [companyUsers, currentUserProfile]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Present users indicator (optional) */}
      {presentUsers.length > 0 && (
        <div className="px-4 py-2 border-b bg-muted/20">
          <div className="text-xs text-muted-foreground">
            {presentUsers.length} user{presentUsers.length !== 1 ? 's' : ''} online
          </div>
        </div>
      )}

      {/* Messages area */}
      <ScrollArea ref={scrollAreaRef} className="flex-1">
        <div className="space-y-1">
          {/* Load more button */}
          {hasMore && (
            <div className="flex justify-center p-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={onLoadMore}
                disabled={loading}
              >
                {loading ? 'Loading...' : 'Load more messages'}
              </Button>
            </div>
          )}

          {/* Messages list */}
          {messages.map((message) => (
            <MessageItem
              key={message.id}
              message={message}
              sender={participantsById.get(message.senderId) ?? null}
              onReply={onReply}
              onReaction={onReaction}
            />
          ))}

          {/* Typing indicator */}
          <TypingIndicator typingUsers={typingUsers} />

          {/* Scroll anchor */}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Scroll to bottom button */}
      <div className="relative">
        <Button
          variant="ghost"
          size="icon"
          className="absolute -top-12 right-4 rounded-full shadow-lg"
          onClick={scrollToBottom}
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
