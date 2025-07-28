// Tests for avatar utility functions
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  getUserInitials, 
  getUserColor, 
  getAvatarUrl, 
  generateAvatarDataUri,
  getAvatarUrlWithFallback,
  handleAvatarLoadError,
  extractGoogleAvatarUrl,
  logAvatarLoadError,
  type AvatarLoadError
} from '@/lib/avatar-utils';

// Mock the debug logger
vi.mock('@/utils/debug-logger', () => ({
  debugLogger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
  }
}));

describe('Avatar Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getUserInitials', () => {
    it('should return initials for single name', () => {
      expect(getUserInitials('John')).toBe('J');
    });

    it('should return initials for full name', () => {
      expect(getUserInitials('John Doe')).toBe('JD');
    });

    it('should return initials for multiple names', () => {
      expect(getUserInitials('John Michael Doe')).toBe('JMD');
    });

    it('should handle empty string', () => {
      expect(getUserInitials('')).toBe('U');
    });

    it('should handle null/undefined', () => {
      expect(getUserInitials(null as any)).toBe('U');
      expect(getUserInitials(undefined as any)).toBe('U');
    });
  });

  describe('getUserColor', () => {
    it('should return consistent color for same name', () => {
      const color1 = getUserColor('John Doe');
      const color2 = getUserColor('John Doe');
      expect(color1).toBe(color2);
    });

    it('should return different colors for different names', () => {
      const color1 = getUserColor('John Doe');
      const color2 = getUserColor('Jane Smith');
      expect(color1).not.toBe(color2);
    });

    it('should return HSL format', () => {
      const color = getUserColor('Test User');
      expect(color).toMatch(/^hsl\(\d+, 70%, 80%\)$/);
    });

    it('should handle empty string', () => {
      const color = getUserColor('');
      expect(color).toBe('hsl(210, 70%, 80%)');
    });
  });

  describe('getAvatarUrl', () => {
    it('should prioritize avatarUrl over photoURL (custom over Google)', () => {
      const user = {
        id: '1',
        displayName: 'John Doe',
        avatarUrl: 'https://example.com/custom-avatar.jpg',
        photoURL: 'https://lh3.googleusercontent.com/google-photo.jpg'
      };
      
      const result = getAvatarUrl(user);
      expect(result).toBe('https://example.com/custom-avatar.jpg');
    });

    it('should use Google photoURL when avatarUrl is not available', () => {
      const user = {
        id: '1',
        displayName: 'John Doe',
        photoURL: 'https://lh3.googleusercontent.com/google-photo.jpg'
      };
      
      const result = getAvatarUrl(user);
      expect(result).toBe('https://lh3.googleusercontent.com/google-photo.jpg');
    });

    it('should fix Supabase storage URLs', () => {
      const user = {
        id: '1',
        displayName: 'John Doe',
        avatarUrl: 'https://project.supabase.co/storage/v1/object/public/user-uploads/avatars/test.jpg'
      };
      
      const result = getAvatarUrl(user);
      expect(result).toBe('https://project.supabase.co/storage/v1/object/public/user-uploads/avatars/test.jpg');
    });

    it('should skip placeholder URLs and use next priority', () => {
      const user = {
        id: '1',
        displayName: 'John Doe',
        avatarUrl: '/api/placeholder/avatar',
        photoURL: 'https://lh3.googleusercontent.com/google-photo.jpg'
      };
      
      const result = getAvatarUrl(user);
      expect(result).toBe('https://lh3.googleusercontent.com/google-photo.jpg');
    });

    it('should skip invalid URLs and use next priority', () => {
      const user = {
        id: '1',
        displayName: 'John Doe',
        avatarUrl: 'invalid-url',
        photoURL: 'https://lh3.googleusercontent.com/google-photo.jpg'
      };
      
      const result = getAvatarUrl(user);
      expect(result).toBe('https://lh3.googleusercontent.com/google-photo.jpg');
    });

    it('should use legacy avatar field when other options unavailable', () => {
      const user = {
        id: '1',
        displayName: 'John Doe',
        avatar: 'https://example.com/legacy-avatar.jpg'
      };
      
      const result = getAvatarUrl(user);
      expect(result).toBe('https://example.com/legacy-avatar.jpg');
    });

    it('should generate data URI when no valid URLs available', () => {
      const user = {
        id: '1',
        displayName: 'John Doe'
      };
      
      const result = getAvatarUrl(user);
      expect(result).toMatch(/^data:image\/svg\+xml;base64,/);
    });

    it('should handle null user gracefully', () => {
      const result = getAvatarUrl(null);
      expect(result).toMatch(/^data:image\/svg\+xml;base64,/);
    });

    it('should handle empty string URLs', () => {
      const user = {
        id: '1',
        displayName: 'John Doe',
        avatarUrl: '',
        photoURL: 'https://lh3.googleusercontent.com/google-photo.jpg'
      };
      
      const result = getAvatarUrl(user);
      expect(result).toBe('https://lh3.googleusercontent.com/google-photo.jpg');
    });

    it('should handle whitespace-only URLs', () => {
      const user = {
        id: '1',
        displayName: 'John Doe',
        avatarUrl: '   ',
        photoURL: 'https://lh3.googleusercontent.com/google-photo.jpg'
      };
      
      const result = getAvatarUrl(user);
      expect(result).toBe('https://lh3.googleusercontent.com/google-photo.jpg');
    });
  });

  describe('generateAvatarDataUri', () => {
    it('should generate valid data URI', () => {
      const user = { displayName: 'John Doe' };
      const result = generateAvatarDataUri(user);
      
      expect(result).toMatch(/^data:image\/svg\+xml;base64,/);
    });

    it('should include user initials in SVG', () => {
      const user = { displayName: 'John Doe' };
      const result = generateAvatarDataUri(user);
      
      // Decode base64 to check content
      const base64Data = result.split(',')[1];
      const svgContent = atob(base64Data);
      
      expect(svgContent).toContain('JD');
    });

    it('should handle empty user', () => {
      const result = generateAvatarDataUri({});
      expect(result).toMatch(/^data:image\/svg\+xml;base64,/);
      
      const base64Data = result.split(',')[1];
      const svgContent = atob(base64Data);
      expect(svgContent).toContain('U');
    });
  });

  describe('getAvatarUrlWithFallback', () => {
    it('should return data URI immediately for generated avatars', () => {
      const user = {
        id: '1',
        displayName: 'John Doe'
      };
      
      const result = getAvatarUrlWithFallback(user);
      expect(result).toMatch(/^data:image\/svg\+xml;base64,/);
    });

    it('should return external URL for valid avatar URLs', () => {
      const user = {
        id: '1',
        displayName: 'John Doe',
        avatarUrl: 'https://example.com/avatar.jpg'
      };
      
      const result = getAvatarUrlWithFallback(user);
      expect(result).toBe('https://example.com/avatar.jpg');
    });
  });

  describe('handleAvatarLoadError', () => {
    it('should generate fallback avatar by default', () => {
      const user = {
        id: '1',
        displayName: 'John Doe'
      };
      
      const result = handleAvatarLoadError(user, 'https://failed-url.com/avatar.jpg');
      expect(result).toMatch(/^data:image\/svg\+xml;base64,/);
    });

    it('should call custom error handler when provided', () => {
      const user = { id: '1', displayName: 'John Doe' };
      const onError = vi.fn();
      
      handleAvatarLoadError(user, 'https://failed-url.com/avatar.jpg', undefined, { onError });
      
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({
        userId: '1',
        url: 'https://failed-url.com/avatar.jpg',
        errorType: expect.any(String),
        timestamp: expect.any(Date)
      }));
    });

    it('should detect Supabase storage permission errors', () => {
      const user = { id: '1', displayName: 'John Doe' };
      const onError = vi.fn();
      
      handleAvatarLoadError(
        user, 
        'https://project.supabase.co/storage/v1/object/public/user-uploads/avatars/test.jpg',
        undefined,
        { onError }
      );
      
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({
        errorType: 'permission'
      }));
    });

    it('should detect malformed Supabase URLs', () => {
      const user = { id: '1', displayName: 'John Doe' };
      const onError = vi.fn();
      
      handleAvatarLoadError(
        user, 
        'https://project.supabase.co/malformed/url/avatar.jpg',
        undefined,
        { onError }
      );
      
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({
        errorType: 'invalid_format'
      }));
    });
  });

  describe('extractGoogleAvatarUrl', () => {
    it('should extract avatar from picture field', () => {
      const oauthUser = {
        id: 'google-123',
        picture: 'https://lh3.googleusercontent.com/photo.jpg'
      };
      
      const result = extractGoogleAvatarUrl(oauthUser);
      expect(result).toBe('https://lh3.googleusercontent.com/photo.jpg');
    });

    it('should extract avatar from photoURL field', () => {
      const oauthUser = {
        id: 'google-123',
        photoURL: 'https://lh3.googleusercontent.com/photo.jpg'
      };
      
      const result = extractGoogleAvatarUrl(oauthUser);
      expect(result).toBe('https://lh3.googleusercontent.com/photo.jpg');
    });

    it('should prioritize picture over other fields', () => {
      const oauthUser = {
        id: 'google-123',
        picture: 'https://lh3.googleusercontent.com/picture.jpg',
        photoURL: 'https://lh3.googleusercontent.com/photo.jpg'
      };
      
      const result = extractGoogleAvatarUrl(oauthUser);
      expect(result).toBe('https://lh3.googleusercontent.com/picture.jpg');
    });

    it('should return null for invalid URLs', () => {
      const oauthUser = {
        id: 'google-123',
        picture: 'invalid-url'
      };
      
      const result = extractGoogleAvatarUrl(oauthUser);
      expect(result).toBeNull();
    });

    it('should return null when no valid avatar found', () => {
      const oauthUser = {
        id: 'google-123',
        name: 'John Doe'
      };
      
      const result = extractGoogleAvatarUrl(oauthUser);
      expect(result).toBeNull();
    });

    it('should handle null/undefined input', () => {
      expect(extractGoogleAvatarUrl(null)).toBeNull();
      expect(extractGoogleAvatarUrl(undefined)).toBeNull();
    });
  });

  describe('logAvatarLoadError', () => {
    it('should log error with all required fields', () => {
      const error: AvatarLoadError = {
        userId: '1',
        url: 'https://failed-url.com/avatar.jpg',
        errorType: 'network',
        timestamp: new Date(),
        userAgent: 'test-agent',
        additionalInfo: { test: 'data' }
      };
      
      // Should not throw
      expect(() => logAvatarLoadError(error)).not.toThrow();
    });
  });
});