'use client';

import React, { useState } from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface AvatarWithFallbackProps {
  src?: string | null;
  alt: string;
  className?: string;
  fallbackClassName?: string;
  size?: 'sm' | 'md' | 'lg';
  onLoad?: () => void;
  onError?: () => void;
}

export function AvatarWithFallback({
  src,
  alt,
  className,
  fallbackClassName,
  size = 'md',
  onLoad,
  onError,
}: AvatarWithFallbackProps) {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(!!src);

  // Get initials for fallback
  const getInitials = () => {
    if (!alt) return 'U';
    const words = alt.trim().split(' ');
    if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  };

  // Get size classes
  const sizeClasses = {
    sm: 'h-6 w-6',
    md: 'h-8 w-8',
    lg: 'h-10 w-10',
  };

  // Handler for image load success
  const handleLoad = () => {
    setIsLoading(false);
    setHasError(false);
    onLoad?.();
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Avatar] Successfully loaded avatar for ${alt}`);
    }
  };

  // Handler for image load failure
  const handleError = () => {
    setIsLoading(false);
    setHasError(true);
    onError?.();
    
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[Avatar] Failed to load avatar for ${alt} from ${src}`);
    }
  };

  return (
    <Avatar className={cn(sizeClasses[size], 'border border-border', className)}>
      {src && !hasError ? (
        <AvatarImage
          src={src}
          alt={alt}
          onLoad={handleLoad}
          onError={handleError}
        />
      ) : null}
      
      {/* Show spinner while loading */}
      {isLoading && (
        <AvatarFallback className="animate-pulse bg-muted/50">
          <span className="sr-only">Loading...</span>
        </AvatarFallback>
      )}
      
      {/* Show fallback on error or no image */}
      {(!src || hasError) && !isLoading && (
        <AvatarFallback 
          className={cn(
            'bg-primary/20',
            fallbackClassName
          )}
        >
          {getInitials()}
        </AvatarFallback>
      )}
    </Avatar>
  );
}
