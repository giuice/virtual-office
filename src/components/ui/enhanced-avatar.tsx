'use client';

import { useState, useEffect } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { getAvatarUrl, getUserInitials, getUserColor } from '@/lib/avatar-utils';
import { User } from '@/types/database';
import { UIUser } from '@/types/ui';
import { Loader2, AlertCircle } from 'lucide-react';

interface EnhancedAvatarProps {
  user: User | UIUser | null | undefined;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showStatus?: boolean;
  status?: 'online' | 'away' | 'busy' | 'offline';
  fallbackName?: string;
  onError?: (error: Error, url: string) => void;
  retryAttempts?: number;
}

const sizeClasses = {
  sm: 'h-8 w-8',
  md: 'h-12 w-12',
  lg: 'h-16 w-16',
  xl: 'h-24 w-24',
};

const statusColors = {
  online: 'bg-emerald-500',
  away: 'bg-amber-500',
  busy: 'bg-rose-500',
  offline: 'bg-gray-400',
};

export function EnhancedAvatar({
  user,
  size = 'md',
  className,
  showStatus = false,
  status,
  fallbackName,
  onError,
  retryAttempts = 1,
}: EnhancedAvatarProps) {
  const [imageState, setImageState] = useState<'loading' | 'loaded' | 'error' | 'retrying'>('loading');
  const [currentAttempt, setCurrentAttempt] = useState(0);
  const [avatarUrl, setAvatarUrl] = useState<string>('');

  // Get user display name for fallback
  const displayName = fallbackName || user?.displayName || (user as any)?.name || 'User';
  const initials = getUserInitials(displayName);
  const userStatus = status || (user as any)?.status;

  // Initialize avatar URL
  useEffect(() => {
    const url = getAvatarUrl(user);
    setAvatarUrl(url);
    setImageState(url.startsWith('data:') ? 'loaded' : 'loading');
    setCurrentAttempt(0);
  }, [user]);

  // Handle image load success
  const handleImageLoad = () => {
    setImageState('loaded');
  };

  // Handle image load error with retry logic
  const handleImageError = () => {
    if (currentAttempt < retryAttempts) {
      setImageState('retrying');
      setCurrentAttempt(prev => prev + 1);
      
      // Retry after a short delay
      setTimeout(() => {
        setImageState('loading');
        // Add cache-busting parameter (handle relative and absolute URLs safely)
        try {
          const urlObj = new URL(avatarUrl, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
          urlObj.searchParams.set('retry', String(currentAttempt));
          setAvatarUrl(urlObj.toString());
        } catch {
          const sep = avatarUrl.includes('?') ? '&' : '?';
          setAvatarUrl(`${avatarUrl}${sep}retry=${currentAttempt}`);
        }
      }, 1000);
    } else {
      setImageState('error');
      if (onError) {
        onError(new Error('Failed to load avatar image'), avatarUrl);
      }
      
      // Log error in development
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[Avatar] Failed to load avatar for user ${(user as any)?.id || 'unknown'}: ${avatarUrl}`);
      }
    }
  };

  // Render fallback content
  const renderFallback = () => {
    if (imageState === 'loading' || imageState === 'retrying') {
      return (
        <div className="flex items-center justify-center h-full w-full bg-primary/10">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        </div>
      );
    }

    if (imageState === 'error') {
      return (
        <div 
          className="flex items-center justify-center h-full w-full text-primary"
          style={{ backgroundColor: getUserColor(displayName) }}
        >
          <span className="font-medium text-white">
            {initials}
          </span>
        </div>
      );
    }

    return (
      <div 
        className="flex items-center justify-center h-full w-full text-primary"
        style={{ backgroundColor: getUserColor(displayName) }}
      >
        <span className="font-medium text-white">
          {initials}
        </span>
      </div>
    );
  };

  return (
    <div className="relative">
      <Avatar className={cn(sizeClasses[size], className)}>
        {/* Always render the image for real URLs so it can load and fire events */}
        {!avatarUrl.startsWith('data:') && (
          <AvatarImage
            src={avatarUrl}
            alt={displayName}
            onLoad={handleImageLoad}
            onError={handleImageError}
          />
        )}
        <AvatarFallback className="bg-transparent">
          {renderFallback()}
        </AvatarFallback>
      </Avatar>

      {/* Status indicator */}
      {showStatus && userStatus && (
        <span
          className={cn(
            'absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background',
            statusColors[userStatus as keyof typeof statusColors] || statusColors.offline
          )}
        />
      )}

      {/* Error indicator (only in development) */}
      {process.env.NODE_ENV === 'development' && imageState === 'error' && (
        <div className="absolute -top-1 -right-1">
          <AlertCircle className="h-4 w-4 text-red-500" />
        </div>
      )}
    </div>
  );
}
