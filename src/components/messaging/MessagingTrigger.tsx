/**
 * MessagingTrigger - Floating action button to open the messaging drawer
 *
 * This component provides a persistent way for users to access their messages
 * from anywhere in the application. It shows unread message counts and opens
 * the messaging drawer when clicked.
 */
'use client';

import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useMessaging } from '@/contexts/messaging/MessagingContext';
import { cn } from '@/lib/utils';

interface MessagingTriggerProps {
  className?: string;
}

export function MessagingTrigger({ className }: MessagingTriggerProps) {
  // Viewer's own server-computed unread total (Phase 2.2), archived excluded.
  const { isDrawerOpen, openDrawer, totalUnreadCount: totalUnread } = useMessaging();

  // Don't show trigger if drawer is already open
  if (isDrawerOpen) {
    return null;
  }

  return (
    <Button
      data-testid="messaging-drawer-trigger"
      onClick={openDrawer}
      className={cn(
        'fixed bottom-6 right-6 z-40 size-14 rounded-full shadow-lg',
        className
      )}
      size="icon"
      aria-label="Open messages"
    >
      <MessageSquare className="size-6" />
      {totalUnread > 0 && (
        <Badge
          variant="destructive"
          className="absolute -top-1 -right-1 h-6 min-w-[1.5rem] rounded-full px-1 text-xs"
          data-testid="messaging-drawer-trigger-badge"
        >
          {totalUnread > 99 ? '99+' : totalUnread}
        </Badge>
      )}
    </Button>
  );
}
