'use client';

import React, { useMemo } from 'react';
import { Conversation, ConversationType } from '@/types/messaging';
import { EnhancedAvatarV2 } from '@/components/ui/enhanced-avatar-v2';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useCompany } from '@/contexts/CompanyContext';
import { cn } from '@/lib/utils';
import { Pin, Hash, MessageSquare } from 'lucide-react';

interface ConversationListProps {
  conversations: Conversation[];
  selectedConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  isLoading?: boolean;
}

// Helper to format relative time
function formatRelativeTime(date: Date | string): string {
  const now = Date.now();
  const then = typeof date === 'string' ? new Date(date).getTime() : date.getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;

  const diffWeeks = Math.floor(diffDays / 7);
  return `${diffWeeks}w`;
}

export const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  selectedConversationId,
  onSelectConversation,
  isLoading = false,
}) => {
  const { currentUserProfile, companyUsers } = useCompany();
  const viewerId = currentUserProfile?.id ?? null;

  // Group conversations by pinned, DMs, and rooms
  const groupedConversations = useMemo(() => {
    const pinned: Conversation[] = [];
    const direct: Conversation[] = [];
    const rooms: Conversation[] = [];

    conversations.forEach((conv) => {
      const isPinned = conv.preferences?.isPinned ?? false;

      if (isPinned) {
        pinned.push(conv);
        return;
      }

      if (conv.type === ConversationType.DIRECT) {
        direct.push(conv);
        return;
      }

      if (conv.type === ConversationType.ROOM || conv.type === ConversationType.GROUP) {
        rooms.push(conv);
        return;
      }

      // Fallback: treat unknown conversation types as rooms for listing purposes
      rooms.push(conv);
    });

    // Sort pinned by pinnedOrder (ascending), then by lastActivity
    pinned.sort((a, b) => {
      const aOrder = a.preferences?.pinnedOrder ?? Number.MAX_SAFE_INTEGER;
      const bOrder = b.preferences?.pinnedOrder ?? Number.MAX_SAFE_INTEGER;

      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }

      const aTime = new Date(a.lastActivity).getTime();
      const bTime = new Date(b.lastActivity).getTime();
      return bTime - aTime;
    });

    const sortByActivity = (a: Conversation, b: Conversation) => {
      const aTime = new Date(a.lastActivity).getTime();
      const bTime = new Date(b.lastActivity).getTime();
      return bTime - aTime;
    };

    direct.sort(sortByActivity);
    rooms.sort(sortByActivity);

    return { pinned, direct, rooms };
  }, [conversations]);

  // Render individual conversation item
  const renderConversation = (conv: Conversation) => {
    const isSelected = conv.id === selectedConversationId;
    const unreadCount = viewerId ? conv.unreadCount?.[viewerId] || 0 : 0;
    const isPinned = conv.preferences?.isPinned ?? false;
    const isStarred = conv.preferences?.isStarred ?? false;

    // Determine conversation display name and avatar
    let displayName = conv.name || 'Unnamed';
    let avatarUser = null;
    let conversationIcon = null;

    if (conv.type === ConversationType.DIRECT) {
      // For DMs, find the other participant
      const otherUserId = conv.participants.find((id) => id !== viewerId) ?? conv.participants[0];
      const otherUser = companyUsers.find((u) => u.id === otherUserId);

      if (otherUser) {
        displayName = otherUser.displayName;
        avatarUser = otherUser;
      } else {
        displayName = 'Unknown User';
      }
      conversationIcon = <MessageSquare className="h-3.5 w-3.5" />;
    } else if (conv.type === ConversationType.ROOM) {
      conversationIcon = <Hash className="h-3.5 w-3.5" />;
    }

    const lastActivityTime = formatRelativeTime(conv.lastActivity);

    return (
      <button
        key={conv.id}
        onClick={() => onSelectConversation(conv.id)}
        className={cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent w-full',
          isSelected ? 'bg-accent' : ''
        )}
      >
        {/* Avatar or icon */}
        <div className="relative flex-shrink-0" data-avatar-interactive>
          {avatarUser ? (
            <EnhancedAvatarV2
              user={avatarUser}
              size="sm"
              showStatus
              status={avatarUser.status}
            />
          ) : (
            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
              {conversationIcon}
            </div>
          )}

          {/* Star indicator (top-left badge) */}
          {isStarred && (
            <div className="absolute -top-0.5 -left-0.5 h-2.5 w-2.5 rounded-full bg-amber-500 border border-background" />
          )}
        </div>

        {/* Conversation details */}
        <div className="flex-1 overflow-hidden min-w-0">
          <div className="flex items-center gap-1.5">
            {isPinned && (
              <Pin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            )}
            <p className={cn(
              'truncate text-sm',
              isSelected ? 'font-semibold text-foreground' : 'font-medium text-foreground',
              unreadCount > 0 && !isSelected && 'font-semibold'
            )}>
              {displayName}
            </p>
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {conv.type === ConversationType.ROOM ? `${conv.participants.length} members` : 'Direct message'}
          </p>
        </div>

        {/* Right side: time and unread badge */}
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className="text-xs text-muted-foreground">{lastActivityTime}</span>
          {unreadCount > 0 && (
            <Badge variant="default" className="h-5 min-w-[1.25rem] px-1.5 text-xs font-semibold">
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </div>
      </button>
    );
  };

  // Loading state
  if (isLoading) {
    return <div className="p-4 text-center text-muted-foreground">Loading conversations...</div>;
  }

  // Empty state
  const hasConversations = groupedConversations.pinned.length > 0 ||
                          groupedConversations.direct.length > 0 ||
                          groupedConversations.rooms.length > 0;

  if (!hasConversations) {
    return <div className="p-4 text-center text-muted-foreground">No conversations yet.</div>;
  }

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-1 p-2">
        {/* Pinned conversations section */}
        {groupedConversations.pinned.length > 0 && (
          <div className="mb-2">
            <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Pin className="h-3 w-3" />
              Pinned
            </div>
            <div className="flex flex-col gap-0.5">
              {groupedConversations.pinned.map(renderConversation)}
            </div>
          </div>
        )}

        {/* Direct messages section */}
        {groupedConversations.direct.length > 0 && (
          <div className="mb-2">
            <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <MessageSquare className="h-3 w-3" />
              Direct Messages
            </div>
            <div className="flex flex-col gap-0.5">
              {groupedConversations.direct.map(renderConversation)}
            </div>
          </div>
        )}

        {/* Rooms section */}
        {groupedConversations.rooms.length > 0 && (
          <div className="mb-2">
            <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Hash className="h-3 w-3" />
              Rooms
            </div>
            <div className="flex flex-col gap-0.5">
              {groupedConversations.rooms.map(renderConversation)}
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
};
