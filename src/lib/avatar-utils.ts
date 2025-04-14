// src/lib/avatar-utils.ts
import { User } from '@/types/database';
import { UIUser } from '@/types/ui';

// Import the avatar debug utilities
import { logAvatarDiagnostics } from './avatar-debug';

// Global version counter for avatar cache-busting
let globalAvatarVersion = Date.now();

// Set this to true to force cache refresh for all avatars
// Useful after a user updates their avatar
let forceRefreshAvatars = false;

/**
 * Force refresh of all avatars by updating the global version
 * Call this when an avatar is updated
 */
export function invalidateAvatarCache(): void {
  globalAvatarVersion = Date.now();
  forceRefreshAvatars = true;
  
  if (process.env.NODE_ENV === 'development') {
    console.log(`[AvatarCache] Invalidated all avatars at version ${globalAvatarVersion}`);
  }
  
  // After 5 seconds, stop forcing refresh to avoid performance issues
  setTimeout(() => {
    forceRefreshAvatars = false;
    if (process.env.NODE_ENV === 'development') {
      console.log('[AvatarCache] Stopped forcing refresh of all avatars');
    }
  }, 5000);
}

/**
 * Add cache-busting parameters to a URL
 * @param url The URL to add cache-busting to
 * @param userId Optional user ID for user-specific caching
 * @returns URL with cache-busting parameters
 */
export function addCacheBusting(url: string, userId?: string | number): string {
  if (!url || url.startsWith('data:')) return url;
  
  // Calculate a cache key based on the global version and optionally the user ID
  const cacheKey = userId ? `${globalAvatarVersion}_${userId}` : globalAvatarVersion.toString();
  
  // Add or update query parameter
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${cacheKey}`;
}

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

// Debug helper to trace avatar resolution
function debugAvatarResolution(user: any, source: string, value: string | null | undefined) {
  if (process.env.NODE_ENV === 'development') {
    console.debug(`[Avatar] Checking ${source}: ${value ? 'Found' : 'Not found'}`);
    if (value) {
      console.debug(`[Avatar] Using ${source}: ${value.substring(0, 50)}${value.length > 50 ? '...' : ''}`);
    }
  }
}

// Check if the URL is a valid image URL
function isValidImageUrl(url: string): boolean {
  if (!url) return false;
  
  // These are valid image sources we accept
  const validPatterns = [
    // Data URIs (svg, png, jpeg, etc)
    /^data:image\//,
    // External URLs
    /^https?:\/\//,
    // Supabase storage URLs
    /supabase\.co\/storage\/v1\/object\/public\//,
    // Placeholder URLs (for testing)
    /^\/api\/placeholder/
  ];
  
  return validPatterns.some(pattern => pattern.test(url));
}

/**
 * Get avatar with appropriate fallback handling
 * 
 * Follows priority order:
 * 1. Database avatarUrl (highest priority)
 * 2. Social login photoURL
 * 3. Legacy avatar field
 * 4. Generate default avatar with initials (lowest priority)
 */
export function getAvatarUrl(user: User | UIUser | AvatarUser | null | undefined): string {
  // The final avatarUrl that will be returned
  let avatarUrl: string | null = null;
  
  // Handle null or undefined user
  if (!user) {
    debugAvatarResolution(user, 'user', null);
    avatarUrl = generateAvatarDataUri({ name: '' });
    return avatarUrl;
  }
  
  // Track user ID for better debugging
  const userId = user.id ? String(user.id) : 'unknown';
  
  // Enhanced debug log for investigation
  if (process.env.NODE_ENV === 'development') {
    console.group(`[AvatarResolver] Getting avatar for user: ${userId}`);
    console.log('User data:', {
      id: userId,
      displayName: user.displayName || (user as any).name || 'No Name',
      avatarUrl: user.avatarUrl,
      photoURL: (user as any).photoURL,
      avatar: (user as any).avatar,
    });
    console.groupEnd();
  }
  
  // Check in correct priority order:
  // 1. Database avatarUrl (highest priority)
  if (user.avatarUrl && !user.avatarUrl.startsWith('/api/placeholder')) {
    avatarUrl = user.avatarUrl;
    
    // Log detailed diagnostics for supabase storage URLs
    if (avatarUrl.includes('supabase.co/storage')) {
      logAvatarDiagnostics(avatarUrl, userId, 'AvatarResolver-DB');
      
      // Always apply cache busting for Supabase avatars
      // Use global avatar version for cache invalidation
      if (!avatarUrl.includes('?v=')) {
        avatarUrl = addCacheBusting(avatarUrl, userId);
      }
      
      // Force cache refresh if the global flag is set (after a user updates their avatar)
      if (forceRefreshAvatars) {
        avatarUrl = addCacheBusting(avatarUrl, `${userId}_${Date.now()}`);
        if (process.env.NODE_ENV === 'development') {
          console.log(`[AvatarResolver] Forced refresh for user ${userId}: ${avatarUrl}`);
        }
      }
    }
    
    // Validate URL
    if (isValidImageUrl(avatarUrl)) {
      debugAvatarResolution(user, 'avatarUrl', avatarUrl);
      return avatarUrl;
    } else {
      console.warn(`[AvatarResolver] Invalid avatarUrl format: ${avatarUrl.substring(0, 100)}`);
    }
  }
  
  // 2. Social login photoURL
  if ((user as any).photoURL) {
    avatarUrl = (user as any).photoURL;
    if (isValidImageUrl(avatarUrl)) {
      debugAvatarResolution(user, 'photoURL', avatarUrl);
      return avatarUrl;
    }
  }
  
  // 3. Legacy avatar field
  if ((user as any).avatar && !(user as any).avatar.startsWith('/api/placeholder')) {
    avatarUrl = (user as any).avatar;
    if (isValidImageUrl(avatarUrl)) {
      debugAvatarResolution(user, 'avatar', avatarUrl);
      return avatarUrl;
    }
  }
  
  // 4. Generate default avatar with initials (lowest priority)
  debugAvatarResolution(user, 'generateAvatarDataUri', 'Generating default avatar');
  avatarUrl = generateAvatarDataUri({ 
    displayName: user.displayName || (user as any).name || '',
    name: (user as any).name || user.displayName || ''
  });
  
  return avatarUrl;
}
