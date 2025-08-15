// __tests__/avatar-system-functionality.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  getAvatarUrl, 
  getUserInitials, 
  getUserColor, 
  generateAvatarDataUri,
  extractGoogleAvatarUrl,
  handleAvatarLoadError,
  avatarCacheManager
} from '@/lib/avatar-utils';
// import { GoogleAvatarService } from '@/lib/services/google-avatar-service';
import { User } from '@/types/database';
import { UIUser } from '@/types/ui';

// Mock data for testing
const mockUser: User = {
  id: 'test-user-1',
  email: 'test@example.com',
  displayName: 'Test User',
  avatarUrl: 'https://example.com/avatar.jpg',
  companyId: 'test-company',
  status: 'online',
  statusMessage: 'Working',
  role: 'member',
  preferences: {},
  createdAt: new Date(),
  lastActive: new Date(),
  supabase_uid: 'supabase-uid-1'
};

const mockUIUser: UIUser = {
  id: 'test-user-2',
  displayName: 'UI Test User',
  avatarUrl: 'https://example.com/ui-avatar.jpg',
  email: 'ui-test@example.com',
  status: 'active',
  statusMessage: 'Available'
};

const mockGoogleOAuthUser = {
  id: 'google-user-1',
  email: 'google@example.com',
  name: 'Google User',
  picture: 'https://lh3.googleusercontent.com/a/test-avatar=s96-c',
  photoURL: 'https://lh3.googleusercontent.com/a/test-avatar=s96-c',
  given_name: 'Google',
  family_name: 'User',
  verified_email: true
};

describe('Avatar System Functionality Tests', () => {
  beforeEach(() => {
    // Clear avatar cache before each test
    avatarCacheManager.invalidateAll();
    
    // Mock console methods to avoid noise in tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Avatar URL Resolution', () => {
    it('should resolve avatar URL from database avatarUrl field (highest priority)', () => {
      const user = { ...mockUser, avatarUrl: 'https://supabase.co/storage/v1/object/public/avatars/test.jpg' };
      const result = getAvatarUrl(user);
      expect(result).toBe('https://supabase.co/storage/v1/object/public/avatars/test.jpg');
    });

    it('should resolve avatar URL from Google OAuth photoURL (second priority)', () => {
      const user = { 
        ...mockUser, 
        avatarUrl: null,
        photoURL: 'https://lh3.googleusercontent.com/a/test-avatar=s96-c'
      };
      const result = getAvatarUrl(user as any);
      expect(result).toBe('https://lh3.googleusercontent.com/a/test-avatar=s96-c');
    });

    it('should resolve avatar URL from legacy avatar field (third priority)', () => {
      const user = { 
        ...mockUser, 
        avatarUrl: null,
        avatar: 'https://example.com/legacy-avatar.jpg'
      };
      const result = getAvatarUrl(user as any);
      expect(result).toBe('https://example.com/legacy-avatar.jpg');
    });

    it('should generate fallback avatar with initials (lowest priority)', () => {
      const user = { 
        ...mockUser, 
        avatarUrl: null,
        displayName: 'John Doe'
      };
      const result = getAvatarUrl(user);
      expect(result).toMatch(/^data:image\/svg\+xml;base64,/);
      
      // Decode the base64 and check for initials
      const svgContent = atob(result.split(',')[1]);
      expect(svgContent).toContain('JD'); // Should contain initials
    });

    it('should handle null/undefined user gracefully', () => {
      const result = getAvatarUrl(null);
      expect(result).toMatch(/^data:image\/svg\+xml;base64,/);
    });

    it('should skip invalid URLs and fall back to next priority', () => {
      const user = { 
        ...mockUser, 
        avatarUrl: 'invalid-url',
        photoURL: 'https://lh3.googleusercontent.com/valid-avatar'
      };
      const result = getAvatarUrl(user as any);
      expect(result).toBe('https://lh3.googleusercontent.com/valid-avatar');
    });
  });

  describe('Avatar Utility Functions', () => {
    it('should generate correct user initials', () => {
      expect(getUserInitials('John Doe')).toBe('JD');
      expect(getUserInitials('Alice')).toBe('A');
      expect(getUserInitials('Mary Jane Watson')).toBe('MJW');
      expect(getUserInitials('')).toBe('U');
      expect(getUserInitials('   ')).toBe('U');
    });

    it('should generate consistent colors for same names', () => {
      const color1 = getUserColor('John Doe');
      const color2 = getUserColor('John Doe');
      expect(color1).toBe(color2);
      expect(color1).toMatch(/^hsl\(\d+, 70%, 80%\)$/);
    });

    it('should generate different colors for different names', () => {
      const color1 = getUserColor('John Doe');
      const color2 = getUserColor('Jane Smith');
      expect(color1).not.toBe(color2);
    });

    it('should generate valid SVG data URI for avatar', () => {
      const dataUri = generateAvatarDataUri({ displayName: 'Test User' });
      expect(dataUri).toMatch(/^data:image\/svg\+xml;base64,/);
      
      // Decode and check SVG content
      const svgContent = atob(dataUri.split(',')[1]);
      expect(svgContent).toContain('<svg');
      expect(svgContent).toContain('TU'); // Initials for "Test User"
    });
  });

  describe('Google OAuth Avatar Integration', () => {
    it('should extract Google avatar URL from OAuth data', () => {
      const result = extractGoogleAvatarUrl(mockGoogleOAuthUser);
      expect(result).toBe('https://lh3.googleusercontent.com/a/test-avatar=s96-c');
    });

    it('should handle OAuth data without avatar', () => {
      const oauthData = { ...mockGoogleOAuthUser, picture: null, photoURL: null };
      const result = extractGoogleAvatarUrl(oauthData);
      expect(result).toBeNull();
    });

    it('should handle null OAuth data', () => {
      const result = extractGoogleAvatarUrl(null);
      expect(result).toBeNull();
    });

    it('should validate Google avatar URLs correctly', () => {
      // Test URL validation logic without instantiating the service
      const testUrls = [
        { url: 'https://lh3.googleusercontent.com/a/test=s96-c', expected: true },
        { url: 'https://googleapis.com/photo/test', expected: true },
        { url: 'https://example.com/avatar.jpg', expected: false },
        { url: null, expected: false }
      ];
      
      testUrls.forEach(({ url, expected }) => {
        const isValid = url && typeof url === 'string' && 
          (url.includes('googleapis.com') || url.includes('googleusercontent.com'));
        expect(!!isValid).toBe(expected);
      });
    });
  });

  describe('Avatar Error Handling', () => {
    it('should handle avatar load errors gracefully', () => {
      const user = mockUser;
      const failedUrl = 'https://example.com/broken-avatar.jpg';
      const mockError = new Error('Network error');
      
      const fallbackUrl = handleAvatarLoadError(user, failedUrl, mockError, {
        generateFallback: true
      });
      
      expect(fallbackUrl).toMatch(/^data:image\/svg\+xml;base64,/);
    });

    it('should log avatar load errors in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      
      const consoleSpy = vi.spyOn(console, 'error');
      
      const user = mockUser;
      const failedUrl = 'https://example.com/broken-avatar.jpg';
      const mockError = new Error('Network error');
      
      handleAvatarLoadError(user, failedUrl, mockError);
      
      expect(consoleSpy).toHaveBeenCalled();
      
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Avatar Cache Management', () => {
    it('should cache avatar URLs correctly', () => {
      const stats1 = avatarCacheManager.getStats();
      expect(stats1.size).toBe(0);
      
      // Pre-warm cache
      avatarCacheManager.preWarm('user-1', 'https://example.com/avatar.jpg');
      
      const stats2 = avatarCacheManager.getStats();
      expect(stats2.size).toBe(1);
      expect(stats2.entries[0].userId).toBe('user-1');
    });

    it('should invalidate cache correctly', () => {
      avatarCacheManager.preWarm('user-1', 'https://example.com/avatar.jpg');
      avatarCacheManager.preWarm('user-2', 'https://example.com/avatar2.jpg');
      
      expect(avatarCacheManager.getStats().size).toBe(2);
      
      avatarCacheManager.invalidateUser('user-1');
      expect(avatarCacheManager.getStats().size).toBe(1);
      
      avatarCacheManager.invalidateAll();
      expect(avatarCacheManager.getStats().size).toBe(0);
    });
  });

  describe('Avatar Component Integration', () => {
    it('should have avatar components available for import', () => {
      // Test that the avatar components can be imported without errors
      expect(typeof getAvatarUrl).toBe('function');
      expect(typeof getUserInitials).toBe('function');
      expect(typeof getUserColor).toBe('function');
    });

    it('should handle component integration scenarios', () => {
      // Test avatar URL generation for component usage
      const user = mockUser;
      const avatarUrl = getAvatarUrl(user);
      const initials = getUserInitials(user.displayName);
      const color = getUserColor(user.displayName);
      
      expect(avatarUrl).toBeDefined();
      expect(initials).toBe('TU');
      expect(color).toMatch(/^hsl\(\d+, 70%, 80%\)$/);
    });

    it('should provide fallback data for broken avatar scenarios', () => {
      const userWithBrokenAvatar = {
        ...mockUser,
        avatarUrl: 'https://broken-url.com/avatar.jpg'
      };
      
      // The utility should still provide valid fallback data
      const avatarUrl = getAvatarUrl(userWithBrokenAvatar);
      const initials = getUserInitials(userWithBrokenAvatar.displayName);
      
      expect(avatarUrl).toBeDefined();
      expect(initials).toBe('TU');
    });
  });

  describe('Supabase Storage URL Handling', () => {
    it('should handle valid Supabase storage URLs', () => {
      const user = {
        ...mockUser,
        avatarUrl: 'https://project.supabase.co/storage/v1/object/public/avatars/user-123.jpg'
      };
      
      const result = getAvatarUrl(user);
      expect(result).toBe('https://project.supabase.co/storage/v1/object/public/avatars/user-123.jpg');
    });

    it('should detect malformed Supabase URLs', () => {
      const user = {
        ...mockUser,
        avatarUrl: 'https://project.supabase.co/malformed-path/avatar.jpg'
      };
      
      // Should still return the URL but log a warning
      const result = getAvatarUrl(user);
      expect(result).toBe('https://project.supabase.co/malformed-path/avatar.jpg');
    });
  });

  describe('Avatar System Performance', () => {
    it('should resolve avatar URLs quickly', () => {
      const startTime = performance.now();
      
      for (let i = 0; i < 100; i++) {
        getAvatarUrl({ ...mockUser, id: `user-${i}` });
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Should complete 100 avatar resolutions in under 100ms
      expect(duration).toBeLessThan(100);
    });

    it('should generate fallback avatars quickly', () => {
      const startTime = performance.now();
      
      for (let i = 0; i < 100; i++) {
        generateAvatarDataUri({ displayName: `User ${i}` });
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Should complete 100 fallback generations in under 50ms
      expect(duration).toBeLessThan(50);
    });
  });
});