'use client';

import React, { useState, useEffect, useRef } from 'react'; // Added useEffect and useRef
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Send, X } from 'lucide-react'; // Import X icon
import { Message } from '@/types/messaging'; // Import Message type
import { useCompany } from '@/contexts/CompanyContext'; // Import useCompany

interface MessageInputProps {
  onSendMessage: (content: string, replyToId?: string) => void; // Pass replyToId
  isLoading?: boolean; // Optional loading state
  replyingToMessage: Message | null; // Message being replied to
  onCancelReply: () => void; // Function to cancel reply mode
}

export const MessageInput: React.FC<MessageInputProps> = ({
  onSendMessage,
  isLoading = false,
  replyingToMessage,
  onCancelReply
}) => {
  const [messageContent, setMessageContent] = useState('');
  const { companyUsers, currentUserProfile } = useCompany(); // Get users
  const textareaRef = useRef<HTMLTextAreaElement>(null); // Ref for focus

  // Focus textarea when replyingToMessage changes
  useEffect(() => {
    if (replyingToMessage && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [replyingToMessage]);


  const handleSend = () => {
    if (messageContent.trim() && !isLoading) {
      onSendMessage(messageContent.trim(), replyingToMessage?.id); // Pass replyToId
      setMessageContent(''); // Clear input after sending
      if (replyingToMessage) {
        onCancelReply(); // Exit reply mode after sending
      }
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Send message on Enter press (but not Shift+Enter for new lines)
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault(); // Prevent default newline behavior
      handleSend();
    }
    // Cancel reply on Escape press
    if (event.key === 'Escape' && replyingToMessage) {
      onCancelReply();
    }
  };

  // Find original sender name for display
  const originalSender = replyingToMessage?.senderId === currentUserProfile?.id
    ? currentUserProfile
    : companyUsers.find(u => u.id === replyingToMessage?.senderId);
  const originalSenderName = originalSender?.displayName || 'User';
  const originalContentSnippet = replyingToMessage?.content.substring(0, 50) + (replyingToMessage && replyingToMessage.content.length > 50 ? '...' : '');

  return (
    <div className="flex flex-col gap-1"> {/* Changed to flex-col */}
      {/* Reply Indicator */}
      {replyingToMessage && (
        <div className="flex items-center justify-between text-xs bg-muted p-2 rounded-t-md border border-b-0">
          <div className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-muted-foreground">
            Replying to {originalSenderName}: "{originalContentSnippet}"
          </div>
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onCancelReply}>
            <X className="h-3 w-3" />
            <span className="sr-only">Cancel reply</span>
          </Button>
        </div>
      )}
      {/* Main Input Area */}
      <div className={`flex items-center gap-2 ${replyingToMessage ? 'border border-t-0 rounded-b-md p-2' : ''}`}> {/* Conditional styling */}
        <Textarea
          ref={textareaRef} // Add ref
          placeholder="Type your message..."
          value={messageContent}
        onChange={(e) => setMessageContent(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={1} // Start with one row, auto-expand
        className="flex-1 resize-none min-h-[40px]" // Adjust styling as needed
        disabled={isLoading}
      />
      <Button onClick={handleSend} disabled={!messageContent.trim() || isLoading} size="icon">
        <Send className="h-4 w-4" />
        <span className="sr-only">Send message</span>
      </Button>
    </div>
  </div>
  );
};
