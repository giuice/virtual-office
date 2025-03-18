// src/components/messaging/room-messaging.tsx
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MessageSquare, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MessageFeed } from './message-feed';

interface RoomMessagingProps {
  roomId: string;
  roomName: string;
  isOpen?: boolean;
  onClose?: () => void;
  className?: string;
  maxHeight?: string;
  position?: 'right' | 'bottom';
}

export function RoomMessaging({
  roomId,
  roomName,
  isOpen = false,
  onClose,
  className,
  maxHeight = '500px',
  position = 'right',
}: RoomMessagingProps) {
  const [isExpanded, setIsExpanded] = useState(isOpen);
  
  // Toggle messaging panel
  const togglePanel = () => {
    setIsExpanded(prev => !prev);
  };
  
  // Handle close
  const handleClose = () => {
    setIsExpanded(false);
    if (onClose) {
      onClose();
    }
  };
  
  // If collapsed, render just the toggle button
  if (!isExpanded) {
    return (
      <Button
        variant="outline"
        size="sm"
        className={cn(
          "flex items-center gap-2",
          position === 'right' 
            ? "absolute top-4 right-4" 
            : "absolute bottom-4 right-4",
          className
        )}
        onClick={togglePanel}
      >
        <MessageSquare className="h-4 w-4" />
        <span>Open Chat</span>
      </Button>
    );
  }
  
  // Expanded state - render full messaging panel
  return (
    <Card
      className={cn(
        "flex flex-col",
        position === 'right' 
          ? "absolute top-4 right-4 w-96 h-[80vh]" 
          : "absolute bottom-4 right-4 left-4 h-64",
        className
      )}
    >
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">{roomName}</CardTitle>
          <CardDescription>Room Chat</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8" 
            onClick={togglePanel}
          >
            <MessageSquare className="h-4 w-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8" 
            onClick={handleClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 p-0">
        <MessageFeed 
          roomId={roomId}
          roomName={roomName}
          maxHeight={position === 'right' ? 'calc(80vh - 120px)' : maxHeight}
        />
      </CardContent>
    </Card>
  );
}
