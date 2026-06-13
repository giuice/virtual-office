'use client';

import React, { useMemo, useState } from 'react';
import { Conversation, ConversationType } from '@/types/messaging';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useCompany } from '@/contexts/CompanyContext';
import { Pin, Hash, MessageSquare, Loader2 } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { useMessaging } from '@/contexts/messaging/MessagingContext';
import { ConversationListItem } from './ConversationListItem';

interface ConversationListProps {
  conversations: Conversation[];
  selectedConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  isLoading?: boolean;
  isRefreshing?: boolean;
  hasLoadedConversations?: boolean;
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

  const renderConversation = (conv: Conversation) => {
    return (
      <ConversationListItem
        key={conv.id}
        conversation={conv}
        viewerId={viewerId}
        companyUsers={companyUsers}
        selected={conv.id === selectedConversationId}
        openMenu={openMenuId === conv.id}
        onOpenMenuChange={(open) => setOpenMenuId(open ? conv.id : null)}
        onSelect={onSelectConversation}
        onPin={(conversationId) => pinConversation?.(conversationId) ?? Promise.resolve()}
        onUnpin={(conversationId) => unpinConversation?.(conversationId) ?? Promise.resolve()}
        onArchive={async (conversationId) => {
          await archiveConversation(conversationId);
          await refreshConversations();
        }}
        onUnarchive={async (conversationId) => {
          await unarchiveConversation(conversationId);
          await refreshConversations();
        }}
      />
    );
  };

  // Loading state
  const hasConversations = groupedConversations.pinned.length > 0 ||
                          groupedConversations.direct.length > 0 ||
                          groupedConversations.rooms.length > 0;

  const showInitialLoading = isLoading && !hasLoadedConversations;

  if (showInitialLoading) {
    return <div className="p-4 text-center text-muted-foreground">Loading conversations…</div>;
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
          <Loader2 className="size-3 animate-spin" />
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
                    <Pin className="size-3" />
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
                    <MessageSquare className="size-3" />
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
                    <Hash className="size-3" />
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
