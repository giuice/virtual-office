// src/components/messaging/MessagingDrawer.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useMessaging } from '@/contexts/messaging/MessagingContext';
import { useCompany } from '@/contexts/CompanyContext';
import { ConversationType } from '@/types/messaging';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, MessageSquare, Minimize2, ArrowLeft, Plus, List } from 'lucide-react';
import { MessageFeed } from './message-feed';
import { ConversationList } from './ConversationList';
import { ConversationSearch } from './ConversationSearch';
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
    getOrCreateUserConversation,
    getOrCreateRoomConversation,
    loadingConversations,
    isDrawerOpen,
    isMinimized,
    activeView,
    setActiveView,
    toggleMinimize,
    closeDrawer,
  } = useMessaging();
  const { currentUserProfile, companyUsers } = useCompany();

  // Local state for tracking conversation creation
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);

  const conversationToDisplay = activeConversation ?? lastActiveConversation;

  // Auto-switch to conversation view only when a NEW conversation becomes active
  const previousConversationIdRef = useRef<string | null>(null);

  useEffect(() => {
    const currentId = activeConversation?.id ?? null;
    const previousId = previousConversationIdRef.current;

    // Store the latest id for the next render
    previousConversationIdRef.current = currentId;

    // Only switch views when a different conversation becomes active
    const conversationChanged = currentId && currentId !== previousId;

    if (conversationChanged && activeView !== 'conversation') {
      setActiveView('conversation');
    }
  }, [activeConversation?.id, activeView, setActiveView]);

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

  // Handle user selection from search - create DM conversation
  const handleSelectUser = async (userId: string) => {
    try {
      setIsCreatingConversation(true);
      const conversation = await getOrCreateUserConversation(userId);
      setActiveConversation(conversation);
      // View will auto-switch to 'conversation' via useEffect
    } catch (error) {
      console.error('Error creating user conversation:', error);
      // TODO: Show error toast/notification
    } finally {
      setIsCreatingConversation(false);
    }
  };

  // Handle room selection from search - create room conversation
  const handleSelectRoom = async (roomId: string, roomName: string) => {
    try {
      setIsCreatingConversation(true);
      const conversation = await getOrCreateRoomConversation(roomId, roomName);
      setActiveConversation(conversation);
      // View will auto-switch to 'conversation' via useEffect
    } catch (error) {
      console.error('Error creating room conversation:', error);
      // TODO: Show error toast/notification
    } finally {
      setIsCreatingConversation(false);
    }
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
      data-testid="messaging-drawer"
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
                title="New message"
              >
                <Plus className="h-3 w-3" />
              </Button>
            )}
            {/* Show list button when NOT in list view - allows user to always navigate to list */}
            {activeView !== 'list' && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleBackToList}
                title="View all conversations"
              >
                <List className="h-3 w-3" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={toggleMinimize}
              title="Minimize"
            >
              <Minimize2 className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleClose}
              title="Close"
              data-testid="messaging-drawer-close"
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

          {/* Search view - find users or rooms to start conversations */}
          {activeView === 'search' && (
            <>
              {isCreatingConversation ? (
                <div className="p-4 text-center text-muted-foreground">
                  Creating conversation...
                </div>
              ) : (
                <ConversationSearch
                  onSelectUser={handleSelectUser}
                  onSelectRoom={handleSelectRoom}
                  currentUserId={currentUserProfile?.id}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
