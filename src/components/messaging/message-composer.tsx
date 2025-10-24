// src/components/messaging/message-composer.tsx
'use client';

import { useRef, useState, useEffect } from 'react';
import { Message } from '@/types/messaging';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Paperclip, Send, Smile, Image, X } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';

interface MessageComposerProps {
  onSendMessage: (content: string) => Promise<void>;
  replyToMessage?: Message | null;
  onCancelReply?: () => void;
  disabled?: boolean;
  placeholder?: string;
  initialValue?: string;
  onValueChange?: (value: string) => void;
}

export function MessageComposer({
  onSendMessage,
  replyToMessage,
  onCancelReply,
  disabled = false,
  placeholder = "Type a message...",
  initialValue = "",
  onValueChange
}: MessageComposerProps) {
  const [content, setContent] = useState(initialValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { companyUsers, currentUserProfile } = useCompany();
  
  // Update content when initialValue changes
  useEffect(() => {
    setContent(initialValue);
  }, [initialValue]);
  
  // Set focus on textarea when reply mode is activated
  useEffect(() => {
    if (replyToMessage && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [replyToMessage]);
  
  // Handle content change
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    
    // Call onValueChange callback if provided
    if (onValueChange) {
      onValueChange(newContent);
    }
  };
  
  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!content.trim() || disabled) return;
    
    try {
      await onSendMessage(content);
      setContent('');
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };
  
  // Handle key press (Enter to send, Shift+Enter for new line)
  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };
  
  // Handle file selection
  const handleFileUpload = () => {
    fileInputRef.current?.click();
  };

  // Render reply preview
  const renderReplyPreview = () => {
    if (!replyToMessage) return null;

    const replySender = replyToMessage.senderId
      ? (replyToMessage.senderId === currentUserProfile?.id
          ? currentUserProfile
          : companyUsers.find(user => user.id === replyToMessage.senderId) || null)
      : null;

    return (
      <div className="flex items-start p-2 rounded-md bg-secondary mb-2">
        <div className="flex-1 text-sm">
          <div className="font-semibold">
            Replying to {replySender?.displayName || (replyToMessage.senderId ? `User ${replyToMessage.senderId.slice(0, 4)}` : 'System')}
          </div>
          <div className="truncate text-muted-foreground">{replyToMessage.content}</div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={onCancelReply}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  };
  
  return (
    <div className="flex flex-col w-full">
      {renderReplyPreview()}
      
      <form onSubmit={handleSubmit} className="w-full">
        <div className="relative">
          <Textarea
            ref={textareaRef}
            value={content}
            onChange={handleContentChange}
            onKeyDown={handleKeyPress}
            placeholder={placeholder}
            className="min-h-[80px] resize-none pr-24"
            disabled={disabled}
            data-message-input
          />
          
          <div className="absolute bottom-2 right-2 flex items-center space-x-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleFileUpload}
              disabled={disabled}
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={disabled}
            >
              <Image className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={disabled}
            >
              <Smile className="h-4 w-4" />
            </Button>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              disabled={disabled}
            />
            <Button
              type="submit"
              disabled={!content.trim() || disabled}
              className="h-8 w-8 p-0"
              data-send-button
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
