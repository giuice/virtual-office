'use client';

import React, { useEffect, useRef } from 'react';
import { Message } from '@/types/messaging';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getAvatarUrl, getUserInitials } from '@/lib/avatar-utils'; // Assuming these utils exist
import { useCompany } from '@/contexts/CompanyContext'; // To get current user ID
import { Button } from '@/components/ui/button';
import { SmilePlus, MessageSquareReply } from 'lucide-react'; // Import reply icon
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"; // Import Popover components
import { useMessaging } from '@/contexts/messaging/MessagingContext'; // Import useMessaging

interface MessageListProps {
  messages: Message[];
  onStartReply: (message: Message) => void; // Add prop for initiating reply
}

export const MessageList: React.FC<MessageListProps> = ({ messages, onStartReply }) => {
  const { currentUserProfile, companyUsers } = useCompany(); // Get current user and company users list
  const { addReaction } = useMessaging(); // Get addReaction function from context
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const formatTime = (timestamp: string | Date): string => {
    const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Removed placeholder getSenderDetails function

  // Function for handling reaction selection
  const handleSelectReaction = (messageId: string, emoji: string) => {
    console.log(`Selected reaction '${emoji}' for message: ${messageId}`);
    addReaction(messageId, emoji); // Call context function
    // TODO: Close popover after selection?
  };

  return (
    <div ref={scrollRef} className="space-y-4 h-full">
      {messages.length === 0 ? (
        <p className="text-center text-muted-foreground">No messages yet.</p>
      ) : (
        messages.map((message) => {
          const isCurrentUser = message.senderId === currentUserProfile?.id;
          // Find sender details from companyUsers list
          const sender = !isCurrentUser ? companyUsers.find(u => u.id === message.senderId) : null;
          const senderName = sender?.displayName || `User ${message.senderId.substring(0, 4)}`; // Fallback name
          const senderAvatarUrl = sender?.avatarUrl; // May be undefined

          // Find the original message if this is a reply
          const originalMessage = message.replyToId
            ? messages.find((m) => m.id === message.replyToId)
            : null;
          const originalSender = originalMessage?.senderId === currentUserProfile?.id
            ? currentUserProfile
            : companyUsers.find(u => u.id === originalMessage?.senderId);
          const originalSenderName = originalSender?.displayName || 'User';
          const originalContentSnippet = originalMessage?.content.substring(0, 30) + (originalMessage && originalMessage.content.length > 30 ? '...' : '');


          return (
            <div
              key={message.id}
              className={`group flex items-end gap-2 ${isCurrentUser ? 'justify-end' : 'justify-start'}`} // Added 'group' class
            >
              {!isCurrentUser && (
                <Avatar className="h-8 w-8">
                  {/* Pass sender details to avatar utils */}
                  <AvatarImage src={getAvatarUrl({ name: senderName, avatar: senderAvatarUrl })} alt={senderName} />
                  <AvatarFallback>{getUserInitials(senderName)}</AvatarFallback>
                </Avatar>
              )}
              <div className={`max-w-[70%]`}>
                <div
                  className={`rounded-lg px-3 py-2 text-sm ${
                    isCurrentUser
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {!isCurrentUser && (
                    <p className="text-xs font-semibold mb-1">{senderName}</p>
                  )}
                  {/* Display reply indicator */}
                  {originalMessage && (
                    <div className="text-xs text-muted-foreground border-l-2 border-muted-foreground pl-2 mb-1 opacity-75">
                      Replying to {originalSenderName}: "{originalContentSnippet}"
                    </div>
                  )}
                  <p>{message.content}</p>
                </div>
                <p className={`text-xs text-muted-foreground mt-1 ${isCurrentUser ? 'text-right' : 'text-left'}`}>
                  {formatTime(message.timestamp)}
                  {message.isEdited && <span className="ml-1">(edited)</span>}
                  {/* TODO: Add status indicator (sending, sent, read) */}
                </p>
              </div>

              {/* Reaction Popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity" // Show on hover
                  >
                    <SmilePlus className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-1">
                  <div className="flex gap-1">
                    {['👍', '❤️', '😂', '😮', '😢', '🙏'].map((emoji) => (
                      <Button
                        key={emoji}
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-full p-1 text-lg" // Adjusted size and padding
                        onClick={() => handleSelectReaction(message.id, emoji)}
                      >
                        {emoji}
                      </Button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              {/* Reply Button */}
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity" // Show on hover
                onClick={() => onStartReply(message)}
              >
                <MessageSquareReply className="h-4 w-4 text-muted-foreground" />
              </Button>

              {isCurrentUser && currentUserProfile && (
                 <Avatar className="h-8 w-8">
                  {/* Construct the object expected by getAvatarUrl */}
                  <AvatarImage 
                    src={getAvatarUrl({ name: currentUserProfile.displayName || '', avatar: currentUserProfile.avatarUrl })} 
                    alt={currentUserProfile.displayName || 'You'} 
                  />
                  <AvatarFallback>{getUserInitials(currentUserProfile.displayName || 'You')}</AvatarFallback>
                </Avatar>
              )}
            </div>
          );
        })
      )}
    </div>
  );
};
