# Avatar System Design Document

## Overview

This design addresses the avatar display issues in the Virtual Office application and introduces Google profile picture integration for users who authenticate via Google OAuth. The solution ensures reliable avatar loading, proper fallback handling, and seamless integration of Google profile pictures as default avatars.

## Architecture

### Avatar Priority System
The avatar system will follow a priority hierarchy:
1. **Custom uploaded avatar** (highest priority)
2. **Google profile picture** (for Google OAuth users)
3. **Fallback initials** (lowest priority)

### Component Architecture
```
Avatar System
├── AvatarProvider (Context)
├── Avatar Component (UI)
├── AvatarUpload Component
├── GoogleAvatarSync Service
└── Avatar Repository Layer
```

## Components and Interfaces

### Avatar Provider Context
```typescript
interface AvatarContextType {
  avatarUrl: string | null;
  isLoading: boolean;
  error: string | null;
  refreshAvatar: () => Promise<void>;
  uploadAvatar: (file: File) => Promise<void>;
  syncGoogleAvatar: () => Promise<void>;
}
```

### Avatar Component Props
```typescript
interface AvatarProps {
  userId?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  fallbackName?: string;
  className?: string;
  showOnlineStatus?: boolean;
}
```

### Google Avatar Integration
```typescript
interface GoogleAvatarService {
  extractAvatarFromOAuth: (oauthData: any) => string | null;
  syncUserGoogleAvatar: (userId: string) => Promise<void>;
  refreshGoogleAvatar: (userId: string) => Promise<void>;
}
```

## Data Models

### User Profile Extension
```sql
-- Add Google avatar URL field to user profiles
ALTER TABLE user_profiles 
ADD COLUMN google_avatar_url TEXT,
ADD COLUMN avatar_source VARCHAR(20) DEFAULT 'custom' CHECK (avatar_source IN ('custom', 'google', 'fallback'));
```

### Avatar URL Resolution Logic
```typescript
function resolveAvatarUrl(user: UserProfile): string | null {
  // Priority 1: Custom uploaded avatar
  if (user.avatar_url && user.avatar_source === 'custom') {
    return user.avatar_url;
  }
  
  // Priority 2: Google profile picture
  if (user.google_avatar_url && user.avatar_source === 'google') {
    return user.google_avatar_url;
  }
  
  // Priority 3: Fallback to null (will show initials)
  return null;
}
```

## Error Handling

### Avatar Loading States
1. **Loading State**: Show skeleton/spinner while loading
2. **Error State**: Log error and show fallback initials
3. **Success State**: Display avatar image
4. **Retry Logic**: Attempt reload once on failure

### Error Logging Strategy
```typescript
interface AvatarError {
  userId: string;
  avatarUrl: string;
  errorType: 'network' | 'permission' | 'not_found' | 'invalid_format';
  timestamp: Date;
  userAgent: string;
}
```

### Fallback Mechanism
```typescript
function AvatarWithFallback({ user, size }: AvatarProps) {
  const [imageError, setImageError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  
  const handleImageError = () => {
    if (retryCount < 1) {
      setRetryCount(prev => prev + 1);
      // Trigger retry
    } else {
      setImageError(true);
      logAvatarError(user.id, avatarUrl, 'load_failed');
    }
  };
  
  if (imageError || !avatarUrl) {
    return <InitialsAvatar name={user.name} size={size} />;
  }
  
  return <img src={avatarUrl} onError={handleImageError} />;
}
```

## Google OAuth Integration

### OAuth Flow Enhancement
```typescript
// During Google OAuth callback
async function handleGoogleOAuthCallback(oauthData: any) {
  const user = await createOrUpdateUser(oauthData);
  
  // Extract and store Google avatar
  const googleAvatarUrl = oauthData.picture;
  if (googleAvatarUrl) {
    await updateUserProfile(user.id, {
      google_avatar_url: googleAvatarUrl,
      avatar_source: 'google'
    });
  }
  
  return user;
}
```

### Avatar Sync Service
```typescript
class GoogleAvatarSyncService {
  async syncUserAvatar(userId: string): Promise<void> {
    const user = await getUserProfile(userId);
    
    if (user.auth_provider === 'google') {
      const freshGoogleData = await refreshGoogleProfile(user.google_id);
      
      if (freshGoogleData.picture !== user.google_avatar_url) {
        await updateUserProfile(userId, {
          google_avatar_url: freshGoogleData.picture
        });
        
        // Invalidate cache
        await invalidateAvatarCache(userId);
      }
    }
  }
}
```

## Caching Strategy

### Browser Cache Management
- Use cache-busting query parameters for updated avatars
- Implement service worker caching for frequently accessed avatars
- Set appropriate cache headers for avatar images

### Application Cache
```typescript
class AvatarCacheManager {
  private cache = new Map<string, string>();
  
  async getAvatarUrl(userId: string): Promise<string | null> {
    // Check memory cache first
    if (this.cache.has(userId)) {
      return this.cache.get(userId) || null;
    }
    
    // Fetch from database
    const user = await getUserProfile(userId);
    const avatarUrl = resolveAvatarUrl(user);
    
    // Cache the result
    if (avatarUrl) {
      this.cache.set(userId, avatarUrl);
    }
    
    return avatarUrl;
  }
  
  invalidateUser(userId: string): void {
    this.cache.delete(userId);
  }
}
```

## Testing Strategy

### Unit Tests
- Avatar URL resolution logic
- Fallback behavior
- Error handling scenarios
- Google avatar extraction

### Integration Tests
- Complete OAuth flow with avatar sync
- Avatar upload and display workflow
- Cache invalidation behavior
- Real-time avatar updates

### Visual Regression Tests
- Avatar display consistency across components
- Loading states and transitions
- Fallback initial styling

### Performance Tests
- Avatar loading time benchmarks
- Cache effectiveness metrics
- Memory usage with large user sets

## Implementation Phases

### Phase 1: Fix Current Avatar Display
- Implement proper avatar URL resolution
- Add error handling and fallback logic
- Fix cache invalidation issues

### Phase 2: Google Avatar Integration
- Extend OAuth flow to capture Google avatars
- Implement avatar priority system
- Add Google avatar sync service

### Phase 3: Enhanced Features
- Avatar refresh functionality
- Bulk avatar sync for existing users
- Performance optimizations

## Security Considerations

### Avatar URL Validation
- Validate Google avatar URLs before storage
- Implement Content Security Policy for avatar images
- Sanitize user-uploaded avatar files

### Privacy Controls
- Allow users to opt-out of Google avatar usage
- Provide clear indication of avatar source
- Respect user privacy preferences

## Performance Optimizations

### Image Optimization
- Implement responsive image loading
- Use WebP format when supported
- Lazy load avatars in lists and grids

### Network Efficiency
- Batch avatar requests where possible
- Implement progressive loading for large avatar lists
- Use CDN for avatar delivery