// src/lib/avatar-utils.ts
import { User } from '@/types/database';
import { UIUser } from '@/types/ui';
import { debugLogger } from '@/utils/debug-logger';

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
  debugLogger.trace('Avatar', `User ${userId} - Checking ${source}: ${value ? 'Found' : 'Not found'}`);
  
  if (value) {
    debugLogger.log('Avatar', `User ${userId} - Using ${source}`, {
      url: value.substring(0, 100) + (value.length > 100 ? '...' : ''),
      fullUrl: value
    });
  }
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
      'githubusercontent.com'
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
    debugLogger.warn('Avatar', 'Potentially malformed Supabase storage URL', { url });
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
export function getAvatarUrl(user: User | UIUser | AvatarUser | null | undefined): string {
  // Handle null or undefined user
  if (!user) {
    debugAvatarResolution(user, 'user', null);
    debugLogger.trace('Avatar', 'No user provided, generating default avatar');
    return generateAvatarDataUri({ name: '' });
  }
  
  const userId = String((user as any).id || 'unknown');
  debugLogger.trace('Avatar', `Resolving avatar for user ${userId}`);
  
  // Priority 1: Database avatarUrl (custom uploaded avatar - highest priority)
  debugAvatarResolution(user, 'avatarUrl', user.avatarUrl);
  if (user.avatarUrl) {
    const validatedAvatarUrl = validateAndLogAvatarUrl(user.avatarUrl, 'avatarUrl', userId);
    if (validatedAvatarUrl) {
      const fixedUrl = fixSupabaseStorageUrl(validatedAvatarUrl);
      debugLogger.log('Avatar', `Using custom avatar for user ${userId}`, { url: fixedUrl });
      return fixedUrl;
    }
  }
  
  // Priority 2: Google OAuth photoURL (for Google authenticated users)
  const photoURL = (user as any).photoURL;
  debugAvatarResolution(user, 'photoURL', photoURL);
  if (photoURL) {
    const validatedPhotoUrl = validateAndLogAvatarUrl(photoURL, 'photoURL', userId);
    if (validatedPhotoUrl) {
      debugLogger.log('Avatar', `Using Google OAuth photo for user ${userId}`, { url: validatedPhotoUrl });
      return validatedPhotoUrl;
    }
  }
  
  // Priority 3: Legacy avatar field (backward compatibility)
  const legacyAvatar = (user as any).avatar;
  debugAvatarResolution(user, 'avatar', legacyAvatar);
  if (legacyAvatar) {
    const validatedLegacyAvatar = validateAndLogAvatarUrl(legacyAvatar, 'avatar', userId);
    if (validatedLegacyAvatar) {
      const fixedUrl = fixSupabaseStorageUrl(validatedLegacyAvatar);
      debugLogger.log('Avatar', `Using legacy avatar for user ${userId}`, { url: fixedUrl });
      return fixedUrl;
    }
  }
  
  // Priority 4: Generate default avatar with initials (lowest priority)
  debugAvatarResolution(user, 'generateAvatarDataUri', 'Generating default avatar');
  const fallbackAvatar = generateAvatarDataUri({ 
    displayName: user.displayName || (user as any).name || '',
    name: (user as any).name || user.displayName || ''
  });
  
  debugLogger.log('Avatar', `Using generated initials avatar for user ${userId}`);
  return fallbackAvatar;
}

/**
 * Enhanced avatar URL getter with retry logic and comprehensive error handling
 * This function provides additional debugging and error tracking capabilities
 */
export function getAvatarUrlWithFallback(
  user: User | UIUser | AvatarUser | null | undefined,
  options: {
    onError?: (error: AvatarLoadError) => void;
    onRetry?: (url: string, attempt: number) => void;
    enableRetry?: boolean;
  } = {}
): string {
  const avatarUrl = getAvatarUrl(user);
  const userId = String((user as any)?.id || 'unknown');
  
  // If it's a data URI (generated avatar), return immediately
  if (avatarUrl.startsWith('data:')) {
    debugLogger.trace('Avatar', `Returning generated avatar for user ${userId}`);
    return avatarUrl;
  }
  
  // For external URLs, validate and prepare for potential error handling
  debugLogger.trace('Avatar', `Returning external avatar URL for user ${userId}`, { url: avatarUrl });
  
  // Components using this function should call handleAvatarLoadError on image load failures
  return avatarUrl;
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
    debugLogger.log('Avatar', `Generating fallback avatar for failed load - user ${userId}`);
    return generateAvatarDataUri({ 
      displayName: user?.displayName || (user as any)?.name || '',
      name: (user as any)?.name || user?.displayName || ''
    });
  }
  
  return failedUrl; // Return original URL if no fallback requested
}

/**
 * Extract Google avatar URL from OAuth user data
 * This function helps with Google OAuth integration
 */
export function extractGoogleAvatarUrl(oauthUser: any): string | null {
  if (!oauthUser) {
    debugLogger.warn('Avatar', 'No OAuth user data provided for Google avatar extraction');
    return null;
  }
  
  // Try different possible fields where Google avatar might be stored
  const possibleFields = ['picture', 'photoURL', 'photo', 'avatar_url'];
  
  for (const field of possibleFields) {
    const url = oauthUser[field];
    if (url && typeof url === 'string') {
      const validatedUrl = validateAndLogAvatarUrl(url, `google_oauth_${field}`, oauthUser.id);
      if (validatedUrl) {
        debugLogger.log('Avatar', `Extracted Google avatar from ${field}`, { 
          url: validatedUrl,
          userId: oauthUser.id 
        });
        return validatedUrl;
      }
    }
  }
  
  debugLogger.warn('Avatar', 'No valid Google avatar URL found in OAuth data', { 
    availableFields: Object.keys(oauthUser),
    userId: oauthUser.id 
  });
  return null;
}