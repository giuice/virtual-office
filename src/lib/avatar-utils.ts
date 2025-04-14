// src/lib/avatar-utils.ts
import { User } from '@/types/database';
import { UIUser } from '@/types/ui';

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
  // Handle null or undefined user
  if (!user) {
    debugAvatarResolution(user, 'user', null);
    return generateAvatarDataUri({ name: '' });
  }
  
  // Check in correct priority order:
  // 1. Database avatarUrl (highest priority)
  debugAvatarResolution(user, 'avatarUrl', user.avatarUrl);
  if (user.avatarUrl && !user.avatarUrl.startsWith('/api/placeholder')) {
    return user.avatarUrl;
  }
  
  // 2. Social login photoURL
  debugAvatarResolution(user, 'photoURL', (user as any).photoURL);
  if ((user as any).photoURL) {
    return (user as any).photoURL;
  }
  
  // 3. Legacy avatar field
  debugAvatarResolution(user, 'avatar', (user as any).avatar);
  if ((user as any).avatar && !(user as any).avatar.startsWith('/api/placeholder')) {
    return (user as any).avatar;
  }
  
  // 4. Generate default avatar with initials (lowest priority)
  debugAvatarResolution(user, 'generateAvatarDataUri', 'Generating default avatar');
  return generateAvatarDataUri({ 
    displayName: user.displayName || (user as any).name || '',
    name: (user as any).name || user.displayName || ''
  });
}