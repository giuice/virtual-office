// __tests__/auth-system-integration.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { User } from '@supabase/supabase-js';
import { User as DatabaseUser } from '@/types/database';

// Mock data for testing
const mockSupabaseUser: User = {
  id: 'supabase-user-123',
  email: 'test@example.com',
  aud: 'authenticated',
  role: 'authenticated',
  email_confirmed_at: new Date().toISOString(),
  phone_confirmed_at: null,
  confirmation_sent_at: null,
  recovery_sent_at: null,
  email_change_sent_at: null,
  new_email: null,
  new_phone: null,
  invited_at: null,
  action_link: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  is_anonymous: false,
  app_metadata: {
    provider: 'email',
    providers: ['email']
  },
  user_metadata: {
    displayName: 'Test User',
    name: 'Test User'
  },
  identities: []
};

const mockGoogleUser: User = {
  ...mockSupabaseUser,
  id: 'google-user-123',
  app_metadata: {
    provider: 'google',
    providers: ['google']
  },
  user_metadata: {
    full_name: 'Google Test User',
    name: 'Google Test User',
    picture: 'https://lh3.googleusercontent.com/a/test-avatar=s96-c',
    email: 'google@example.com',
    email_verified: true,
    phone_verified: false
  }
};

const mockDatabaseUser: DatabaseUser = {
  id: 'db-user-123',
  email: 'test@example.com',
  displayName: 'Test User',
  avatarUrl: null,
  companyId: 'test-company',
  status: 'online',
  statusMessage: null,
  role: 'member',
  preferences: {},
  createdAt: new Date(),
  lastActive: new Date(),
  supabase_uid: 'supabase-user-123'
};

describe('Authentication System Integration Tests', () => {
  beforeEach(() => {
    // Mock console methods to avoid noise in tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('User Authentication Flow', () => {
    it('should handle email/password authentication data structure', () => {
      expect(mockSupabaseUser).toHaveProperty('id');
      expect(mockSupabaseUser).toHaveProperty('email');
      expect(mockSupabaseUser).toHaveProperty('app_metadata');
      expect(mockSupabaseUser).toHaveProperty('user_metadata');
      expect(mockSupabaseUser.app_metadata.provider).toBe('email');
    });

    it('should handle Google OAuth authentication data structure', () => {
      expect(mockGoogleUser).toHaveProperty('id');
      expect(mockGoogleUser).toHaveProperty('email');
      expect(mockGoogleUser.app_metadata.provider).toBe('google');
      expect(mockGoogleUser.user_metadata).toHaveProperty('picture');
      expect(mockGoogleUser.user_metadata.picture).toContain('googleusercontent.com');
    });

    it('should validate authentication state transitions', () => {
      const authStates = ['unauthenticated', 'authenticating', 'authenticated', 'error'];
      
      // Valid transitions
      const validTransitions = [
        { from: 'unauthenticated', to: 'authenticating' },
        { from: 'authenticating', to: 'authenticated' },
        { from: 'authenticating', to: 'error' },
        { from: 'authenticated', to: 'unauthenticated' },
        { from: 'error', to: 'authenticating' }
      ];

      validTransitions.forEach(({ from, to }) => {
        expect(isValidAuthStateTransition(from, to)).toBe(true);
      });

      // Invalid transitions
      const invalidTransitions = [
        { from: 'unauthenticated', to: 'authenticated' },
        { from: 'authenticated', to: 'authenticating' }
      ];

      invalidTransitions.forEach(({ from, to }) => {
        expect(isValidAuthStateTransition(from, to)).toBe(false);
      });
    });
  });

  describe('User Profile Synchronization', () => {
    it('should map Supabase user to database user correctly', () => {
      const mappedUser = mapSupabaseUserToDatabase(mockSupabaseUser);
      
      expect(mappedUser.supabase_uid).toBe(mockSupabaseUser.id);
      expect(mappedUser.email).toBe(mockSupabaseUser.email);
      expect(mappedUser.displayName).toBe(mockSupabaseUser.user_metadata.displayName);
    });

    it('should handle Google OAuth user profile mapping', () => {
      const mappedUser = mapSupabaseUserToDatabase(mockGoogleUser);
      
      expect(mappedUser.supabase_uid).toBe(mockGoogleUser.id);
      expect(mappedUser.email).toBe(mockGoogleUser.email);
      expect(mappedUser.displayName).toBe(mockGoogleUser.user_metadata.full_name);
      expect(mappedUser.avatarUrl).toBe(mockGoogleUser.user_metadata.picture);
    });

    it('should validate user profile data integrity', () => {
      const validProfile = validateUserProfile(mockDatabaseUser);
      expect(validProfile.isValid).toBe(true);
      expect(validProfile.errors).toHaveLength(0);

      const invalidProfile = validateUserProfile({
        ...mockDatabaseUser,
        email: 'invalid-email',
        displayName: ''
      });
      expect(invalidProfile.isValid).toBe(false);
      expect(invalidProfile.errors.length).toBeGreaterThan(0);
    });

    it('should handle profile sync conflicts', () => {
      const existingProfile = mockDatabaseUser;
      const newProfileData = {
        ...mockDatabaseUser,
        displayName: 'Updated Name',
        avatarUrl: 'https://example.com/new-avatar.jpg'
      };

      const resolvedProfile = resolveProfileConflict(existingProfile, newProfileData);
      
      // Should prefer newer data for most fields
      expect(resolvedProfile.displayName).toBe(newProfileData.displayName);
      expect(resolvedProfile.avatarUrl).toBe(newProfileData.avatarUrl);
      
      // Should preserve certain fields from existing profile
      expect(resolvedProfile.id).toBe(existingProfile.id);
      expect(resolvedProfile.createdAt).toBe(existingProfile.createdAt);
    });
  });

  describe('Session Management', () => {
    it('should validate session tokens correctly', () => {
      const validToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const invalidToken = 'invalid-token';
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyMzkwMjJ9.invalid';

      expect(isValidSessionToken(validToken)).toBe(true);
      expect(isValidSessionToken(invalidToken)).toBe(false);
      expect(isValidSessionToken(expiredToken)).toBe(false);
    });

    it('should handle session refresh correctly', () => {
      const currentTime = Date.now();
      const sessionData = {
        token: 'valid-token',
        expiresAt: currentTime + (60 * 60 * 1000), // 1 hour from now
        refreshToken: 'refresh-token'
      };

      expect(shouldRefreshSession(sessionData)).toBe(false);

      // Session expiring soon
      const expiringSoon = {
        ...sessionData,
        expiresAt: currentTime + (5 * 60 * 1000) // 5 minutes from now
      };
      expect(shouldRefreshSession(expiringSoon)).toBe(true);

      // Expired session
      const expired = {
        ...sessionData,
        expiresAt: currentTime - (60 * 1000) // 1 minute ago
      };
      expect(shouldRefreshSession(expired)).toBe(true);
    });

    it('should manage multiple sessions correctly', () => {
      const sessions = [
        { userId: 'user1', token: 'token1', active: true },
        { userId: 'user2', token: 'token2', active: false },
        { userId: 'user3', token: 'token3', active: true }
      ];

      const activeSessions = getActiveSessions(sessions);
      expect(activeSessions).toHaveLength(2);
      expect(activeSessions.every(s => s.active)).toBe(true);

      const cleanedSessions = cleanupInactiveSessions(sessions);
      expect(cleanedSessions).toHaveLength(2);
      expect(cleanedSessions.every(s => s.active)).toBe(true);
    });
  });

  describe('Authentication Error Handling', () => {
    it('should categorize authentication errors correctly', () => {
      const errors = [
        { code: 'invalid_credentials', message: 'Invalid email or password' },
        { code: 'email_not_confirmed', message: 'Email not confirmed' },
        { code: 'too_many_requests', message: 'Too many requests' },
        { code: 'network_error', message: 'Network connection failed' }
      ];

      errors.forEach(error => {
        const category = categorizeAuthError(error);
        expect(['user_error', 'system_error', 'network_error']).toContain(category);
      });
    });

    it('should provide user-friendly error messages', () => {
      const technicalErrors = [
        'PGRST301: JWT expired',
        'Connection timeout after 30000ms',
        'Invalid JWT signature'
      ];

      technicalErrors.forEach(error => {
        const userMessage = getUserFriendlyErrorMessage(error);
        expect(userMessage).not.toContain('PGRST');
        expect(userMessage).not.toContain('JWT');
        expect(userMessage.length).toBeGreaterThan(10);
      });
    });

    it('should handle authentication retry logic', () => {
      const retryConfig = {
        maxRetries: 3,
        baseDelay: 1000,
        backoffMultiplier: 2
      };

      const delays = calculateRetryDelays(retryConfig);
      expect(delays).toHaveLength(3);
      expect(delays[0]).toBe(1000);
      expect(delays[1]).toBe(2000);
      expect(delays[2]).toBe(4000);
    });
  });

  describe('Authorization and Permissions', () => {
    it('should validate user roles correctly', () => {
      const adminUser = { ...mockDatabaseUser, role: 'admin' as const };
      const memberUser = { ...mockDatabaseUser, role: 'member' as const };

      expect(hasPermission(adminUser, 'manage_users')).toBe(true);
      expect(hasPermission(adminUser, 'view_dashboard')).toBe(true);
      expect(hasPermission(memberUser, 'manage_users')).toBe(false);
      expect(hasPermission(memberUser, 'view_dashboard')).toBe(true);
    });

    it('should handle company-based access control', () => {
      const user1 = { ...mockDatabaseUser, companyId: 'company-1' };
      const user2 = { ...mockDatabaseUser, companyId: 'company-2' };

      expect(canAccessCompanyResource(user1, 'company-1')).toBe(true);
      expect(canAccessCompanyResource(user1, 'company-2')).toBe(false);
      expect(canAccessCompanyResource(user2, 'company-2')).toBe(true);
    });

    it('should validate invitation permissions', () => {
      const adminUser = { ...mockDatabaseUser, role: 'admin' as const };
      const memberUser = { ...mockDatabaseUser, role: 'member' as const };

      expect(canCreateInvitation(adminUser)).toBe(true);
      expect(canCreateInvitation(memberUser)).toBe(false);
      expect(canRevokeInvitation(adminUser)).toBe(true);
      expect(canRevokeInvitation(memberUser)).toBe(false);
    });
  });

  describe('Authentication Security', () => {
    it('should validate password strength requirements', () => {
      const passwords = [
        { password: '123456', valid: false },
        { password: 'password', valid: false },
        { password: 'Password1', valid: false },
        { password: 'Password123!', valid: true },
        { password: 'MySecureP@ssw0rd', valid: true }
      ];

      passwords.forEach(({ password, valid }) => {
        expect(isPasswordStrong(password)).toBe(valid);
      });
    });

    it('should detect suspicious authentication patterns', () => {
      const loginAttempts = [
        { timestamp: Date.now() - 1000, success: false },
        { timestamp: Date.now() - 2000, success: false },
        { timestamp: Date.now() - 3000, success: false },
        { timestamp: Date.now() - 4000, success: false },
        { timestamp: Date.now() - 5000, success: false }
      ];

      expect(isSuspiciousActivity(loginAttempts)).toBe(true);

      const normalAttempts = [
        { timestamp: Date.now() - 60000, success: true },
        { timestamp: Date.now() - 120000, success: true }
      ];

      expect(isSuspiciousActivity(normalAttempts)).toBe(false);
    });

    it('should implement rate limiting correctly', () => {
      const rateLimiter = createRateLimiter({ maxAttempts: 5, windowMs: 60000 });
      
      // Should allow initial attempts
      for (let i = 0; i < 5; i++) {
        expect(rateLimiter.isAllowed('user1')).toBe(true);
        rateLimiter.recordAttempt('user1');
      }
      
      // Should block after limit reached
      expect(rateLimiter.isAllowed('user1')).toBe(false);
      
      // Should allow different user
      expect(rateLimiter.isAllowed('user2')).toBe(true);
    });
  });

  describe('Authentication Performance', () => {
    it('should authenticate users quickly', () => {
      const startTime = performance.now();
      
      for (let i = 0; i < 100; i++) {
        validateUserProfile(mockDatabaseUser);
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Should complete 100 validations in under 50ms
      expect(duration).toBeLessThan(50);
    });

    it('should handle session validation efficiently', () => {
      const sessions = Array.from({ length: 1000 }, (_, i) => ({
        userId: `user-${i}`,
        token: `token-${i}`,
        expiresAt: Date.now() + (60 * 60 * 1000),
        refreshToken: `refresh-${i}`
      }));

      const startTime = performance.now();
      
      sessions.forEach(session => {
        shouldRefreshSession(session);
      });
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Should complete 1000 session validations in under 100ms
      expect(duration).toBeLessThan(100);
    });
  });
});

// Helper functions for testing (these would normally be in utility files)
function isValidAuthStateTransition(from: string, to: string): boolean {
  const validTransitions: Record<string, string[]> = {
    'unauthenticated': ['authenticating'],
    'authenticating': ['authenticated', 'error'],
    'authenticated': ['unauthenticated'],
    'error': ['authenticating']
  };
  
  return validTransitions[from]?.includes(to) || false;
}

function mapSupabaseUserToDatabase(supabaseUser: User): Partial<DatabaseUser> {
  return {
    supabase_uid: supabaseUser.id,
    email: supabaseUser.email!,
    displayName: supabaseUser.user_metadata?.full_name || 
                 supabaseUser.user_metadata?.displayName || 
                 supabaseUser.user_metadata?.name || 
                 supabaseUser.email?.split('@')[0] || '',
    avatarUrl: supabaseUser.user_metadata?.picture || null,
    status: 'online',
    role: 'member'
  };
}

function validateUserProfile(user: DatabaseUser): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!user.email || !isValidEmail(user.email)) {
    errors.push('Invalid email address');
  }
  
  if (!user.displayName || user.displayName.trim().length === 0) {
    errors.push('Display name is required');
  }
  
  if (!user.supabase_uid) {
    errors.push('Supabase UID is required');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function resolveProfileConflict(existing: DatabaseUser, updated: Partial<DatabaseUser>): DatabaseUser {
  return {
    ...existing,
    ...updated,
    id: existing.id, // Always preserve ID
    createdAt: existing.createdAt, // Always preserve creation date
    supabase_uid: existing.supabase_uid, // Always preserve Supabase UID
    lastActive: new Date() // Update last active time
  };
}

function isValidSessionToken(token: string): boolean {
  if (!token || typeof token !== 'string') return false;
  
  // Basic JWT format check
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  
  try {
    // Try to decode the header and payload
    const header = JSON.parse(atob(parts[0]));
    const payload = JSON.parse(atob(parts[1]));
    
    // Check if token is expired
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}

function shouldRefreshSession(session: { expiresAt: number }): boolean {
  const now = Date.now();
  const timeUntilExpiry = session.expiresAt - now;
  const refreshThreshold = 15 * 60 * 1000; // 15 minutes
  
  return timeUntilExpiry <= refreshThreshold;
}

function getActiveSessions(sessions: Array<{ active: boolean }>): Array<{ active: boolean }> {
  return sessions.filter(session => session.active);
}

function cleanupInactiveSessions(sessions: Array<{ active: boolean }>): Array<{ active: boolean }> {
  return sessions.filter(session => session.active);
}

function categorizeAuthError(error: { code: string; message: string }): string {
  const userErrors = ['invalid_credentials', 'email_not_confirmed', 'weak_password'];
  const networkErrors = ['network_error', 'timeout', 'connection_failed'];
  
  if (userErrors.includes(error.code)) return 'user_error';
  if (networkErrors.includes(error.code)) return 'network_error';
  return 'system_error';
}

function getUserFriendlyErrorMessage(error: string): string {
  const errorMappings: Record<string, string> = {
    'PGRST301': 'Your session has expired. Please sign in again.',
    'JWT expired': 'Your session has expired. Please sign in again.',
    'Connection timeout': 'Connection timed out. Please check your internet connection.',
    'Invalid JWT signature': 'Authentication error. Please sign in again.'
  };
  
  for (const [key, message] of Object.entries(errorMappings)) {
    if (error.includes(key)) {
      return message;
    }
  }
  
  return 'An unexpected error occurred. Please try again.';
}

function calculateRetryDelays(config: { maxRetries: number; baseDelay: number; backoffMultiplier: number }): number[] {
  const delays: number[] = [];
  let currentDelay = config.baseDelay;
  
  for (let i = 0; i < config.maxRetries; i++) {
    delays.push(currentDelay);
    currentDelay *= config.backoffMultiplier;
  }
  
  return delays;
}

function hasPermission(user: DatabaseUser, permission: string): boolean {
  const rolePermissions: Record<string, string[]> = {
    'admin': ['manage_users', 'view_dashboard', 'manage_company', 'create_invitations'],
    'member': ['view_dashboard', 'update_profile']
  };
  
  return rolePermissions[user.role]?.includes(permission) || false;
}

function canAccessCompanyResource(user: DatabaseUser, resourceCompanyId: string): boolean {
  return user.companyId === resourceCompanyId;
}

function canCreateInvitation(user: DatabaseUser): boolean {
  return user.role === 'admin';
}

function canRevokeInvitation(user: DatabaseUser): boolean {
  return user.role === 'admin';
}

function isPasswordStrong(password: string): boolean {
  if (password.length < 8) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/\d/.test(password)) return false;
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) return false;
  return true;
}

function isSuspiciousActivity(attempts: Array<{ timestamp: number; success: boolean }>): boolean {
  const recentFailures = attempts.filter(attempt => 
    !attempt.success && 
    Date.now() - attempt.timestamp < 5 * 60 * 1000 // Last 5 minutes
  );
  
  return recentFailures.length >= 5;
}

function createRateLimiter(config: { maxAttempts: number; windowMs: number }) {
  const attempts = new Map<string, number[]>();
  
  return {
    isAllowed: (userId: string): boolean => {
      const userAttempts = attempts.get(userId) || [];
      const now = Date.now();
      const windowStart = now - config.windowMs;
      
      const recentAttempts = userAttempts.filter(timestamp => timestamp > windowStart);
      return recentAttempts.length < config.maxAttempts;
    },
    
    recordAttempt: (userId: string): void => {
      const userAttempts = attempts.get(userId) || [];
      const now = Date.now();
      const windowStart = now - config.windowMs;
      
      const recentAttempts = userAttempts.filter(timestamp => timestamp > windowStart);
      recentAttempts.push(now);
      attempts.set(userId, recentAttempts);
    }
  };
}