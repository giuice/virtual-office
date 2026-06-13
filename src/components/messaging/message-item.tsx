// src/components/messaging/message-item.tsx
'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { formatDistanceToNow } from 'date-fns';
import { Message, MessageStatus, MessageType } from '@/types/messaging';
import { usePresence } from '@/contexts/PresenceContext';
import { InteractiveUserAvatar } from '@/components/messaging/InteractiveUserAvatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CheckCheck, AlertCircle, File, Reply, MoreHorizontal, ChevronDown, Pin, Star } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useCompany } from '@/contexts/CompanyContext';
import { EnhancedAvatarV2 } from '@/components/ui/enhanced-avatar-v2';
import { AvatarUser } from '@/lib/avatar-utils';
import type { User } from '@/types/database';
import { EmojiPicker } from '@/components/messaging/EmojiPicker';
import { ReactionChips } from '@/components/messaging/ReactionChips';
// Format message timestamp
const formatMessageTime = (timestamp: Date) => {
  if (!timestamp) return '';
  return formatDistanceToNow(new Date(timestamp), {
    addSuffix: true
  });
};

// Get message status icon
// Get message status icon
const getMessageStatusIcon = (status: MessageStatus) => {
  switch (status) {
    case MessageStatus.SENT:
      return <CheckCheck className="size-4 text-gray-400" />;
    case MessageStatus.DELIVERED:
      return <CheckCheck className="size-4 text-blue-500" />;
    case MessageStatus.READ:
      return <CheckCheck className="size-4 text-green-500" />;
    case MessageStatus.FAILED:
      return <AlertCircle className="size-4 text-red-500" />;
    default:
      return null;
  }
};

// Render message content based on type

const containsTarget = (container: HTMLElement, target: EventTarget | null): boolean => {
  return target instanceof Node && container.contains(target);
};
const isInteractiveTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return Boolean(target.closest('[data-avatar-interactive]') || target.closest('a, button, [role="button"], [data-space-action]'));
};
const isDatabaseUser = (value: User | AvatarUser | null | undefined): value is User => {
  return !!value && typeof value === 'object' && 'supabase_uid' in value;
};

function MessageContent({
  message
}: {
  message: Message;
}) {
  switch (message.type) {
    case MessageType.TEXT:
      return <p className="whitespace-pre-wrap break-words">{message.content}</p>;
    case MessageType.IMAGE:
      return <div>
          <p className="mb-2">{message.content}</p>
          {message.attachments && message.attachments.length > 0 && <div className="rounded-md overflow-hidden">
              <Image src={message.attachments[0].url} alt={message.attachments[0].name} width={640} height={480} className="max-w-full h-auto" />
            </div>}
        </div>;
    case MessageType.FILE:
      return <div>
          <p className="mb-2">{message.content}</p>
          {message.attachments && message.attachments.length > 0 && <div className="flex items-center p-2 rounded-md bg-secondary">
              <File className="size-5 mr-2" />
              <a href={message.attachments[0].url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                {message.attachments[0].name}
              </a>
            </div>}
        </div>;
    case MessageType.SYSTEM:
      return <div className="text-center text-muted-foreground text-sm italic">
          {message.content}
        </div>;
    default:
      return <p>{message.content}</p>;
  }
}

function ReplyBadge({
  message,
  parentMessage
}: {
  message: Message;
  parentMessage?: Message | null;
}) {
  if (!message.replyToId) return null;
  const previewText = parentMessage?.content ?? 'Original message';
  return <div className="bg-secondary/50 p-2 rounded-t-md text-xs text-muted-foreground" data-testid={`reply-context-${message.id}`}>
      <div className="font-semibold mb-0.5">Replying to {parentMessage ? 'this thread' : 'a message'}</div>
      <div className="text-muted-foreground/80 truncate" title={previewText}>
        {previewText}
      </div>
    </div>;
}

function MessageReactions({
  message,
  currentUserId,
  onReaction
}: {
  message: Message;
  currentUserId?: string;
  onReaction?: (messageId: string, emoji: string) => void;
}) {
  if (!message.reactions || message.reactions.length === 0) return null;
  return <ReactionChips reactions={message.reactions} currentUserId={currentUserId} onReactionToggle={emoji => onReaction?.(message.id, emoji)} />;
}

function MessageActions({
  showActions,
  message,
  isPinned,
  isStarred,
  onReply,
  onReaction,
  onPin,
  onUnpin,
  onStar,
  onUnstar
}: {
  showActions: boolean;
  message: Message;
  isPinned: boolean;
  isStarred: boolean | undefined;
  onReply?: (message: Message) => void;
  onReaction?: (messageId: string, emoji: string) => void;
  onPin?: (messageId: string) => void;
  onUnpin?: (messageId: string) => void;
  onStar?: (messageId: string) => void;
  onUnstar?: (messageId: string) => void;
}) {
  if (!showActions) return null;
  return <div className="flex items-center gap-1 absolute -top-4 right-2 bg-background shadow rounded-md p-1" data-avatar-interactive>
      <Button variant="ghost" size="icon" className="size-7" onClick={e => {
      e.stopPropagation();
      onReply?.(message);
    }} data-avatar-interactive>
        <Reply className="size-4" />
      </Button>
      <EmojiPicker onEmojiSelect={emoji => onReaction?.(message.id, emoji)} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-7" data-avatar-interactive onClick={e => e.stopPropagation()}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onPointerDownOutside={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
          <DropdownMenuItem onSelect={e => {
          e.preventDefault();
          isPinned ? onUnpin?.(message.id) : onPin?.(message.id);
        }}>
            <Pin className={cn("mr-2 size-4", isPinned && "fill-current")} />
            {isPinned ? 'Unpin Message' : 'Pin Message'}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={e => {
          e.preventDefault();
          isStarred ? onUnstar?.(message.id) : onStar?.(message.id);
        }}>
            <Star className={cn("mr-2 size-4", isStarred && "fill-yellow-400 text-yellow-400")} />
            {isStarred ? 'Unstar Message' : 'Star Message'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>;
}

interface MessageItemProps {
  message: Message;
  sender?: User | AvatarUser | null;
  onReply?: (message: Message) => void;
  onReaction?: (messageId: string, emoji: string) => void;
  replyCount?: number;
  onToggleThread?: () => void;
  isThreadExpanded?: boolean;
  depth?: number;
  parentMessage?: Message | null;
  onPin?: (messageId: string) => void;
  onUnpin?: (messageId: string) => void;
  onStar?: (messageId: string) => void;
  onUnstar?: (messageId: string) => void;
}
export function MessageItem({
  message,
  sender,
  onReply,
  onReaction,
  replyCount = 0,
  onToggleThread,
  isThreadExpanded = false,
  depth = 0,
  parentMessage,
  onPin,
  onUnpin,
  onStar,
  onUnstar
}: MessageItemProps) {
  const {
    users
  } = usePresence();
  const {
    companyUsers,
    currentUserProfile
  } = useCompany();
  const [showActions, setShowActions] = useState(false);
  const showReplyIndicator = replyCount > 0;

  // Get sender presence information
  const senderPresence = users?.find(u => u.id === message.senderId);
  const resolvedUser = useMemo(() => {
    if (isDatabaseUser(sender)) {
      return sender;
    }
    if (message.senderId === currentUserProfile?.id && currentUserProfile) {
      return currentUserProfile;
    }
    return companyUsers.find(companyUser => companyUser.id === message.senderId) || null;
  }, [companyUsers, currentUserProfile, message.senderId, sender]);
  const fallbackAvatarUser: AvatarUser | null = useMemo(() => {
    if (resolvedUser) {
      return null;
    }
    if (sender && !isDatabaseUser(sender) && sender.displayName) {
      return sender;
    }
    if (!message.senderId) {
      return null;
    }
    return {
      id: message.senderId,
      displayName: `User ${message.senderId.slice(0, 4)}`
    };
  }, [message.senderId, resolvedUser, sender]);
  const isCurrentUser = message.senderId === currentUserProfile?.id;
  const showAvatar = !isCurrentUser;
  const fallbackDisplayName = fallbackAvatarUser?.displayName || (message.senderId ? `User ${message.senderId.slice(0, 4)}` : 'System');
  const interactiveUser = useMemo(() => {
    if (!resolvedUser) {
      return null;
    }
    return {
      ...resolvedUser,
      status: senderPresence?.status || resolvedUser.status,
      currentSpaceId: senderPresence?.currentSpaceId ?? resolvedUser.currentSpaceId
    } as User;
  }, [resolvedUser, senderPresence]);
  const isPinned = message.pins && message.pins.length > 0;
  const isStarred = message.stars && message.stars.some(s => s.userId === currentUserProfile?.id);

  const handleMouseEnter = () => {
    setShowActions(true);
  };
  const handleMouseLeave = (event: React.MouseEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget) {
      if (containsTarget(event.currentTarget, nextTarget)) {
        return;
      }
      if (isInteractiveTarget(nextTarget)) {
        return;
      }
    }
    if (typeof document !== 'undefined') {
      const activeElement = document.activeElement;
      if (activeElement && containsTarget(event.currentTarget, activeElement)) {
        return;
      }
      if (isInteractiveTarget(activeElement)) {
        return;
      }
    }
    setShowActions(false);
  };
  const handleFocusWithin = () => {
    setShowActions(true);
  };
  const hideActionsOnBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const related = event.relatedTarget as Node | null;
    if (related && containsTarget(event.currentTarget, related)) {
      return;
    }
    if (isInteractiveTarget(related)) {
      return;
    }
    setShowActions(false);
  };

  // If this is a system message, render it differently
  if (message.type === MessageType.SYSTEM) {
    return <div className="flex justify-center my-2 px-4">
        <div className="bg-secondary px-3 py-1 rounded-md text-sm text-muted-foreground italic">
          {message.content}
        </div>
      </div>;
  }
  return <div data-testid={`message-${message.id}`} className={cn('relative flex items-start mb-4 px-4 group', isCurrentUser ? 'justify-end' : 'justify-start')} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} onFocus={handleFocusWithin} onBlur={hideActionsOnBlur} data-thread-depth={depth}>
      {showAvatar && (interactiveUser ? <InteractiveUserAvatar user={interactiveUser} size="sm" className="mr-2" display={{ status: true }} /> : fallbackAvatarUser ? <EnhancedAvatarV2 user={fallbackAvatarUser} size="sm" className="mr-2" display={{ status: !!senderPresence?.status }} status={senderPresence?.status} /> : null)}

      <div className={cn("max-w-[80%]", isCurrentUser ? "order-1" : "order-2")}>
        {!isCurrentUser && <div className="text-xs text-muted-foreground mb-1">
            {resolvedUser?.displayName || fallbackDisplayName}
          </div>}

        <ReplyBadge message={message} parentMessage={parentMessage} />

        <div className={cn('p-3 rounded-md', isCurrentUser ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground')}>
          <MessageContent message={message} />
        </div>

        <MessageReactions message={message} currentUserId={currentUserProfile?.id} onReaction={onReaction} />

        <div className="flex items-center mt-1 text-xs text-muted-foreground gap-2">
          <span>{formatMessageTime(message.timestamp)}</span>
          {isCurrentUser && message.status && (
            <span data-testid={`message-status-${message.id}`}>
              {getMessageStatusIcon(message.status)}
            </span>
          )}
          {isPinned && <Pin className="size-3 text-muted-foreground rotate-45" />}
          {isStarred && <Star className="size-3 text-yellow-400 fill-yellow-400" />}
        </div>

        <div className="flex items-center gap-2 mt-2">
          {showReplyIndicator && <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onToggleThread?.()} data-testid={`reply-count-${message.id}`}>
              <ChevronDown className={cn('size-3 mr-1 transition-transform', {
            'rotate-180': isThreadExpanded
          })} />
              {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
            </Button>}
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onReply?.(message)} data-testid={`reply-button-${message.id}`}>
            Reply
          </Button>
        </div>
      </div>

      <MessageActions showActions={showActions} message={message} isPinned={!!isPinned} isStarred={isStarred} onReply={onReply} onReaction={onReaction} onPin={onPin} onUnpin={onUnpin} onStar={onStar} onUnstar={onUnstar} />
    </div>;
}
