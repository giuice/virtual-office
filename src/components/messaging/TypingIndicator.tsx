// src/components/messaging/TypingIndicator.tsx
'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface TypingIndicatorProps {
  typingUsers: string[];
  className?: string;
}

export function TypingIndicator({ typingUsers, className }: TypingIndicatorProps) {
  const [dots, setDots] = useState('');

  // Animate the dots
  useEffect(() => {
    if (typingUsers.length === 0) return;

    const interval = setInterval(() => {
      setDots(prev => {
        if (prev === '...') return '';
        return prev + '.';
      });
    }, 500);

    return () => clearInterval(interval);
  }, [typingUsers.length]);

  if (typingUsers.length === 0) return null;

  // Format typing message
  const getTypingMessage = () => {
    if (typingUsers.length === 1) {
      return `${typingUsers[0]} is typing${dots}`;
    } else if (typingUsers.length === 2) {
      return `${typingUsers[0]} and ${typingUsers[1]} are typing${dots}`;
    } else {
      return `${typingUsers[0]} and ${typingUsers.length - 1} others are typing${dots}`;
    }
  };

  return (
    <div className={cn(
      "flex items-center px-4 py-2 text-sm text-muted-foreground italic",
      className
    )}>
      <div className="flex space-x-1 mr-2">
        {/* Animated typing dots */}
        <div className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-pulse"></div>
        <div 
          className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-pulse"
          style={{ animationDelay: '0.2s' }}
        ></div>
        <div 
          className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-pulse"
          style={{ animationDelay: '0.4s' }}
        ></div>
      </div>
      <span>{getTypingMessage()}</span>
    </div>
  );
}