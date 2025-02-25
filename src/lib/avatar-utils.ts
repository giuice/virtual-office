// src/lib/avatar-utils.ts
import { User } from '@/components/floor-plan/types';

// Predefined modern Tailwind color palette for avatars
const avatarColors = [
  'bg-blue-500',   // Blue
  'bg-indigo-500', // Indigo
  'bg-purple-500', // Purple
  'bg-pink-500',   // Pink
  'bg-rose-500',   // Rose
  'bg-fuchsia-500',// Fuchsia
  'bg-violet-500', // Violet
  'bg-cyan-500',   // Cyan
  'bg-teal-500',   // Teal
  'bg-emerald-500',// Emerald
];

// Generate a consistent color based on user name
export function getUserColor(name: string): string {
  if (!name || typeof name !== 'string' || name.trim() === '') {
    return avatarColors[0]; // Default to blue-500
  }

  // Simple hash to select color from palette
  const hash = name.split('').reduce((acc, char) => {
    return char.charCodeAt(0) + ((acc << 5) - acc);
  }, 0);
  const index = Math.abs(hash) % avatarColors.length;
  return avatarColors[index];
}

// Get user initials for avatar fallback
export function getUserInitials(name: string): string {
  if (!name || typeof name !== 'string' || name.trim() === '') {
    return 'U'; // Default fallback for "User"
  }
  return name
    .split(' ')
    .map(part => part.charAt(0))
    .join('')
    .slice(0, 2) // Limit to 2 characters
    .toUpperCase();
}

// Generate a data URI for a colored avatar with initials
export function generateAvatarDataUri(user: User | { name: string, avatar?: string }): string {
  if (!user || !user.name) {
    const defaultSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <rect width="100" height="100" fill="#3b82f6" rx="10"/>
        <text x="50" y="50" font-family="Inter, sans-serif" font-size="40" font-weight="600" fill="#ffffff" text-anchor="middle" dominant-baseline="central">
          U
        </text>
      </svg>
    `;
    return `data:image/svg+xml;base64,${btoa(defaultSvg)}`;
  }

  const initials = getUserInitials(user.name);
  const colorClass = getUserColor(user.name);
  const colorHex = colorClass.split('-')[1] === '500' ? `#${colorClass.split('-')[1]}` : '#3b82f6'; // Map to hex if needed

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <rect width="100" height="100" fill="${colorHex}" rx="10"/>
      <text x="50" y="50" font-family="Inter, sans-serif" font-size="40" font-weight="600" fill="#ffffff" text-anchor="middle" dominant-baseline="central">
        ${initials}
      </text>
    </svg>
  `;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

// Get avatar with appropriate fallback handling
export function getAvatarUrl(user: User | { name: string, avatar?: string }): string {
  if (!user) {
    return generateAvatarDataUri({ name: '' });
  }
  if (!user.avatar || user.avatar.startsWith('/api/placeholder')) {
    return generateAvatarDataUri(user);
  }
  return user.avatar;
}