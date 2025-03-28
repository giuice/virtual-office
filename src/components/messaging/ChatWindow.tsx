'use client';

import React, { useState } from 'react'; // Import useState
import { MessageList } from './MessageList'; // Assuming MessageList component exists
import { MessageInput } from './MessageInput'; // Assuming MessageInput component exists
import { ScrollArea } from '@/components/ui/scroll-area';
import { Message } from '@/types/messaging'; // Import the Message type

interface ChatWindowProps {
  conversationId: string; // Could be room ID or direct conversation ID
  messages: Message[]; // Pass messages as props for now
  // Update onSendMessage to accept optional replyToId
  onSendMessage: (content: string, replyToId?: string) => void;
  isLoading?: boolean;
  // Add other props like participants, conversation title etc. later
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
  conversationId,
  messages,
  onSendMessage,
  isLoading = false,
}) => {
  const [replyingToMessage, setReplyingToMessage] = useState<Message | null>(null);

  const handleStartReply = (message: Message) => {
    setReplyingToMessage(message);
  };

  const handleCancelReply = () => {
    setReplyingToMessage(null);
  };

  // TODO: Add logic to fetch messages based on conversationId if not passed via props
  // TODO: Add header with conversation details (title, participants)

  return (
    <div className="flex flex-col h-full border rounded-lg bg-card text-card-foreground">
      {/* Header Placeholder */}
      <div className="p-3 border-b flex items-center justify-between">
        <h2 className="font-semibold text-lg">Chat: {conversationId}</h2>
        {/* Add close button or other controls later */}
      </div>

      {/* Message List Area */}
      <ScrollArea className="flex-1 p-4">
        {isLoading ? (
          <p className="text-center text-muted-foreground">Loading messages...</p>
        ) : (
          <MessageList messages={messages} onStartReply={handleStartReply} />
        )}
      </ScrollArea>

      {/* Message Input Area */}
      <div className="p-3 border-t">
        <MessageInput
          onSendMessage={onSendMessage}
          replyingToMessage={replyingToMessage}
          onCancelReply={handleCancelReply}
          isLoading={isLoading} // Pass isLoading down
        />
      </div>
    </div>
  );
};
