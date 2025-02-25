// src/components/floor-plan/message-dialog.tsx
'use client'

import { useState } from 'react'
import { User } from './types'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { MessageSquare, Send } from 'lucide-react'
import { getAvatarUrl, getUserInitials } from '@/lib/avatar-utils'

// Message type definition
interface Message {
  id: number;
  content: string;
  timestamp: Date;
  fromUser: boolean; // true if message is from current user
}

interface MessageDialogProps {
  user: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MessageDialog({ user, open, onOpenChange }: MessageDialogProps) {
  const [messageText, setMessageText] = useState('');
  // Mock conversation history - in production this would come from a database or API
  const [conversation, setConversation] = useState<Message[]>([
    {
      id: 1,
      content: "Hi there! How's the project going?",
      timestamp: new Date(Date.now() - 3600000),
      fromUser: false
    },
    {
      id: 2,
      content: "Making good progress. Just finishing the UI components.",
      timestamp: new Date(Date.now() - 3000000),
      fromUser: true
    }
  ]);

  if (!user) return null;

  const handleSend = () => {
    if (!messageText.trim()) return;
    
    // Add message to conversation
    const newMessage: Message = {
      id: Date.now(),
      content: messageText,
      timestamp: new Date(),
      fromUser: true
    };
    
    setConversation([...conversation, newMessage]);
    setMessageText('');
    
    // Mock response (would be replaced with actual messaging system)
    setTimeout(() => {
      const responseMessage: Message = {
        id: Date.now() + 1,
        content: `Thanks for your message. I'll get back to you soon!`,
        timestamp: new Date(),
        fromUser: false
      };
      setConversation(prev => [...prev, responseMessage]);
    }, 1000);
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Message {user.name}
          </DialogTitle>
        </DialogHeader>
        
        {/* Conversation history */}
        <ScrollArea className="h-[300px] border rounded-md p-4">
          <div className="space-y-4">
            {conversation.map(message => (
              <div 
                key={message.id} 
                className={`flex ${message.fromUser ? 'justify-end' : 'justify-start'}`}
              >
                <div className="flex gap-2 max-w-[80%]">
                  {!message.fromUser && (
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={getAvatarUrl(user)} alt={user.name} />
                      <AvatarFallback>{getUserInitials(user.name)}</AvatarFallback>
                    </Avatar>
                  )}
                  <div>
                    <div 
                      className={`rounded-lg p-3 ${
                        message.fromUser 
                          ? 'bg-primary text-primary-foreground' 
                          : 'bg-muted'
                      }`}
                    >
                      <p className="text-sm">{message.content}</p>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {formatTime(message.timestamp)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
        
        {/* Message input */}
        <div className="flex gap-2 mt-2">
          <Textarea
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder="Type your message..."
            className="min-h-[80px]"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <Button 
            onClick={handleSend}
            disabled={!messageText.trim()}
            className="self-end"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}