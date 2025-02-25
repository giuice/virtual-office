// src/lib/avatar-utils.ts
import { User } from '@/components/floor-plan/types';

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
export function generateAvatarDataUri(user: User | { name: string, avatar?: string }): string {
  // Handle case where user might be null or user name is empty
  if (!user || !user.name) {
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
  
  const initials = getUserInitials(user.name);
  const color = getUserColor(user.name);
  
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

// Get avatar with appropriate fallback handling
export function getAvatarUrl(user: User | { name: string, avatar?: string }): string {
  // Handle null or undefined user
  if (!user) {
    return generateAvatarDataUri({ name: '' });
  }
  
  // If the avatar is empty or starts with /api/placeholder, use a generated one
  if (!user.avatar || user.avatar.startsWith('/api/placeholder')) {
    return generateAvatarDataUri(user);
  }
  
  return user.avatar;
}