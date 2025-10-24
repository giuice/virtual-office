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
  const { isDrawerOpen, openDrawer, conversations } = useMessaging();

  // Calculate total unread messages
  const totalUnread = conversations.reduce((sum, conv) => {
    const unreadCount = Object.values(conv.unreadCount || {}).reduce((a, b) => a + b, 0);
    return sum + unreadCount;
  }, 0);

  // Don't show trigger if drawer is already open
  if (isDrawerOpen) {
    return null;
  }

  return (
    <Button
      data-testid="messaging-drawer-trigger"
      onClick={openDrawer}
      className={cn(
        'fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full shadow-lg',
        className
      )}
      size="icon"
      aria-label="Open messages"
    >
      <MessageSquare className="h-6 w-6" />
      {totalUnread > 0 && (
        <Badge
          variant="destructive"
          className="absolute -top-1 -right-1 h-6 min-w-[1.5rem] rounded-full px-1 text-xs"
        >
          {totalUnread > 99 ? '99+' : totalUnread}
        </Badge>
      )}
    </Button>
  );
}
