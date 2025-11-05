'use client';

import React, { useMemo, useState, useCallback } from 'react';
import { Conversation, ConversationType } from '@/types/messaging';
import { EnhancedAvatarV2 } from '@/components/ui/enhanced-avatar-v2';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useCompany } from '@/contexts/CompanyContext';
import { cn } from '@/lib/utils';
import { Pin, Hash, MessageSquare, MoreHorizontal, Loader2 } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useMessaging } from '@/contexts/messaging/MessagingContext';
import { messagingApi } from '@/lib/messaging-api';

interface ConversationListProps {
  conversations: Conversation[];
  selectedConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  isLoading?: boolean;
  isRefreshing?: boolean;
  hasLoadedConversations?: boolean;
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
  isRefreshing = false,
  hasLoadedConversations = false,
}) => {
  const { currentUserProfile, companyUsers } = useCompany();
  const { archiveConversation, unarchiveConversation, refreshConversations, pinConversation, unpinConversation } = useMessaging();
  const viewerId = currentUserProfile?.id ?? null;

  // UI state
  const [activeTab, setActiveTab] = useState<'dms' | 'rooms' | 'all'>('all');
  const [pinnedOnly, setPinnedOnly] = useState<boolean>(false);
  const [showArchived, setShowArchived] = useState<boolean>(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Group conversations by pinned, DMs, and rooms
  const groupedConversations = useMemo(() => {
    const pinned: Conversation[] = [];
    const direct: Conversation[] = [];
    const rooms: Conversation[] = [];
    const archived: Conversation[] = [];

    conversations.forEach((conv) => {
      if (conv.isArchived) {
        archived.push(conv);
        return;
      }
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

    return { pinned, direct, rooms, archived };
  }, [conversations]);

  // Derived lists based on filters
  const filteredSections = useMemo(() => {
    if (showArchived) {
      return { archived: groupedConversations.archived };
    }

    const filterByTab = (list: Conversation[]) => {
      if (activeTab === 'dms') return list.filter(c => c.type === ConversationType.DIRECT);
      if (activeTab === 'rooms') return list.filter(c => c.type === ConversationType.ROOM || c.type === ConversationType.GROUP);
      return list;
    };

    if (pinnedOnly) {
      return {
        pinned: filterByTab(groupedConversations.pinned),
      } as any;
    }

    return {
      pinned: filterByTab(groupedConversations.pinned),
      direct: filterByTab(groupedConversations.direct),
      rooms: filterByTab(groupedConversations.rooms),
    } as any;
  }, [activeTab, pinnedOnly, showArchived, groupedConversations]);

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

    const handleItemClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
      const target = e.target as HTMLElement;
      // Guard: ignore clicks originating from interactive children (menus, avatars, buttons)
      if (
        target.closest('[data-avatar-interactive]') ||
        target.closest('a, [role="button"], [data-space-action]')
      ) {
        e.stopPropagation();
        return;
      }
      const nestedButton = target.closest('button');
      if (nestedButton && nestedButton !== e.currentTarget) {
        e.stopPropagation();
        return;
      }
      onSelectConversation(conv.id);
    };

    return (
      <button
        key={conv.id}
        data-testid={`conversation-item-${conv.id}`}
        data-pinned={isPinned ? 'true' : 'false'}
        data-archived={conv.isArchived ? 'true' : 'false'}
        onClick={handleItemClick}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpenMenuId(conv.id);
        }}
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
              <span data-testid="pin-indicator">
                <Pin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              </span>
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

        {/* Right side: time, unread badge, and menu */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-xs text-muted-foreground">{lastActivityTime}</span>
          {unreadCount > 0 && (
            <Badge variant="default" className="h-5 min-w-[1.25rem] px-1.5 text-xs font-semibold">
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}

          {/* Actions menu */}
          <DropdownMenu open={openMenuId === conv.id} onOpenChange={(open) => setOpenMenuId(open ? conv.id : null)}>
            <DropdownMenuTrigger asChild>
              <div
                role="button"
                aria-label="Conversation actions"
                className="p-1 rounded hover:bg-accent"
                data-testid="conversation-menu-trigger"
                data-avatar-interactive
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
              >
                <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              data-avatar-interactive
            >
              {isPinned ? (
                <DropdownMenuItem
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    await (unpinConversation?.(conv.id) ?? Promise.resolve());
                  }}
                  data-testid="conversation-action-unpin"
                >
                  Unpin
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    await (pinConversation?.(conv.id) ?? Promise.resolve());
                  }}
                  data-testid="conversation-action-pin"
                >
                  Pin
                </DropdownMenuItem>
              )}

              <DropdownMenuSeparator />

              {conv.isArchived ? (
                <DropdownMenuItem
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    await unarchiveConversation(conv.id);
                    await refreshConversations();
                  }}
                  data-testid="conversation-action-unarchive"
                >
                  Unarchive
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    await archiveConversation(conv.id);
                    await refreshConversations();
                  }}
                  data-testid="conversation-action-archive"
                >
                  Archive
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </button>
    );
  };

  // Loading state
  const hasConversations = groupedConversations.pinned.length > 0 ||
                          groupedConversations.direct.length > 0 ||
                          groupedConversations.rooms.length > 0;

  const showInitialLoading = isLoading && !hasLoadedConversations;

  if (showInitialLoading) {
    return <div className="p-4 text-center text-muted-foreground">Loading conversations...</div>;
  }

  // Empty state
  if (!hasConversations && hasLoadedConversations) {
    return <div className="p-4 text-center text-muted-foreground">No conversations yet.</div>;
  }

  return (
    <div className="h-full flex flex-col">
      {/* Controls */}
      <div className="px-2 py-1 flex items-center justify-between gap-2">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList>
            <TabsTrigger value="dms" data-testid="conversation-tab-dms">DMs</TabsTrigger>
            <TabsTrigger value="rooms" data-testid="conversation-tab-rooms">Rooms</TabsTrigger>
            <TabsTrigger value="all" data-testid="conversation-tab-all">All</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={pinnedOnly ? 'default' : 'outline'}
            onClick={() => setPinnedOnly((p) => !p)}
            data-testid="filter-pinned-toggle"
            aria-pressed={pinnedOnly}
            data-pinned-only={pinnedOnly ? 'true' : 'false'}
          >
            Pinned
          </Button>
          <Button
            type="button"
            size="sm"
            variant={showArchived ? 'default' : 'outline'}
            onClick={() => setShowArchived((s) => !s)}
            data-testid="show-archived-button"
            aria-pressed={showArchived}
            data-archived-visible={showArchived ? 'true' : 'false'}
          >
            Archived
          </Button>
        </div>
      </div>

      {isRefreshing && hasLoadedConversations && (
        <div
          className="px-3 py-1 text-xs text-muted-foreground flex items-center gap-1"
          data-testid="conversation-refresh-indicator"
        >
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Refreshing conversations…</span>
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-1 p-2">
          {/* Archived view */}
          {showArchived && (
            <div data-testid="archived-section">
              <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                Archived
              </div>
              <div className="flex flex-col gap-0.5">
                {filteredSections.archived && filteredSections.archived.length > 0 ? (
                  filteredSections.archived.map(renderConversation)
                ) : (
                  <div className="px-3 py-2 text-xs text-muted-foreground">No archived conversations</div>
                )}
              </div>
            </div>
          )}

          {!showArchived && (
            <>
              {/* Pinned conversations section */}
              {filteredSections.pinned && filteredSections.pinned.length > 0 && (
                <div className="mb-2">
                  <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Pin className="h-3 w-3" />
                    Pinned
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {filteredSections.pinned.map(renderConversation)}
                  </div>
                </div>
              )}

              {/* Direct messages section */}
              {filteredSections.direct && filteredSections.direct.length > 0 && (
                <div className="mb-2">
                  <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <MessageSquare className="h-3 w-3" />
                    Direct Messages
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {filteredSections.direct.map(renderConversation)}
                  </div>
                </div>
              )}

              {/* Rooms section */}
              {filteredSections.rooms && filteredSections.rooms.length > 0 && (
                <div className="mb-2">
                  <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Hash className="h-3 w-3" />
                    Rooms
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {filteredSections.rooms.map(renderConversation)}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
