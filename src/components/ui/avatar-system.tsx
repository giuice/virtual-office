/**
 * Consolidated Avatar System
 * 
 * This file provides a unified interface to all avatar functionality.
 * All avatar components should be imported from this file to ensure consistency.
 */

// Export the main consolidated avatar component
export { 
  EnhancedAvatarV2 as Avatar,
  EnhancedAvatarV2 as EnhancedAvatar,
  EnhancedAvatarV2 as StatusAvatar,
  EnhancedAvatarV2 as ConsolidatedAvatar,
  EnhancedAvatarV2,
  default as DefaultAvatar
} from './enhanced-avatar-v2';

// Export the uploadable avatar for profile pages
export { UploadableAvatar } from '../profile/UploadableAvatar';

// Export specialized floor plan avatars (these use EnhancedAvatarV2 internally)
export { UserAvatar } from '../floor-plan/user-avatar';
export { default as UserAvatarPresence } from '../floor-plan/UserAvatarPresence';
export { default as ModernUserAvatar } from '../floor-plan/modern/ModernUserAvatar';

// Export all avatar utilities
export {
  getAvatarUrl,
  getUserInitials,
  getUserColor,
  generateAvatarDataUri,
  handleAvatarLoadError,
  logAvatarLoadError,
  avatarCacheManager,
  generateCacheBustingUrl,
  updateAvatarWithCacheBust,
  extractGoogleAvatarUrl,
  type AvatarUser,
  type AvatarLoadError
} from '@/lib/avatar-utils';

// Export base avatar components from shadcn/ui
export { Avatar as BaseAvatar, AvatarImage, AvatarFallback } from './avatar';

/**
 * Usage Guidelines:
 * 
 * 1. For basic avatar display: import { Avatar } from '@/components/ui/avatar-system'
 * 2. For profile upload: import { UploadableAvatar } from '@/components/ui/avatar-system'
 * 3. For utilities: import { getAvatarUrl, getUserInitials } from '@/components/ui/avatar-system'
 * 
 * The consolidated Avatar component supports:
 * - Automatic fallback to initials
 * - Status indicators
 * - Loading states with retry logic
 * - Error handling and recovery
 * - Caching and performance optimization
 * - Google OAuth avatar integration
 * - Accessibility features
 */