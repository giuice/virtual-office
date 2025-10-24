// src/components/messaging/message-feed.tsx
'use client';

import { useRef, useState, useEffect } from 'react';
import { useMessaging } from '@/contexts/messaging/MessagingContext';
import { useAuth } from '@/contexts/AuthContext';
import { Message } from '@/types/messaging';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MessageItem } from './message-item';
import { MessageComposer } from './message-composer';

interface MessageFeedProps {
  conversationId?: string;
  roomId?: string;
  roomName?: string;
  className?: string;
  maxHeight?: string;
}

export function MessageFeed({
  conversationId,
  roomId,
  roomName,
  className,
  maxHeight = '500px',
}: MessageFeedProps) {
  const { user } = useAuth();
  const {
    messages,
    loadingMessages,
    errorMessages,
    hasMoreMessages,
    loadMoreMessages,
    sendMessage,
    activeConversation,
    setActiveConversation,
    getOrCreateRoomConversation,
    addReaction,
  } = useMessaging();
  
  const [isLoading, setIsLoading] = useState(false);
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Initialize / switch conversation when roomId changes
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      if (!roomId || !roomName) return;
      try {
        setIsLoading(true);
        const conversation = await getOrCreateRoomConversation(roomId, roomName);
        if (!cancelled) {
          setActiveConversation(conversation);
        }
      } catch (error) {
        console.error('Error initializing room conversation:', error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    init();
    return () => { cancelled = true; };
  }, [roomId, roomName, getOrCreateRoomConversation, setActiveConversation]);
  
  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);
  
  // Handle sending a message
  const handleSendMessage = async (content: string) => {
    if (!activeConversation) return;
    
    try {
      await sendMessage(content, {
        replyToId: replyToMessage?.id,
      });
      setReplyToMessage(null);
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };
  
  // Handle reply
  const handleReply = (message: Message) => {
    setReplyToMessage(message);
  };
  
  // Handle reaction
  const handleReaction = (messageId: string, emoji: string) => {
    addReaction(messageId, emoji);
  };
  
  // Render loading state
  if (isLoading || loadingMessages) {
    return (
      <Card className={cn("w-full", className)}>
        <CardHeader>
          <CardTitle>
            <Skeleton className="h-6 w-40" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-12 w-3/4" />
            <Skeleton className="h-12 w-1/2 ml-auto" />
            <Skeleton className="h-12 w-2/3" />
          </div>
        </CardContent>
        <CardFooter>
          <Skeleton className="h-10 w-full" />
        </CardFooter>
      </Card>
    );
  }
  
  // Render error state
  if (errorMessages) {
    return (
      <Card className={cn("w-full", className)}>
        <CardContent className="p-6">
          <div className="text-center text-red-500">
            <AlertCircle className="h-8 w-8 mx-auto mb-2" />
            <p>Failed to load messages. Please try again.</p>
            <Button 
              variant="outline" 
              className="mt-4"
              onClick={() => window.location.reload()}
            >
              Reload
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  // Render empty state
  if (!activeConversation) {
    return (
      <Card className={cn("w-full", className)}>
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">
            <p>No conversation selected.</p>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card className={cn("w-full flex flex-col", className)} data-testid="messages-feed">
      {/* Legacy test hook for older specs */}
      <div data-testid="message-feed" className="sr-only" />
      <CardHeader className="pb-2">
        <CardTitle>{activeConversation.name || 'Conversation'}</CardTitle>
      </CardHeader>

      <CardContent className="flex-1 p-0 overflow-hidden">
        <ScrollArea
          className="h-full"
          style={{ maxHeight }}
        >
          {hasMoreMessages && (
            <div className="text-center py-2">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={loadMoreMessages}
                disabled={loadingMessages}
              >
                Load more messages
              </Button>
            </div>
          )}
          
          <div className="py-4">
            {messages.length === 0 ? (
              <div className="text-center text-muted-foreground p-4">
                <p>No messages yet. Start the conversation!</p>
              </div>
            ) : (
              messages.map((message) => (
                <MessageItem 
                  key={message.id}
                  message={message}
                  onReply={handleReply}
                  onReaction={handleReaction}
                />
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
      </CardContent>
      
      <CardFooter className="p-4 pt-2">
        <MessageComposer
          onSendMessage={handleSendMessage}
          replyToMessage={replyToMessage}
          onCancelReply={() => setReplyToMessage(null)}
          initialValue={""}
          onValueChange={() => {}}
        />
      </CardFooter>
    </Card>
  );
}
