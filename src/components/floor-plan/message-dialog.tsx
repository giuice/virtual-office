// src/components/floor-plan/message-dialog.tsx
'use client';

import { useLayoutEffect } from 'react';
import { UIUser as User } from './types';
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
import { useMessaging } from '@/contexts/messaging/MessagingContext'; // Import useMessaging with correct path
import { useCompany } from '@/contexts/CompanyContext'; // Import useCompany
import { MessageType } from '@/types/messaging'; // Import messaging types

interface MessageDialogProps {
  user: User | null; // User being messaged
  open: boolean;
  onOpenChange: (open: boolean) => void;
}


export function MessageDialog({ user, open, onOpenChange }: MessageDialogProps) {
  const { currentUserProfile } = useCompany();
  const { activeConversation, sendMessage, getOrCreateUserConversation, setActiveConversation } = useMessaging();
  const conversationId = open ? activeConversation?.id ?? null : null;

  useLayoutEffect(() => {
    if (user && currentUserProfile && open) {
      // Create or get existing conversation with the target user
      const initializeConversation = async () => {
        try {
          const conversation = await getOrCreateUserConversation(String(user.id));
          setActiveConversation(conversation);
        } catch (error) {
          console.error('Failed to initialize conversation:', error);
        }
      };
      
      initializeConversation();
    }
  }, [user, currentUserProfile, open, getOrCreateUserConversation, setActiveConversation]);

  if (!user || !currentUserProfile) return null;

  const handleSendMessage = async (content: string, replyToId?: string) => {
    if (!content.trim()) return;
    await sendMessage(content, {
      type: MessageType.TEXT,
      replyToId
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Adjust DialogContent size if needed */}
      <DialogContent className="sm:max-w-[500px] h-[70vh] flex flex-col p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>{`Direct message with ${user.displayName || 'User'}`}</DialogTitle>
        </DialogHeader>
        {conversationId ? (
          <ChatWindow
            conversationId={conversationId}
            onSendMessage={handleSendMessage}
            title={`Chat with ${user.displayName || 'User'}`}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            Initializing conversation…
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
