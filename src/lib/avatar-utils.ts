// src/lib/avatar-utils.ts
import { User } from '@/types/database';
import { UIUser } from '@/types/ui';
import { debugLogger } from '@/utils/debug-logger';

// Avatar cache configuration
const AVATAR_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_RETRY_ATTEMPTS = 2;
const RETRY_DELAY = 1000; // 1 second

// In-memory cache for avatar URLs
interface CachedAvatar {
  url: string;
  timestamp: number;
  userId: string;
  version?: string; // For cache busting
}

class AvatarCache {
  private cache = new Map<string, CachedAvatar>();
  private retryAttempts = new Map<string, number>();
  
  get(userId: string): string | null {
    const cached = this.cache.get(userId);
    if (!cached) {
      // debugLogger.avatar.cache('miss', userId);
      return null;
    }
    
    // Check if cache is expired
    if (Date.now() - cached.timestamp > AVATAR_CACHE_TTL) {
      this.cache.delete(userId);
      // debugLogger.avatar.cache('invalidate', userId, { reason: 'expired' });
      return null;
    }
    
    // debugLogger.avatar.cache('hit', userId, { 
    //   url: cached.url.substring(0, 50) + (cached.url.length > 50 ? '...' : ''),
    //   age: Date.now() - cached.timestamp 
    // });
    return cached.url;
  }
  
  set(userId: string, url: string, version?: string): void {
    this.cache.set(userId, {
      url,
      timestamp: Date.now(),
      userId,
      version
    });
    // debugLogger.avatar.cache('set', userId, { 
    //   url: url.substring(0, 50) + (url.length > 50 ? '...' : ''),
    //   version 
    // });
  }
  
  invalidate(userId: string): void {
    this.cache.delete(userId);
    this.retryAttempts.delete(userId);
    // debugLogger.avatar.cache('invalidate', userId, { reason: 'manual' });
  }
  
  invalidateAll(): void {
    this.cache.clear();
    this.retryAttempts.clear();
    // debugLogger.log('Avatar', 'Invalidated all avatar cache');
  }
  
  getRetryCount(userId: string): number {
    return this.retryAttempts.get(userId) || 0;
  }
  
  incrementRetryCount(userId: string): number {
    const current = this.getRetryCount(userId);
    const newCount = current + 1;
    this.retryAttempts.set(userId, newCount);
    return newCount;
  }
  
  resetRetryCount(userId: string): void {
    this.retryAttempts.delete(userId);
  }
  
  // Get cache statistics for debugging
  getStats(): { size: number; entries: Array<{ userId: string; age: number; url: string }> } {
    const now = Date.now();
    const entries = Array.from(this.cache.entries()).map(([userId, cached]) => ({
      userId,
      age: now - cached.timestamp,
      url: cached.url.substring(0, 50) + (cached.url.length > 50 ? '...' : '')
    }));
    
    return { size: this.cache.size, entries };
  }
}

// Global avatar cache instance
const avatarCache = new AvatarCache();

// Interface for all possible user-like objects with avatar properties
export interface AvatarUser {
  id?: string | number;
  displayName?: string;
  name?: string;
  avatarUrl?: string;
  avatar?: string;
  photoURL?: string;
  status?: string;
}

// Avatar loading error types for better debugging
export interface AvatarLoadError {
  userId: string;
  url: string;
  errorType: 'network' | 'permission' | 'not_found' | 'invalid_format' | 'cors' | 'timeout';
  timestamp: Date;
  userAgent?: string;
  additionalInfo?: any;
}

// Generate a consistent color based on user name
export function getUserColor(name: string): string {
  // Provide a default if name is empty or invalid
  if (!name || typeof name !== 'string' || name.trim() === '') {
    return 'hsl(210, 70%, 80%)'; // Default blue-ish color
  }
  
  // Simple hash function to generate a number from a string
  const hash = name.split('').reduce((acc, char) => {
    return char.charCodeAt(0) + ((acc << 5) - acc);
  }, 0);
  
  // Use the hash to generate a hue (0-360)
  const hue = Math.abs(hash) % 360;
  
  // Return a pastel-ish color in HSL format
  return `hsl(${hue}, 70%, 80%)`;
}

// Get user initials for avatar fallback
export function getUserInitials(name: string): string {
  // Handle empty or invalid input
  if (!name || typeof name !== 'string' || name.trim() === '') {
    return 'U'; // Default fallback for "User"
  }
  
  return name
    .split(' ')
    .map(part => part.charAt(0))
    .join('')
    .toUpperCase();
}

// Generate a data URI for a colored avatar with initials
export function generateAvatarDataUri(user: AvatarUser): string {
  // Get the user's name from either displayName or name property
  const userName = user?.displayName || user?.name || '';
  
  // Handle case where user might be null or user name is empty
  if (!userName) {
    const defaultSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <rect width="100" height="100" fill="hsl(210, 70%, 80%)" />
        <text x="50" y="50" font-family="Arial" font-size="40" font-weight="bold" fill="#ffffff" text-anchor="middle" dominant-baseline="central">
          U
        </text>
      </svg>
    `;
    return `data:image/svg+xml;base64,${btoa(defaultSvg)}`;
  }
  
  const initials = getUserInitials(userName);
  const color = getUserColor(userName);
  
  // Create an SVG string
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <rect width="100" height="100" fill="${color}" />
      <text x="50" y="50" font-family="Arial" font-size="40" font-weight="bold" fill="#ffffff" text-anchor="middle" dominant-baseline="central">
        ${initials}
      </text>
    </svg>
  `;
  
  // Convert SVG to a data URI
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

// Enhanced debug helper to trace avatar resolution with better logging
function debugAvatarResolution(user: any, source: string, value: string | null | undefined) {
  const userId = user?.id || 'unknown';
  // debugLogger.trace('Avatar', `User ${userId} - Checking ${source}: ${value ? 'Found' : 'Not found'}`);
  
  if (value) {
    // debugLogger.log('Avatar', `User ${userId} - Using ${source}`, {
    //   url: value.substring(0, 100) + (value.length > 100 ? '...' : ''),
    //   fullUrl: value
    // });
  }
}

// Enhanced avatar resolution tracking for comprehensive debugging
function trackAvatarResolution(user: any, sources: Array<{ source: string; url: string | null; selected: boolean }>) {
  const userId = String(user?.id || 'unknown');
  // debugLogger.avatar.resolution(userId, sources);
}

// Log avatar loading failures with detailed information
export function logAvatarLoadError(error: AvatarLoadError) {
  debugLogger.error('Avatar', `Avatar load failed for user ${error.userId}`, {
    url: error.url,
    errorType: error.errorType,
    timestamp: error.timestamp.toISOString(),
    userAgent: error.userAgent || navigator?.userAgent,
    additionalInfo: error.additionalInfo
  });
  
  // Also log to console in development for immediate visibility
  if (process.env.NODE_ENV === 'development') {
    console.group(`🖼️ Avatar Load Error - User ${error.userId}`);
    console.error(`URL: ${error.url}`);
    console.error(`Type: ${error.errorType}`);
    console.error(`Time: ${error.timestamp.toISOString()}`);
    if (error.additionalInfo) {
      console.error('Additional Info:', error.additionalInfo);
    }
    console.groupEnd();
  }
}

// Enhanced URL validation with better Supabase storage URL handling
function isValidAvatarUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string' || url.trim() === '') return false;
  
  // Skip placeholder URLs
  if (url.startsWith('/api/placeholder') || url.includes('placeholder')) return false;
  
  // Skip empty or whitespace-only URLs
  if (url.trim() === '') return false;
  
  // Check for data URIs (generated avatars)
  if (url.startsWith('data:')) return true;
  
  // Check for relative paths
  if (url.startsWith('/')) return true;
  
  // Check if it's a valid absolute URL
  try {
    const parsedUrl = new URL(url);
    
    // Additional validation for common avatar URL patterns
    const validProtocols = ['http:', 'https:'];
    if (!validProtocols.includes(parsedUrl.protocol)) {
      return false;
    }
    
    // Check for common image file extensions or known avatar services
    const pathname = parsedUrl.pathname.toLowerCase();
    const isImageFile = /\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i.test(pathname);
    const isKnownService = [
      'supabase.co',
      'googleapis.com',
      'googleusercontent.com',
      'gravatar.com',
      'github.com',
      'githubusercontent.com',
      'example.com' // For testing
    ].some(domain => parsedUrl.hostname.includes(domain));
    
    return isImageFile || isKnownService || pathname.includes('avatar') || pathname.includes('photo');
  } catch {
    return false;
  }
}

// Enhanced avatar URL validation with comprehensive error logging
function validateAndLogAvatarUrl(url: string | null | undefined, source: string, userId?: string): string | null {
  if (!isValidAvatarUrl(url)) {
    if (url) {
      debugLogger.warn('Avatar', `Invalid ${source} URL for user ${userId || 'unknown'}`, {
        url,
        source,
        userId,
        reason: 'URL validation failed'
      });
      
      // Log specific validation failure reasons
      if (typeof url === 'string') {
        if (url.includes('placeholder')) {
          debugLogger.trace('Avatar', `Skipping placeholder URL: ${url}`);
        } else if (url.trim() === '') {
          debugLogger.trace('Avatar', 'Skipping empty URL');
        } else {
          debugLogger.trace('Avatar', `URL format validation failed: ${url}`);
        }
      }
    }
    return null;
  }
  
  return url!;
}

// Enhanced function to detect and handle Supabase storage URLs specifically
function fixSupabaseStorageUrl(url: string): string {
  // If it's already a valid Supabase storage URL, return as-is
  if (url.includes('supabase.co') && url.includes('/storage/v1/object/public/')) {
    return url;
  }
  
  // Handle cases where the URL might be malformed or missing parts
  if (url.includes('supabase.co') && !url.includes('/storage/v1/object/public/')) {
    // debugLogger.warn('Avatar', 'Potentially malformed Supabase storage URL', { url });
  }
  
  return url;
}

/**
 * Get avatar URL with enhanced fallback handling and Google avatar support
 * 
 * Follows priority order as per requirements:
 * 1. Database avatarUrl (custom uploaded avatar - highest priority)
 * 2. Google OAuth photoURL (for Google authenticated users)
 * 3. Legacy avatar field (backward compatibility)
 * 4. Generate default avatar with initials (lowest priority)
 */
export function getAvatarUrl(user: User | UIUser | AvatarUser  | null | undefined): string {
  const startTime = performance.now();
  
  // Handle null or undefined user
  if (!user) {
    debugAvatarResolution(user, 'user', null);
    // debugLogger.trace('Avatar', 'No user provided, generating default avatar');
    const fallback = generateAvatarDataUri({ name: '' });
    // debugLogger.avatar.fallback('unknown', 'No user provided');
    return fallback;
  }
  
  const userId = String((user as any).id || 'unknown');
  // debugLogger.trace('Avatar', `Resolving avatar for user ${userId}`);
  
  // Track all resolution attempts for debugging
  const resolutionSources: Array<{ source: string; url: string | null; selected: boolean }> = [];
  
  // Priority 1: Database avatarUrl (custom uploaded avatar - highest priority)
  //debugAvatarResolution(user, 'avatarUrl', user.avatarUrl);
  const avatarUrl = user.avatarUrl;
  resolutionSources.push({ source: 'avatarUrl', url: avatarUrl || null, selected: false });
  
  if (avatarUrl) {
    const validatedAvatarUrl = validateAndLogAvatarUrl(avatarUrl, 'avatarUrl', userId);
    if (validatedAvatarUrl) {
      const fixedUrl = fixSupabaseStorageUrl(validatedAvatarUrl);
      resolutionSources[resolutionSources.length - 1].selected = true;
      trackAvatarResolution(user, resolutionSources);
      
      const duration = performance.now() - startTime;
      // debugLogger.avatar.performance(userId, 'getAvatarUrl', duration, { source: 'avatarUrl' });
      // debugLogger.avatar.loadSuccess(userId, fixedUrl, 'custom upload');
      
      return fixedUrl;
    }
  }
  
  // Priority 2: Google OAuth photoURL (for Google authenticated users)
  const photoURL = (user as any).photoURL;
  //debugAvatarResolution(user, 'photoURL', photoURL);
  resolutionSources.push({ source: 'photoURL', url: photoURL || null, selected: false });
  
  if (photoURL) {
    const validatedPhotoUrl = validateAndLogAvatarUrl(photoURL, 'photoURL', userId);
    if (validatedPhotoUrl) {
      resolutionSources[resolutionSources.length - 1].selected = true;
      trackAvatarResolution(user, resolutionSources);
      
      // const duration = performance.now() - startTime;
      // debugLogger.avatar.performance(userId, 'getAvatarUrl', duration, { source: 'photoURL' });
      // debugLogger.avatar.loadSuccess(userId, validatedPhotoUrl, 'Google OAuth');
      
      return validatedPhotoUrl;
    }
  }
  
  // Priority 3: Legacy avatar field (backward compatibility)
  const legacyAvatar = (user as any).avatar;
  //debugAvatarResolution(user, 'avatar', legacyAvatar);
  resolutionSources.push({ source: 'avatar', url: legacyAvatar || null, selected: false });
  
  if (legacyAvatar) {
    const validatedLegacyAvatar = validateAndLogAvatarUrl(legacyAvatar, 'avatar', userId);
    if (validatedLegacyAvatar) {
      const fixedUrl = fixSupabaseStorageUrl(validatedLegacyAvatar);
      resolutionSources[resolutionSources.length - 1].selected = true;
      trackAvatarResolution(user, resolutionSources);
      
      // const duration = performance.now() - startTime;
      // debugLogger.avatar.performance(userId, 'getAvatarUrl', duration, { source: 'legacy' });
      // debugLogger.avatar.loadSuccess(userId, fixedUrl, 'legacy field');
      
      return fixedUrl;
    }
  }
  
  // Priority 4: Generate default avatar with initials (lowest priority)
  debugAvatarResolution(user, 'generateAvatarDataUri', 'Generating default avatar');
  resolutionSources.push({ source: 'fallback', url: 'generated', selected: true });
  trackAvatarResolution(user, resolutionSources);
  
  const fallbackAvatar = generateAvatarDataUri({ 
    displayName: user.displayName || (user as any).name || '',
    name: (user as any).name || user.displayName || ''
  });
  
  // const duration = performance.now() - startTime;
  // debugLogger.avatar.performance(userId, 'getAvatarUrl', duration, { source: 'fallback' });
  // debugLogger.avatar.fallback(userId, 'No valid avatar URLs found', {
  //   checkedSources: resolutionSources.length - 1
  // });
  
  return fallbackAvatar;
}

/**
 * Enhanced avatar URL getter with caching, retry logic and comprehensive error handling
 * This function provides additional debugging and error tracking capabilities
 */
export function getAvatarUrlWithFallback(
  user: User | UIUser | AvatarUser | null | undefined,
  options: {
    onError?: (error: AvatarLoadError) => void;
    onRetry?: (url: string, attempt: number) => void;
    enableRetry?: boolean;
    enableCache?: boolean;
    cacheVersion?: string; // For cache busting
  } = {}
): string {
  const userId = String((user as any)?.id || 'unknown');
  const { enableCache = true, cacheVersion } = options;
  
  // Check cache first if enabled
  if (enableCache) {
    const cachedUrl = avatarCache.get(userId);
    if (cachedUrl) {
      debugLogger.trace('Avatar', `Using cached avatar for user ${userId}`);
      return cachedUrl;
    }
  }
  
  const avatarUrl = getAvatarUrl(user);
  
  // If it's a data URI (generated avatar), cache and return immediately
  if (avatarUrl.startsWith('data:')) {
    if (enableCache) {
      avatarCache.set(userId, avatarUrl, cacheVersion);
    }
    // debugLogger.trace('Avatar', `Returning generated avatar for user ${userId}`);
    return avatarUrl;
  }
  
  // For external URLs, cache and prepare for potential error handling
  if (enableCache) {
    avatarCache.set(userId, avatarUrl, cacheVersion);
  }
  
  // debugLogger.trace('Avatar', `Returning external avatar URL for user ${userId}`, { url: avatarUrl });
  
  // Components using this function should call handleAvatarLoadError on image load failures
  return avatarUrl;
}

/**
 * Enhanced avatar URL getter with built-in retry mechanism
 * This function attempts to load the avatar with retry logic
 */
export async function getAvatarUrlWithRetry(
  user: User | UIUser | AvatarUser | null | undefined,
  options: {
    onError?: (error: AvatarLoadError) => void;
    onRetry?: (url: string, attempt: number) => void;
    enableCache?: boolean;
    cacheVersion?: string;
    maxRetries?: number;
    retryDelay?: number;
  } = {}
): Promise<string> {
  const userId = String((user as any)?.id || 'unknown');
  const { 
    maxRetries = MAX_RETRY_ATTEMPTS, 
    retryDelay = RETRY_DELAY,
    enableCache = true,
    cacheVersion,
    onError,
    onRetry
  } = options;
  
  // Get the avatar URL (with caching if enabled)
  const avatarUrl = getAvatarUrlWithFallback(user, { enableCache, cacheVersion });
  
  // If it's a data URI (generated avatar), return immediately
  if (avatarUrl.startsWith('data:')) {
    return avatarUrl;
  }
  
  // For external URLs, attempt to validate with retry logic
  let lastError: Error | null = null;
  const currentRetryCount = avatarCache.getRetryCount(userId);
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Attempt to validate the URL by creating an Image object
      await validateImageUrl(avatarUrl);
      
      // Success - reset retry count and return URL
      avatarCache.resetRetryCount(userId);
      // debugLogger.log('Avatar', `Avatar URL validated successfully for user ${userId}`, { 
      //   url: avatarUrl, 
      //   attempt: attempt + 1 
      // });
      return avatarUrl;
      
    } catch (error) {
      lastError = error as Error;
      
      //const retryCount = avatarCache.incrementRetryCount(userId);
      
      // debugLogger.avatar.retry(userId, avatarUrl, attempt + 1, maxRetries);
      // debugLogger.warn('Avatar', `Avatar load attempt ${attempt + 1} failed for user ${userId}`, {
      //   url: avatarUrl,
      //   error: lastError.message,
      //   totalRetries: retryCount
      // });
      
      // Call retry callback if provided
      if (onRetry) {
        onRetry(avatarUrl, attempt + 1);
      }
      
      // If this isn't the last attempt, wait before retrying
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }
  
  // All retry attempts failed - log error and return fallback
  const avatarError: AvatarLoadError = {
    userId,
    url: avatarUrl,
    errorType: 'network',
    timestamp: new Date(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    additionalInfo: {
      maxRetries,
      finalError: lastError?.message,
      totalRetryCount: avatarCache.getRetryCount(userId)
    }
  };
  
  logAvatarLoadError(avatarError);
  
  if (onError) {
    onError(avatarError);
  }
  
  // Return fallback avatar
  const fallbackAvatar = generateAvatarDataUri({ 
    displayName: user?.displayName || (user as any)?.name || '',
    name: (user as any)?.name || user?.displayName || ''
  });
  
  // Cache the fallback to avoid repeated failures
  if (enableCache) {
    avatarCache.set(userId, fallbackAvatar, cacheVersion);
  }
  
  // debugLogger.log('Avatar', `Using fallback avatar after retry failures for user ${userId}`);
  return fallbackAvatar;
}

/**
 * Validate an image URL by attempting to load it
 */
function validateImageUrl(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // For server-side rendering, skip validation
    if (typeof window === 'undefined') {
      resolve();
      return;
    }
    
    const img = new Image();
    const timeout = setTimeout(() => {
      reject(new Error('Image load timeout'));
    }, 10000); // 10 second timeout
    
    img.onload = () => {
      clearTimeout(timeout);
      resolve();
    };
    
    img.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('Image failed to load'));
    };
    
    // Add timestamp to bust cache if needed
    const urlWithCacheBust = url.includes('?') 
      ? `${url}&_t=${Date.now()}` 
      : `${url}?_t=${Date.now()}`;
    
    img.src = urlWithCacheBust;
  });
}

/**
 * Handle avatar loading errors with comprehensive logging and fallback
 * This should be called by components when an avatar image fails to load
 */
export function handleAvatarLoadError(
  user: User | UIUser | AvatarUser | null | undefined,
  failedUrl: string,
  errorEvent?: Event | Error,
  options: {
    onError?: (error: AvatarLoadError) => void;
    generateFallback?: boolean;
  } = {}
): string {
  const userId = String((user as any)?.id || 'unknown');
  
  // Determine error type based on the error event or URL characteristics
  let errorType: AvatarLoadError['errorType'] = 'network';
  let additionalInfo: any = {};
  
  if (errorEvent) {
    if (errorEvent instanceof Error) {
      additionalInfo.message = errorEvent.message;
      additionalInfo.stack = errorEvent.stack;
      
      if (errorEvent.message.includes('CORS')) {
        errorType = 'cors';
      } else if (errorEvent.message.includes('timeout')) {
        errorType = 'timeout';
      }
    } else if (errorEvent.type === 'error') {
      errorType = 'not_found';
    }
  }
  
  // Check URL characteristics for error type hints
  if (failedUrl.includes('supabase.co')) {
    if (!failedUrl.includes('/storage/v1/object/public/')) {
      errorType = 'invalid_format';
      additionalInfo.reason = 'Malformed Supabase storage URL';
    } else {
      errorType = 'permission';
      additionalInfo.reason = 'Possible RLS or bucket permission issue';
    }
  }
  
  const avatarError: AvatarLoadError = {
    userId,
    url: failedUrl,
    errorType,
    timestamp: new Date(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    additionalInfo
  };
  
  // Log the error
  logAvatarLoadError(avatarError);
  
  // Call custom error handler if provided
  if (options.onError) {
    options.onError(avatarError);
  }
  
  // Return fallback avatar if requested
  if (options.generateFallback !== false) {
    // debugLogger.log('Avatar', `Generating fallback avatar for failed load - user ${userId}`);
    return generateAvatarDataUri({ 
      displayName: user?.displayName || (user as any)?.name || '',
      name: (user as any)?.name || user?.displayName || ''
    });
  }
  
  return failedUrl; // Return original URL if no fallback requested
}

/**
 * Cache management functions for avatar system
 */
export const avatarCacheManager = {
  /**
   * Invalidate cache for a specific user
   */
  invalidateUser: (userId: string): void => {
    avatarCache.invalidate(userId);
  },
  
  /**
   * Invalidate all cached avatars
   */
  invalidateAll: (): void => {
    avatarCache.invalidateAll();
  },
  
  /**
   * Get cache statistics for debugging
   */
  getStats: () => {
    return avatarCache.getStats();
  },
  
  /**
   * Bust cache for a user by updating their avatar with a new version
   */
  bustCache: (userId: string, newVersion?: string): void => {
    avatarCache.invalidate(userId);
    // debugLogger.log('Avatar', `Cache busted for user ${userId}`, { version: newVersion });
  },
  
  /**
   * Pre-warm cache with a known avatar URL
   */
  preWarm: (userId: string, avatarUrl: string, version?: string): void => {
    avatarCache.set(userId, avatarUrl, version);
    // debugLogger.log('Avatar', `Pre-warmed cache for user ${userId}`, { url: avatarUrl });
  }
};

/**
 * Generate cache-busting URL for updated avatars
 */
export function generateCacheBustingUrl(baseUrl: string, version?: string | number): string {
  if (!baseUrl || baseUrl.startsWith('data:')) {
    return baseUrl;
  }
  
  const timestamp = version || Date.now();
  const separator = baseUrl.includes('?') ? '&' : '?';
  const cacheBustUrl = `${baseUrl}${separator}v=${timestamp}`;
  
  // debugLogger.trace('Avatar', 'Generated cache-busting URL', { 
  //   original: baseUrl, 
  //   cacheBusted: cacheBustUrl 
  // });
  
  return cacheBustUrl;
}

/**
 * Enhanced avatar update function with cache invalidation
 */
export function updateAvatarWithCacheBust(
  userId: string, 
  newAvatarUrl: string, 
  options: {
    bustCache?: boolean;
    version?: string | number;
    invalidateRelated?: boolean;
  } = {}
): string {
  const { bustCache = true, version, invalidateRelated = false } = options;
  
  // Invalidate cache for this user
  if (bustCache) {
    avatarCacheManager.invalidateUser(userId);
  }
  
  // Generate cache-busting URL if needed
  const finalUrl = bustCache ? generateCacheBustingUrl(newAvatarUrl, version) : newAvatarUrl;
  
  // Pre-warm cache with new URL
  avatarCache.set(userId, finalUrl, String(version || Date.now()));
  
  // debugLogger.log('Avatar', `Updated avatar for user ${userId}`, {
  //   url: finalUrl,
  //   bustCache,
  //   version
  // });
  
  return finalUrl;
}

/**
 * Enhanced error handling with retry tracking and comprehensive logging
 */
export function handleAvatarLoadErrorWithRetry(
  user: User | UIUser | AvatarUser | null | undefined,
  failedUrl: string,
  errorEvent?: Event | Error,
  options: {
    onError?: (error: AvatarLoadError) => void;
    generateFallback?: boolean;
    enableRetry?: boolean;
    maxRetries?: number;
  } = {}
): string {
  const userId = String((user as any)?.id || 'unknown');
  const { enableRetry = true, maxRetries = MAX_RETRY_ATTEMPTS } = options;
  
  // Check if we should attempt retry
  const currentRetryCount = avatarCache.getRetryCount(userId);
  const shouldRetry = enableRetry && currentRetryCount < maxRetries;
  
  if (shouldRetry) {
    // Increment retry count
    //const newRetryCount = avatarCache.incrementRetryCount(userId);
    
    // debugLogger.warn('Avatar', `Avatar load failed, will retry (${newRetryCount}/${maxRetries})`, {
    //   userId,
    //   url: failedUrl,
    //   retryCount: newRetryCount
    // });
    
    // Invalidate cache to force fresh attempt
    avatarCache.invalidate(userId);
    
    // Return the same URL for retry (component should handle the retry)
    return failedUrl;
  }
  
  // Max retries reached or retry disabled - handle as final error
  return handleAvatarLoadError(user, failedUrl, errorEvent, options);
}

/**
 * Extract Google avatar URL from OAuth user data
 * This function helps with Google OAuth integration
 */
export function extractGoogleAvatarUrl(oauthUser: any): string | null {
  if (!oauthUser) {
    // debugLogger.warn('Avatar', 'No OAuth user data provided for Google avatar extraction');
    return null;
  }
  
  // Try different possible fields where Google avatar might be stored
  const possibleFields = ['picture', 'photoURL', 'photo', 'avatar_url'];
  
  for (const field of possibleFields) {
    const url = oauthUser[field];
    if (url && typeof url === 'string') {
      const validatedUrl = validateAndLogAvatarUrl(url, `google_oauth_${field}`, oauthUser.id);
      if (validatedUrl) {
        // debugLogger.log('Avatar', `Extracted Google avatar from ${field}`, { 
        //   url: validatedUrl,
        //   userId: oauthUser.id 
        // });
        return validatedUrl;
      }
    }
  }
  
  // debugLogger.warn('Avatar', 'No valid Google avatar URL found in OAuth data', { 
  //   availableFields: Object.keys(oauthUser),
  //   userId: oauthUser.id 
  // });
  return null;
}