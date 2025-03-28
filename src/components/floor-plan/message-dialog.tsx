// src/components/floor-plan/message-dialog.tsx
'use client';

import { useState, useEffect } from 'react'; // Added useEffect
import { User } from './types';
// Removed Avatar imports as they are handled within ChatWindow/MessageList
import { Button } from '@/components/ui/button';
// Removed ScrollArea and Textarea as ChatWindow handles them
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MessageSquare } from 'lucide-react'; // Removed Send icon
// Removed avatar utils and StatusAvatar as they are handled elsewhere
import { ChatWindow } from '@/components/messaging/ChatWindow'; // Import ChatWindow
import { useMessaging } from '@/contexts/MessagingContext'; // Import useMessaging
import { useCompany } from '@/contexts/CompanyContext'; // Import useCompany
import { Message, MessageType, MessageStatus } from '@/types/messaging'; // Import messaging types

interface MessageDialogProps {
  user: User | null; // User being messaged
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Helper function to generate a consistent conversation ID for DMs
const generateDMConversationId = (userId1: string, userId2: string): string => {
  const ids = [userId1, userId2].sort();
  return `dm-${ids[0]}-${ids[1]}`;
};

export function MessageDialog({ user, open, onOpenChange }: MessageDialogProps) {
  const { currentUserProfile } = useCompany();
  const { messages: allMessages, sendMessage, isConnected } = useMessaging();
  const [directMessages, setDirectMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false); // Add loading state later

  useEffect(() => {
    if (user && currentUserProfile) {
      // Ensure both IDs are strings before generating the conversation ID
      const newConversationId = generateDMConversationId(currentUserProfile.id, String(user.id)); 
      setConversationId(newConversationId);
      // Filter messages for this specific DM conversation
      // TODO: Implement more robust filtering/fetching logic
      setDirectMessages(allMessages.filter(msg => msg.conversationId === newConversationId));
    } else {
      setConversationId(null);
      setDirectMessages([]);
    }
  }, [user, currentUserProfile, allMessages]);

  if (!user || !currentUserProfile || !conversationId) return null;

  const handleSendMessage = (content: string) => {
    sendMessage({
      conversationId: conversationId,
      senderId: currentUserProfile.id,
      content: content,
      type: MessageType.TEXT,
      status: MessageStatus.SENDING,
      reactions: [],
      isEdited: false,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Adjust DialogContent size if needed */}
      <DialogContent className="sm:max-w-[500px] h-[70vh] flex flex-col p-0"> 
        {/* Removed original header, ChatWindow will have its own */}
        {/* Render ChatWindow instead of manual list/input */}
        <ChatWindow
          conversationId={conversationId} // Pass the generated DM conversation ID
          messages={directMessages}
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
          // TODO: Pass user.name or other details to ChatWindow header
        />
      </DialogContent>
    </Dialog>
  );
}
