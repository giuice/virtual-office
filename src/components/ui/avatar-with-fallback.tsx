'use client';

import React, { useState, useEffect } from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { logAvatarDiagnostics, testAvatarUrlAccess } from '@/lib/avatar-debug';

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
  const [urlDiagnostics, setUrlDiagnostics] = useState<any>(null);
  const [cacheKey, setCacheKey] = useState<string>(Date.now().toString());

  // Use effect to clear cache and retry loading on specific failures
  useEffect(() => {
    // Only run this for real image URLs (skip for data URIs)
    if (src && !src.startsWith('data:') && hasError) {
      // Set a retry timer for problematic URLs
      const retryTimer = setTimeout(() => {
        if (process.env.NODE_ENV === 'development') {
          console.log(`[Avatar] Attempting to reload avatar for ${alt} after error`);
        }
        setCacheKey(Date.now().toString());
        setHasError(false);
        setIsLoading(true);
      }, 3000); // 3 second retry
      
      return () => clearTimeout(retryTimer);
    }
  }, [src, hasError, alt]);
  
  // Use localStorage to cache success/failure status of avatar URLs
  useEffect(() => {
    if (!src || src.startsWith('data:')) return;
    
    // Check if this URL has previously failed
    const cacheKey = `avatar_status_${src}`;
    const cachedStatus = typeof window !== 'undefined' ? localStorage.getItem(cacheKey) : null;
    
    if (cachedStatus === 'error' && !hasError) {
      // Previously failed URL, pre-emptively mark as error
      if (process.env.NODE_ENV === 'development') {
        console.log(`[Avatar] Using cached error status for ${alt}`);
      }
      setHasError(true);
      setIsLoading(false);
    }
    
    // Update localStorage when status changes
    if (hasError && !isLoading) {
      if (typeof window !== 'undefined') {
        localStorage.setItem(cacheKey, 'error');
      }
    } else if (!hasError && !isLoading && src) {
      if (typeof window !== 'undefined') {
        localStorage.setItem(cacheKey, 'success');
      }
    }
  }, [src, hasError, isLoading, alt]);

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
  
  // Add cache busting for Supabase storage URLs
  const getImageUrl = () => {
    if (!src) return '';
    
    // Add cache-busting for Supabase storage URLs (to help diagnose caching issues)
    if (src.includes('supabase.co/storage') && !src.includes('?')) {
      return `${src}?t=${cacheKey}`;
    }
    
    return src;
  };

  // Handler for image load success
  const handleLoad = () => {
    setIsLoading(false);
    setHasError(false);
    onLoad?.();
    
    // Clear any cached error status
    if (src && typeof window !== 'undefined') {
      localStorage.setItem(`avatar_status_${src}`, 'success');
    }
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Avatar] Successfully loaded avatar for ${alt}`);
    }
  };

  // Handler for image load failure
  const handleError = () => {
    setIsLoading(false);
    setHasError(true);
    onError?.();
    
    // Cache error status for faster fallback in future
    if (src && typeof window !== 'undefined') {
      localStorage.setItem(`avatar_status_${src}`, 'error');
    }
    
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[Avatar] Failed to load avatar for ${alt} from ${src}`);
      
      // Log detailed diagnostics about the URL if it just failed
      if (src) {
        const diagnostics = logAvatarDiagnostics(src, 'unknown', 'AvatarWithFallback');
        console.warn(`[Avatar] URL diagnostics:`, diagnostics);
      }
    }
  };
  
  // Check if avatar URL is from a third-party (not Supabase) to add special handling
  const isThirdPartyAvatar = src && !src.startsWith('data:') && !src.includes('supabase.co/storage');

  return (
    <Avatar className={cn(sizeClasses[size], 'border border-border', className)}>
      {src && !hasError ? (
        <AvatarImage
          src={getImageUrl()}
          alt={alt}
          onLoad={handleLoad}
          onError={handleError}
          className="object-cover"
          crossOrigin={isThirdPartyAvatar ? 'anonymous' : undefined} // Add cross-origin handling for external URLs
          loading="eager" // Prioritize avatar loading
          referrerPolicy="no-referrer" // Prevent referrer leaks
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
      
      {/* Dev-only indicator for problematic URLs */}
      {process.env.NODE_ENV === 'development' && 
       src?.includes('supabase.co/storage') && 
       hasError && (
        <div className="absolute inset-0 border-2 border-red-500 rounded-full opacity-60 pointer-events-none" 
             title="Avatar URL failed to load" />
      )}
      
      {/* Dev-only indicator for third-party URLs */}
      {process.env.NODE_ENV === 'development' && 
       isThirdPartyAvatar && !hasError && (
        <div className="absolute -top-1 -right-1 h-2 w-2 bg-yellow-400 rounded-full" 
             title="Third-party avatar URL" />
      )}
    </Avatar>
  );
}
