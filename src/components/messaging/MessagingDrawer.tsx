// src/components/messaging/MessagingDrawer.tsx
'use client';

import { useMessaging } from '@/contexts/messaging/MessagingContext';
import { useCompany } from '@/contexts/CompanyContext';
import { ConversationType } from '@/types/messaging';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, MessageSquare, Minimize2, Maximize2 } from 'lucide-react';
import { MessageFeed } from './message-feed';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface MessagingDrawerProps {
  className?: string;
}

/**
 * Global messaging drawer that displays direct messages when activeConversation is direct.
 * Mounted at the root layout level to persist across page navigation.
 */
export function MessagingDrawer({ className }: MessagingDrawerProps) {
  const { activeConversation, setActiveConversation } = useMessaging();
  const { currentUserProfile, companyUsers } = useCompany();
  const [isMinimized, setIsMinimized] = useState(false);

  // Only show for direct conversations
  if (!activeConversation || activeConversation.type !== ConversationType.DIRECT) {
    return null;
  }

  const handleClose = () => {
    setActiveConversation(null);
  };

  const handleToggleMinimize = () => {
    setIsMinimized(!isMinimized);
  };

  // Get the other participant's name for display
  const otherParticipantId = activeConversation.participants.find(
    participantId => participantId !== currentUserProfile?.id
  );
  
  const otherParticipant = companyUsers.find(user => user.id === otherParticipantId);
  const conversationTitle = otherParticipant?.displayName || activeConversation.name || 'Direct Message';

  // Minimized state - just show a small indicator
  if (isMinimized) {
    return (
      <div
        className={cn(
          'fixed bottom-4 right-4 z-50',
          className
        )}
      >
        <Button
          variant="default"
          className="flex items-center gap-2 shadow-lg"
          onClick={handleToggleMinimize}
        >
          <MessageSquare className="h-4 w-4" />
          <span>{conversationTitle}</span>
        </Button>
      </div>
    );
  }

  // Expanded state - show full messaging interface
  return (
    <div
      className={cn(
        'fixed bottom-4 right-4 z-50 w-96 h-[500px]',
        className
      )}
    >
      <Card className="h-full flex flex-col shadow-xl border-2">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            <CardTitle className="text-sm font-medium">{conversationTitle}</CardTitle>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleToggleMinimize}
            >
              <Minimize2 className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleClose}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="flex-1 p-0 overflow-hidden">
          <MessageFeed
            conversationId={activeConversation.id}
            maxHeight="calc(100% - 60px)"
          />
        </CardContent>
      </Card>
    </div>
  );
}