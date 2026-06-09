'use client';

import { Conversation, ConversationType } from '@/types/messaging';
import type { User } from '@/types/database';
import { EnhancedAvatarV2 } from '@/components/ui/enhanced-avatar-v2';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Pin, Hash, MessageSquare, MoreHorizontal } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

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

interface ConversationListItemProps {
  conversation: Conversation;
  viewerId: string | null;
  companyUsers: User[];
  selected: boolean;
  openMenu: boolean;
  onOpenMenuChange: (open: boolean) => void;
  onSelect: (conversationId: string) => void;
  onPin: (conversationId: string) => Promise<void>;
  onUnpin: (conversationId: string) => Promise<void>;
  onArchive: (conversationId: string) => Promise<void>;
  onUnarchive: (conversationId: string) => Promise<void>;
}

export function ConversationListItem({
  conversation,
  viewerId,
  companyUsers,
  selected,
  openMenu,
  onOpenMenuChange,
  onSelect,
  onPin,
  onUnpin,
  onArchive,
  onUnarchive,
}: ConversationListItemProps) {
  const unreadCount = viewerId ? conversation.unreadCount?.[viewerId] || 0 : 0;
  const isPinned = conversation.preferences?.isPinned ?? false;
  const isStarred = conversation.preferences?.isStarred ?? false;

  let displayName = conversation.name || 'Unnamed';
  let avatarUser: User | null = null;
  let conversationIcon = null;

  if (conversation.type === ConversationType.DIRECT) {
    const otherUserId = conversation.participants.find((id) => id !== viewerId) ?? conversation.participants[0];
    const otherUser = companyUsers.find((user) => user.id === otherUserId);

    if (otherUser) {
      displayName = otherUser.displayName || otherUser.email || 'Unknown User';
      avatarUser = otherUser;
    } else {
      displayName = 'Unknown User';
    }
    conversationIcon = <MessageSquare className="size-3.5" />;
  } else if (conversation.type === ConversationType.ROOM) {
    conversationIcon = <Hash className="size-3.5" />;
  }

  const lastActivityTime = formatRelativeTime(conversation.lastActivity);

  return (
    <div
      data-testid={`conversation-item-${conversation.id}`}
      data-pinned={isPinned ? 'true' : 'false'}
      data-archived={conversation.isArchived ? 'true' : 'false'}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onOpenMenuChange(true);
      }}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent w-full',
        selected ? 'bg-accent' : ''
      )}
    >
      <div className="relative flex-shrink-0" data-avatar-interactive>
        {avatarUser ? (
          <EnhancedAvatarV2 user={avatarUser} size="sm" display={{ status: true }} status={avatarUser.status} />
        ) : (
          <div className="size-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
            {conversationIcon}
          </div>
        )}

        {isStarred && (
          <div className="absolute -top-0.5 -left-0.5 size-2.5 rounded-full bg-amber-500 border border-background" />
        )}
      </div>

      <button
        type="button"
        aria-current={selected ? 'true' : undefined}
        onClick={() => onSelect(conversation.id)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span className="flex-1 overflow-hidden min-w-0">
          <span className="flex items-center gap-1.5">
            {isPinned && (
              <span data-testid="pin-indicator">
                <Pin className="size-3 text-muted-foreground flex-shrink-0" />
              </span>
            )}
            <span className={cn(
              'truncate text-sm',
              selected ? 'font-semibold text-foreground' : 'font-medium text-foreground',
              unreadCount > 0 && !selected && 'font-semibold'
            )}>
              {displayName}
            </span>
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {conversation.type === ConversationType.ROOM ? `${conversation.participants.length} members` : 'Direct message'}
          </span>
        </span>

        <span className="flex items-center gap-1 flex-shrink-0">
          <span className="text-xs text-muted-foreground">{lastActivityTime}</span>
          {unreadCount > 0 && (
            <Badge variant="default" className="h-5 min-w-[1.25rem] px-1.5 text-xs font-semibold">
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </span>
      </button>

      <DropdownMenu open={openMenu} onOpenChange={onOpenMenuChange}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Conversation actions"
            className="p-1 rounded hover:bg-accent"
            data-testid="conversation-menu-trigger"
            data-avatar-interactive
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => {
              event.stopPropagation();
              event.preventDefault();
            }}
          >
            <MoreHorizontal className="size-4 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          data-avatar-interactive
        >
          {isPinned ? (
            <DropdownMenuItem
              onClick={async (event) => {
                event.preventDefault();
                event.stopPropagation();
                await onUnpin(conversation.id);
              }}
              data-testid="conversation-action-unpin"
            >
              Unpin
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onClick={async (event) => {
                event.preventDefault();
                event.stopPropagation();
                await onPin(conversation.id);
              }}
              data-testid="conversation-action-pin"
            >
              Pin
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          {conversation.isArchived ? (
            <DropdownMenuItem
              onClick={async (event) => {
                event.preventDefault();
                event.stopPropagation();
                await onUnarchive(conversation.id);
              }}
              data-testid="conversation-action-unarchive"
            >
              Unarchive
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onClick={async (event) => {
                event.preventDefault();
                event.stopPropagation();
                await onArchive(conversation.id);
              }}
              data-testid="conversation-action-archive"
            >
              Archive
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
