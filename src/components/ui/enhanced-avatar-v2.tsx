'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { 
  getAvatarUrl, 
  getUserInitials, 
  getUserColor, 
  handleAvatarLoadError,
  logAvatarLoadError,
  AvatarUser,
  AvatarLoadError
} from '@/lib/avatar-utils';
import { User } from '@/types/database';
import { UIUser } from '@/types/ui';
import { Loader2, RefreshCw, AlertCircle } from 'lucide-react';

interface EnhancedAvatarV2Props {
  user: User | UIUser | AvatarUser | null | undefined;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showStatus?: boolean;
  status?: 'online' | 'away' | 'busy' | 'offline';
  fallbackName?: string;
  onError?: (error: AvatarLoadError) => void;
  onRetry?: (url: string, attempt: number) => void;
  maxRetries?: number;
  retryDelay?: number;
  enableRetry?: boolean;
  showLoadingState?: boolean;
  showErrorIndicator?: boolean;
  onClick?: () => void;
  'aria-label'?: string;
}

// Size configurations with consistent scaling
const sizeConfig = {
  sm: {
    avatar: 'h-8 w-8',
    text: 'text-xs',
    status: 'h-2.5 w-2.5',
    statusPosition: 'bottom-0 right-0',
    loader: 'h-3 w-3',
    errorIcon: 'h-3 w-3'
  },
  md: {
    avatar: 'h-12 w-12',
    text: 'text-sm',
    status: 'h-3 w-3',
    statusPosition: 'bottom-0 right-0',
    loader: 'h-4 w-4',
    errorIcon: 'h-4 w-4'
  },
  lg: {
    avatar: 'h-16 w-16',
    text: 'text-base',
    status: 'h-3.5 w-3.5',
    statusPosition: 'bottom-0.5 right-0.5',
    loader: 'h-5 w-5',
    errorIcon: 'h-5 w-5'
  },
  xl: {
    avatar: 'h-24 w-24',
    text: 'text-lg',
    status: 'h-4 w-4',
    statusPosition: 'bottom-1 right-1',
    loader: 'h-6 w-6',
    errorIcon: 'h-6 w-6'
  }
};

// Status color mapping
const statusColors = {
  online: 'bg-emerald-500 border-emerald-600',
  away: 'bg-amber-500 border-amber-600',
  busy: 'bg-rose-500 border-rose-600',
  offline: 'bg-gray-400 border-gray-500',
};

// Loading states
type LoadingState = 'idle' | 'loading' | 'loaded' | 'error' | 'retrying';

export function EnhancedAvatarV2({
  user,
  size = 'md',
  className,
  showStatus = false,
  status,
  fallbackName,
  onError,
  onRetry,
  maxRetries = 2,
  retryDelay = 1000,
  enableRetry = true,
  showLoadingState = true,
  showErrorIndicator = false,
  onClick,
  'aria-label': ariaLabel,
}: EnhancedAvatarV2Props) {
  // State management
  const [loadingState, setLoadingState] = useState<LoadingState>('idle');
  const [currentAttempt, setCurrentAttempt] = useState(0);
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [retryTimeoutId, setRetryTimeoutId] = useState<NodeJS.Timeout | null>(null);

  // Get configuration for current size
  const config = sizeConfig[size];

  // Get user display information
  const displayName = fallbackName || user?.displayName || (user as any)?.name || 'User';
  const initials = getUserInitials(displayName);
  const userColor = getUserColor(displayName);
  const userStatus = status || (user as any)?.status;
  const userId = String((user as any)?.id || 'unknown');

  // Initialize avatar URL and determine if it's a data URI
  useEffect(() => {
    const url = getAvatarUrl(user);
    setAvatarUrl(url);
    
    // If it's a data URI (generated avatar), mark as loaded immediately
    if (url.startsWith('data:')) {
      setLoadingState('loaded');
    } else {
      setLoadingState('loading');
    }
    
    // Reset retry state when user changes
    setCurrentAttempt(0);
    
    // Clear any existing retry timeout
    if (retryTimeoutId) {
      clearTimeout(retryTimeoutId);
      setRetryTimeoutId(null);
    }
  }, [user, retryTimeoutId]);

  // Handle successful image load
  const handleImageLoad = useCallback(() => {
    setLoadingState('loaded');
    setCurrentAttempt(0);
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`[EnhancedAvatarV2] Successfully loaded avatar for ${displayName}`);
    }
  }, [displayName]);

  // Handle image load error with retry logic
  const handleImageError = useCallback((event: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const canRetry = enableRetry && currentAttempt < maxRetries;
    
    if (canRetry) {
      setLoadingState('retrying');
      setCurrentAttempt(prev => prev + 1);
      
      // Call retry callback if provided
      if (onRetry) {
        onRetry(avatarUrl, currentAttempt + 1);
      }
      
      // Schedule retry after delay
      const timeoutId = setTimeout(() => {
        setLoadingState('loading');
        
        // Add cache-busting parameter for retry
        const url = new URL(avatarUrl, window.location.origin);
        url.searchParams.set('retry', (currentAttempt + 1).toString());
        url.searchParams.set('t', Date.now().toString());
        setAvatarUrl(url.toString());
      }, retryDelay);
      
      setRetryTimeoutId(timeoutId);
    } else {
      // Max retries reached or retry disabled
      setLoadingState('error');
      
      // Create error object
      const avatarError: AvatarLoadError = {
        userId,
        url: avatarUrl,
        errorType: 'network',
        timestamp: new Date(),
        userAgent: navigator.userAgent,
        additionalInfo: {
          attempts: currentAttempt + 1,
          maxRetries,
          event: event.type
        }
      };
      
      // Log the error
      logAvatarLoadError(avatarError);
      
      // Call error callback if provided
      if (onError) {
        onError(avatarError);
      }
      
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[EnhancedAvatarV2] Failed to load avatar for ${displayName} after ${currentAttempt + 1} attempts`);
      }
    }
  }, [
    enableRetry, 
    currentAttempt, 
    maxRetries, 
    onRetry, 
    avatarUrl, 
    retryDelay, 
    userId, 
    onError, 
    displayName
  ]);

  // Manual retry function
  const handleManualRetry = useCallback(() => {
    if (loadingState === 'error') {
      setLoadingState('loading');
      setCurrentAttempt(0);
      
      // Generate new cache-busting URL
      const url = new URL(avatarUrl, window.location.origin);
      url.searchParams.set('manual_retry', Date.now().toString());
      setAvatarUrl(url.toString());
    }
  }, [loadingState, avatarUrl]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutId) {
        clearTimeout(retryTimeoutId);
      }
    };
  }, [retryTimeoutId]);

  // Render loading state
  const renderLoadingState = () => {
    if (!showLoadingState) return null;
    
    return (
      <div className="flex items-center justify-center h-full w-full bg-muted/50">
        <Loader2 className={cn('animate-spin text-muted-foreground', config.loader)} />
      </div>
    );
  };

  // Render retry state
  const renderRetryState = () => {
    return (
      <div className="flex items-center justify-center h-full w-full bg-muted/50">
        <RefreshCw className={cn('animate-spin text-muted-foreground', config.loader)} />
      </div>
    );
  };

  // Render error state
  const renderErrorState = () => {
    return (
      <div 
        className="flex items-center justify-center h-full w-full text-white cursor-pointer"
        style={{ backgroundColor: userColor }}
        onClick={handleManualRetry}
        title="Click to retry loading avatar"
      >
        <span className={cn('font-medium select-none', config.text)}>
          {initials}
        </span>
      </div>
    );
  };

  // Render fallback initials
  const renderFallback = () => {
    return (
      <div 
        className="flex items-center justify-center h-full w-full text-white"
        style={{ backgroundColor: userColor }}
      >
        <span className={cn('font-medium select-none', config.text)}>
          {initials}
        </span>
      </div>
    );
  };

  // Determine what to render based on loading state
  const renderAvatarContent = () => {
    // For data URIs (generated avatars), always show the image
    if (avatarUrl.startsWith('data:')) {
      return (
        <>
          <AvatarImage
            src={avatarUrl}
            alt={displayName}
            className="select-none"
          />
          <AvatarFallback className="bg-transparent">
            {renderFallback()}
          </AvatarFallback>
        </>
      );
    }

    // For external URLs, handle different loading states
    switch (loadingState) {
      case 'loading':
        return (
          <>
            <AvatarImage
              src={avatarUrl}
              alt={displayName}
              onLoad={handleImageLoad}
              onError={handleImageError}
              className="select-none"
            />
            <AvatarFallback className="bg-transparent">
              {renderLoadingState()}
            </AvatarFallback>
          </>
        );
        
      case 'loaded':
        return (
          <>
            <AvatarImage
              src={avatarUrl}
              alt={displayName}
              onError={handleImageError}
              className="select-none"
            />
            <AvatarFallback className="bg-transparent">
              {renderFallback()}
            </AvatarFallback>
          </>
        );
        
      case 'retrying':
        return (
          <AvatarFallback className="bg-transparent">
            {renderRetryState()}
          </AvatarFallback>
        );
        
      case 'error':
        return (
          <AvatarFallback className="bg-transparent">
            {renderErrorState()}
          </AvatarFallback>
        );
        
      default:
        return (
          <AvatarFallback className="bg-transparent">
            {renderFallback()}
          </AvatarFallback>
        );
    }
  };

  return (
    <div className="relative inline-block">
      <Avatar 
        className={cn(
          config.avatar,
          'border border-border transition-all duration-200',
          onClick && 'hover:ring-2 hover:ring-primary/50 cursor-pointer',
          className
        )}
        onClick={onClick}
        aria-label={ariaLabel || `${displayName}'s avatar`}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={onClick ? (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        } : undefined}
      >
        {renderAvatarContent()}
      </Avatar>

      {/* Status indicator */}
      {showStatus && userStatus && (
        <span
          className={cn(
            'absolute rounded-full border-2 border-background',
            config.status,
            config.statusPosition,
            statusColors[userStatus as keyof typeof statusColors] || statusColors.offline
          )}
          aria-hidden="true"
        />
      )}

      {/* Error indicator (development only) */}
      {process.env.NODE_ENV === 'development' && showErrorIndicator && loadingState === 'error' && (
        <div className="absolute -top-1 -right-1">
          <AlertCircle className={cn('text-red-500', config.errorIcon)} />
        </div>
      )}

      {/* Retry indicator (development only) */}
      {process.env.NODE_ENV === 'development' && loadingState === 'retrying' && (
        <div className="absolute -top-1 -left-1">
          <RefreshCw className={cn('text-blue-500 animate-spin', config.errorIcon)} />
        </div>
      )}
    </div>
  );
}

// Export with a more convenient name
export { EnhancedAvatarV2 as EnhancedAvatar };