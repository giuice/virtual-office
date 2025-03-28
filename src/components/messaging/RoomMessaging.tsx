'use client';

import React, { useState, useEffect } from 'react';
import { ChatWindow } from './ChatWindow';
import { useMessaging } from '@/contexts/MessagingContext'; // Assuming context is updated
import { Message, MessageType, MessageStatus } from '@/types/messaging';
import { useCompany } from '@/contexts/CompanyContext';
import { Button } from '@/components/ui/button';
import { XIcon } from 'lucide-react';
import { cn } from '@/lib/utils'; // For conditional classes

interface RoomMessagingProps {
  roomId: string;
  roomName: string;
  isOpen: boolean;
  onClose: () => void;
  position?: 'right' | 'bottom'; // Control panel position
}

export const RoomMessaging: React.FC<RoomMessagingProps> = ({
  roomId,
  roomName,
  isOpen,
  onClose,
  position = 'right',
}) => {
  const { messages: allMessages, sendMessage, isConnected } = useMessaging();
  const { currentUserProfile } = useCompany();
  const [roomMessages, setRoomMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false); // Add loading state later

  // Filter messages for the current room
  useEffect(() => {
    // TODO: Implement more robust filtering/fetching logic based on roomId/conversationId
    // For now, assuming messages might have a conversationId matching roomId
    setRoomMessages(allMessages.filter(msg => msg.conversationId === roomId));
  }, [allMessages, roomId]);

  const handleSendMessage = (content: string) => {
    if (!currentUserProfile) {
      console.error("Cannot send message: User profile not loaded.");
      return; // Or show an error to the user
    }
    sendMessage({
      conversationId: roomId, // Use roomId as conversationId for room chat
      senderId: currentUserProfile.id,
      content: content,
      type: MessageType.TEXT,
      status: MessageStatus.SENDING,
      reactions: [],
      isEdited: false,
    });
  };

  if (!isOpen) {
    return null;
  }

  // Determine positioning classes
  const positionClasses = position === 'right' 
    ? 'fixed top-0 right-0 h-full w-full max-w-md z-50' // Example for right sidebar
    : 'fixed bottom-0 right-0 w-full max-w-md z-50'; // Example for bottom panel

  return (
    <div className={cn("bg-background shadow-lg", positionClasses)}>
      <div className="relative h-full">
        {/* Add a close button */}
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={onClose} 
          className="absolute top-2 right-2 z-10"
        >
          <XIcon className="h-5 w-5" />
          <span className="sr-only">Close chat</span>
        </Button>

        <ChatWindow
          conversationId={roomId}
          messages={roomMessages}
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
          // Pass roomName or other details to ChatWindow header later
        />
      </div>
    </div>
  );
};
