// src/components/messaging/EnhancedMessageComposer.tsx
'use client';

import { useState, useRef, useCallback, KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useTypingIndicator } from '@/hooks/useTypingIndicator';
import { Message, FileAttachment } from '@/types/messaging';
import { cn } from '@/lib/utils';
import { 
  Send, 
  Paperclip, 
  X, 
  File, 
  Image,
  Smile 
} from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';

interface EnhancedMessageComposerProps {
  conversationId: string | null;
  onSendMessage: (content: string, options?: {
    replyToId?: string;
    attachments?: FileAttachment[];
  }) => Promise<void>;
  onUploadAttachment?: (file: File) => Promise<FileAttachment>;
  replyToMessage?: Message;
  onCancelReply?: () => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function EnhancedMessageComposer({
  conversationId,
  onSendMessage,
  onUploadAttachment,
  replyToMessage,
  onCancelReply,
  placeholder = "Type a message...",
  disabled = false,
  className
}: EnhancedMessageComposerProps) {
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { companyUsers, currentUserProfile } = useCompany();

  // Typing indicator hook
  const {
    handleInputChange,
    handleInputFocus,
    handleInputBlur,
    handleMessageSent,
    cleanup
  } = useTypingIndicator(conversationId);

  // Auto-resize textarea
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, []);

  // Handle content change
  const handleContentChange = (value: string) => {
    setContent(value);
    handleInputChange(value);
    adjustTextareaHeight();
  };

  // Handle key press
  const handleKeyPress = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Handle send message
  const handleSendMessage = async () => {
    if (!content.trim() && attachments.length === 0) return;
    if (sending || disabled) return;

    setSending(true);
    
    try {
      await onSendMessage(content, {
        replyToId: replyToMessage?.id,
        attachments: attachments.length > 0 ? attachments : undefined
      });
      
      // Reset form
      setContent('');
      setAttachments([]);
      onCancelReply?.();
      handleMessageSent();
      
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setSending(false);
    }
  };

  // Handle file upload
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || !onUploadAttachment) return;

    setUploading(true);
    
    try {
      const uploadPromises = Array.from(files).map(file => onUploadAttachment(file));
      const uploadedAttachments = await Promise.all(uploadPromises);
      
      setAttachments(prev => [...prev, ...uploadedAttachments]);
    } catch (error) {
      console.error('Failed to upload files:', error);
    } finally {
      setUploading(false);
    }
  };

  // Remove attachment
  const removeAttachment = (attachmentId: string) => {
    setAttachments(prev => prev.filter(a => a.id !== attachmentId));
  };

  // Render reply preview
  const renderReplyPreview = () => {
    if (!replyToMessage) return null;

    const replySender = replyToMessage?.senderId
      ? (replyToMessage.senderId === currentUserProfile?.id
          ? currentUserProfile
          : companyUsers.find(user => user.id === replyToMessage.senderId) || null)
      : null;

    return (
      <div className="flex items-start gap-2 p-3 bg-muted/50 border-l-2 border-primary">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-muted-foreground mb-1">
            Replying to {replySender?.displayName || (replyToMessage.senderId ? `User ${replyToMessage.senderId.slice(0, 4)}` : 'System')}
          </div>
          <div className="text-sm truncate">
            {replyToMessage.content}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={onCancelReply}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  };

  // Render attachments preview
  const renderAttachmentsPreview = () => {
    if (attachments.length === 0) return null;

    return (
      <div className="flex flex-wrap gap-2 p-3 border-t">
        {attachments.map((attachment) => (
          <div 
            key={attachment.id}
            className="flex items-center gap-2 bg-secondary rounded-md p-2 text-sm"
          >
            {attachment.type.startsWith('image/') ? (
              <Image className="h-4 w-4" />
            ) : (
              <File className="h-4 w-4" />
            )}
            <span className="truncate max-w-32">
              {attachment.name}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-4 w-4 shrink-0"
              onClick={() => removeAttachment(attachment.id)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className={cn("border-t bg-background", className)}>
      {renderReplyPreview()}
      {renderAttachmentsPreview()}
      
      <div className="flex items-end gap-2 p-4">
        {/* File upload */}
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            disabled={disabled || uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleFileUpload(e.target.files)}
          />
        </div>

        {/* Message input */}
        <div className="flex-1">
          <Textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            onKeyDown={handleKeyPress}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            placeholder={placeholder}
            disabled={disabled}
            className="min-h-[40px] max-h-[120px] resize-none"
            rows={1}
          />
        </div>

        {/* Send button */}
        <Button
          onClick={handleSendMessage}
          disabled={(!content.trim() && attachments.length === 0) || sending || disabled}
          size="icon"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
      
      {uploading && (
        <div className="px-4 pb-2">
          <div className="text-xs text-muted-foreground">
            Uploading files...
          </div>
        </div>
      )}
    </div>
  );
}
