'use client';

import React from 'react';
import { Conversation } from '@/types/messaging'; // Assuming Conversation type exists
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getAvatarUrl, getUserInitials } from '@/lib/avatar-utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface ConversationListProps {
  conversations: Conversation[];
  selectedConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  isLoading?: boolean;
}

export const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  selectedConversationId,
  onSelectConversation,
  isLoading = false,
}) => {
  // TODO: Fetch actual conversation data including participants, last message etc.

  if (isLoading) {
    return <div className="p-4 text-center text-muted-foreground">Loading conversations...</div>;
  }

  if (conversations.length === 0) {
    return <div className="p-4 text-center text-muted-foreground">No conversations yet.</div>;
  }

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-1 p-2">
        {conversations.map((conv) => {
          // Placeholder data - replace with actual participant/last message info
          const participantName = `User ${conv.id.substring(0, 4)}`; 
          const lastMessage = "Placeholder last message...";
          const lastMessageTime = "10m"; // Placeholder time
          const isSelected = conv.id === selectedConversationId;

          return (
            <button
              key={conv.id}
              onClick={() => onSelectConversation(conv.id)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent",
                isSelected ? "bg-accent font-semibold" : "text-muted-foreground"
              )}
            >
              <Avatar className="h-9 w-9">
                {/* Placeholder avatar */}
                <AvatarImage src={getAvatarUrl({ name: participantName })} alt={participantName} />
                <AvatarFallback>{getUserInitials(participantName)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 overflow-hidden">
                <p className="truncate text-sm font-medium text-foreground">{participantName}</p>
                <p className="truncate text-xs text-muted-foreground">{lastMessage}</p>
              </div>
              <span className="text-xs text-muted-foreground">{lastMessageTime}</span>
              {/* TODO: Add unread count indicator */}
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
};
