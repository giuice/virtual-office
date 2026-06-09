'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  status?: 'online' | 'away' | 'busy' | 'offline';
  fallbackName?: string;
  onError?: (error: AvatarLoadError) => void;
  onRetry?: (url: string, attempt: number) => void;
  display?: {
    status?: boolean;
    speaking?: boolean;
    loadingState?: boolean;
    errorIndicator?: boolean;
  };
  retry?: {
    enabled?: boolean;
    maxRetries?: number;
    delay?: number;
  };
  onClick?: () => void;
  'aria-label'?: string;
}

// Size configurations with consistent scaling
const sizeConfig = {
  sm: {
    avatar: 'size-8',
    text: 'text-xs',
    status: 'size-2.5',
    statusPosition: 'bottom-0 right-0',
    loader: 'size-3',
    errorIcon: 'size-3'
  },
  md: {
    avatar: 'size-12',
    text: 'text-sm',
    status: 'size-3',
    statusPosition: 'bottom-0 right-0',
    loader: 'size-4',
    errorIcon: 'size-4'
  },
  lg: {
    avatar: 'size-16',
    text: 'text-base',
    status: 'size-3.5',
    statusPosition: 'bottom-0.5 right-0.5',
    loader: 'size-5',
    errorIcon: 'size-5'
  },
  xl: {
    avatar: 'size-24',
    text: 'text-lg',
    status: 'size-4',
    statusPosition: 'bottom-1 right-1',
    loader: 'size-6',
    errorIcon: 'size-6'
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

interface AvatarVisualStateProps {
  avatarUrl: string;
  displayName: string;
  loadingState: LoadingState;
  showLoadingState: boolean;
  config: typeof sizeConfig[keyof typeof sizeConfig];
  userColor: string;
  initials: string;
  onImageLoad: () => void;
  onImageError: (event: React.SyntheticEvent<HTMLImageElement, Event>) => void;
  onManualRetry: () => void;
}

function AvatarFallbackContent({
  config,
  userColor,
  initials,
}: Pick<AvatarVisualStateProps, 'config' | 'userColor' | 'initials'>) {
  return (
    <div className="flex items-center justify-center size-full text-white" style={{ backgroundColor: userColor }}>
      <span className={cn('font-medium select-none', config.text)}>{initials}</span>
    </div>
  );
}

function AvatarVisualState({
  avatarUrl,
  displayName,
  loadingState,
  showLoadingState,
  config,
  userColor,
  initials,
  onImageLoad,
  onImageError,
  onManualRetry,
}: AvatarVisualStateProps) {
  const fallback = <AvatarFallbackContent config={config} userColor={userColor} initials={initials} />;

  if (avatarUrl.startsWith('data:')) {
    return (
      <>
        <AvatarImage src={avatarUrl} alt={displayName} className="select-none" />
        <AvatarFallback className="bg-transparent">{fallback}</AvatarFallback>
      </>
    );
  }

  if (loadingState === 'loading') {
    return (
      <>
        <AvatarImage
          src={avatarUrl}
          alt={displayName}
          onLoad={onImageLoad}
          onError={onImageError}
          className="select-none"
        />
        <AvatarFallback className="bg-transparent">
          {showLoadingState && (
            <div className="flex items-center justify-center size-full bg-muted/50">
              <Loader2 className={cn('animate-spin text-muted-foreground', config.loader)} />
            </div>
          )}
        </AvatarFallback>
      </>
    );
  }

  if (loadingState === 'loaded') {
    return (
      <>
        <AvatarImage src={avatarUrl} alt={displayName} onError={onImageError} className="select-none" />
        <AvatarFallback className="bg-transparent">{fallback}</AvatarFallback>
      </>
    );
  }

  if (loadingState === 'retrying') {
    return (
      <AvatarFallback className="bg-transparent">
        <div className="flex items-center justify-center size-full bg-muted/50">
          <RefreshCw className={cn('animate-spin text-muted-foreground', config.loader)} />
        </div>
      </AvatarFallback>
    );
  }

  if (loadingState === 'error') {
    return (
      <AvatarFallback className="bg-transparent">
        <button
          type="button"
          className="flex items-center justify-center size-full text-white cursor-pointer"
          style={{ backgroundColor: userColor }}
          onClick={onManualRetry}
          title="Click to retry loading avatar"
        >
          <span className={cn('font-medium select-none', config.text)}>{initials}</span>
        </button>
      </AvatarFallback>
    );
  }

  return <AvatarFallback className="bg-transparent">{fallback}</AvatarFallback>;
}

export function EnhancedAvatarV2({
  user,
  size = 'md',
  className,
  status,
  fallbackName,
  onError,
  onRetry,
  display,
  retry,
  onClick,
  'aria-label': ariaLabel,
}: EnhancedAvatarV2Props) {
  const showStatus = display?.status ?? false;
  const isSpeaking = display?.speaking ?? false;
  const showLoadingState = display?.loadingState ?? true;
  const showErrorIndicator = display?.errorIndicator ?? false;
  const enableRetry = retry?.enabled ?? true;
  const maxRetries = retry?.maxRetries ?? 2;
  const retryDelay = retry?.delay ?? 1000;

  // State management
  const [loadingState, setLoadingState] = useState<LoadingState>(() => {
    const url = getAvatarUrl(user);
    return url.startsWith('data:') ? 'loaded' : 'loading';
  });
  const currentAttemptRef = useRef(0);
  const [avatarUrl, setAvatarUrl] = useState<string>(() => getAvatarUrl(user));
  const previousUserRef = useRef(user);
  const retryTimeoutsRef = useRef<Set<NodeJS.Timeout> | null>(null);
  if (retryTimeoutsRef.current === null) {
    retryTimeoutsRef.current = new Set();
  }
  const retryTimeouts = retryTimeoutsRef.current;

  // Get configuration for current size
  const config = sizeConfig[size];

  // Get user display information
  const displayName = fallbackName || user?.displayName || (user as any)?.name || 'User';
  const initials = getUserInitials(displayName);
  const userColor = getUserColor(displayName);
  const presenceOnline = Boolean((user as any)?.isOnline);
  const hasExplicitStatus = status !== undefined;

  let computedStatus = status || (user as any)?.status;

  if (!hasExplicitStatus) {
    if (presenceOnline) {
      if (!computedStatus || computedStatus === 'offline') {
        computedStatus = 'online';
      }
    } else {
      if (!computedStatus || computedStatus === 'online') {
        computedStatus = 'offline';
      } else if (computedStatus === 'away' || computedStatus === 'busy') {
        computedStatus = 'offline';
      }
    }
  }

  const userStatus = computedStatus;
  const userId = String((user as any)?.id || 'unknown');

  if (previousUserRef.current !== user) {
    const url = getAvatarUrl(user);
    previousUserRef.current = user;
    setAvatarUrl(url);
    setLoadingState(url.startsWith('data:') ? 'loaded' : 'loading');
    currentAttemptRef.current = 0;
    for (const retryTimeout of retryTimeouts) {
      clearTimeout(retryTimeout);
    }
    retryTimeouts.clear();
  }

  // Handle successful image load
  const handleImageLoad = useCallback(() => {
    setLoadingState('loaded');
    currentAttemptRef.current = 0;
    
    if (process.env.NODE_ENV === 'development') {
      // console.log(`[EnhancedAvatarV2] Successfully loaded avatar for ${displayName}`);
    }
  }, []);

  // Handle image load error with retry logic
  const handleImageError = useCallback((event: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const currentAttempt = currentAttemptRef.current;
    const canRetry = enableRetry && currentAttempt < maxRetries;
    
    if (canRetry) {
      setLoadingState('retrying');
      currentAttemptRef.current = currentAttempt + 1;
      
      // Call retry callback if provided
      if (onRetry) {
        onRetry(avatarUrl, currentAttempt + 1);
      }
      
      // Schedule retry after delay
      const timeoutId = setTimeout(() => {
        retryTimeouts.delete(timeoutId);
        setLoadingState('loading');
        
        // Add cache-busting parameter for retry
        const url = new URL(avatarUrl, window.location.origin);
        url.searchParams.set('retry', (currentAttempt + 1).toString());
        url.searchParams.set('t', Date.now().toString());
        setAvatarUrl(url.toString());
      }, retryDelay);
      
      retryTimeouts.add(timeoutId);
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
        // console.warn(`[EnhancedAvatarV2] Failed to load avatar for ${displayName} after ${currentAttempt + 1} attempts`);
      }
    }
  }, [
    enableRetry, 
    maxRetries, 
    onRetry, 
    avatarUrl, 
    retryDelay, 
    retryTimeouts,
    userId, 
    onError, 
  ]);

  // Manual retry function
  const handleManualRetry = useCallback(() => {
    if (loadingState === 'error') {
      setLoadingState('loading');
      currentAttemptRef.current = 0;
      
      // Generate new cache-busting URL
      const url = new URL(avatarUrl, window.location.origin);
      url.searchParams.set('manual_retry', Date.now().toString());
      setAvatarUrl(url.toString());
    }
  }, [loadingState, avatarUrl]);

  // Cleanup timeout on unmount
  useEffect(() => {
    const activeRetryTimeouts = retryTimeouts;
    return () => {
      for (const retryTimeout of activeRetryTimeouts) {
        clearTimeout(retryTimeout);
      }
      activeRetryTimeouts.clear();
    };
  }, [retryTimeouts]);

  return (
    <div className={cn(
      "relative inline-block transition-all duration-vo ease-vo-elastic",
      "hover:-translate-y-1.5 hover:scale-110 hover:z-10 hover:shadow-vo-card-hover",
      isSpeaking && "animate-speaking-pulse z-10"
    )}>
      <Avatar 
        className={cn(
          config.avatar,
          'border-2 border-vo-card-bg transition-all duration-200',
          onClick && 'cursor-pointer',
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
        <AvatarVisualState
          avatarUrl={avatarUrl}
          displayName={displayName}
          loadingState={loadingState}
          showLoadingState={showLoadingState}
          config={config}
          userColor={userColor}
          initials={initials}
          onImageLoad={handleImageLoad}
          onImageError={handleImageError}
          onManualRetry={handleManualRetry}
        />
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
