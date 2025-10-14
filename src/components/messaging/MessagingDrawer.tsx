// src/components/messaging/MessagingDrawer.tsx
'use client';

import { useEffect } from 'react';
import { useMessaging } from '@/contexts/messaging/MessagingContext';
import { useCompany } from '@/contexts/CompanyContext';
import { ConversationType } from '@/types/messaging';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, MessageSquare, Minimize2, ArrowLeft, Plus } from 'lucide-react';
import { MessageFeed } from './message-feed';
import { ConversationList } from './ConversationList';
import { cn } from '@/lib/utils';

interface MessagingDrawerProps {
  className?: string;
}

/**
 * Global messaging drawer that displays conversations (direct messages and rooms).
 * Mounted at the root layout level to persist across page navigation.
 * State is managed by MessagingContext and persists across route changes.
 */
export function MessagingDrawer({ className }: MessagingDrawerProps) {
  const {
    activeConversation,
    lastActiveConversation,
    conversations,
    setActiveConversation,
    loadingConversations,
    isDrawerOpen,
    isMinimized,
    activeView,
    setActiveView,
    toggleMinimize,
    closeDrawer,
  } = useMessaging();
  const { currentUserProfile, companyUsers } = useCompany();

  const conversationToDisplay = activeConversation ?? lastActiveConversation;

  // Auto-switch to conversation view when a conversation becomes active
  useEffect(() => {
    if (activeConversation && activeView !== 'conversation') {
      setActiveView('conversation');
    }
  }, [activeConversation, activeView, setActiveView]);

  // Only show if drawer is open
  if (!isDrawerOpen) {
    return null;
  }

  const handleClose = () => {
    closeDrawer();
  };

  // Handle conversation selection - switch to conversation view
  const handleSelectConversation = (conversationId: string) => {
    const conversation = conversations.find((c) => c.id === conversationId);
    if (conversation) {
      setActiveConversation(conversation);
      setActiveView('conversation');
    }
  };

  // Handle back to list
  const handleBackToList = () => {
    setActiveView('list');
  };

  // Handle new message button
  const handleNewMessage = () => {
    setActiveView('search');
  };

  // Determine drawer title based on view and active conversation
  const drawerTitle = (() => {
    if (activeView === 'list') {
      return 'Messages';
    }
    if (activeView === 'search') {
      return 'New Message';
    }
    // For conversation view, determine title based on conversation type
    if (!conversationToDisplay) {
      return 'Messages';
    }
    if (conversationToDisplay.type === ConversationType.ROOM) {
      return conversationToDisplay.name || 'Room';
    }
    // For direct messages, find the other participant's name
    const otherParticipantId = conversationToDisplay.participants?.find(
      (participantId: string) => participantId !== currentUserProfile?.id
    );
    const otherParticipant = companyUsers.find((user: any) => user.id === otherParticipantId);
    return otherParticipant?.displayName || conversationToDisplay.name || 'Direct Message';
  })();

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
          onClick={toggleMinimize}
        >
          <MessageSquare className="h-4 w-4" />
          <span>{drawerTitle}</span>
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
            {/* Back button for conversation/search views */}
            {(activeView === 'conversation' || activeView === 'search') && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleBackToList}
              >
                <ArrowLeft className="h-3 w-3" />
              </Button>
            )}
            <MessageSquare className="h-4 w-4" />
            <CardTitle className="text-sm font-medium">{drawerTitle}</CardTitle>
          </div>
          <div className="flex items-center gap-1">
            {/* New message button for list view */}
            {activeView === 'list' && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleNewMessage}
              >
                <Plus className="h-3 w-3" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={toggleMinimize}
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
          {/* List view - show conversation list */}
          {activeView === 'list' && (
            <ConversationList
              conversations={conversations}
              selectedConversationId={activeConversation?.id || null}
              onSelectConversation={handleSelectConversation}
              isLoading={loadingConversations}
            />
          )}

          {/* Conversation view - show message feed */}
          {activeView === 'conversation' && conversationToDisplay && (
            <MessageFeed
              conversationId={conversationToDisplay.id}
              maxHeight="calc(100% - 60px)"
            />
          )}

          {/* Search view - placeholder for now (will be implemented in 2.3.3) */}
          {activeView === 'search' && (
            <div className="p-4 text-center text-muted-foreground">
              Search functionality coming soon...
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}