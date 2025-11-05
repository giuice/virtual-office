// __tests__/avatar-sync-service.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AvatarSyncService, AvatarSyncResult, BulkAvatarSyncResult } from '@/lib/services/avatar-sync-service';
import { GoogleAvatarService, GoogleOAuthUser, GoogleAvatarStorageResult } from '@/lib/services/google-avatar-service';
import { IUserRepository } from '@/repositories/interfaces';
import { User } from '@/types/database';
import { avatarCacheManager } from '@/lib/avatar-utils';

// Mock the debug logger
vi.mock('@/utils/debug-logger', () => ({
  debugLogger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    messaging: {
      enabled: () => false,
      featureEnabled: () => false,
      info: vi.fn(),
      event: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      trace: vi.fn(),
      storageKeys: {
        debug: 'vo:debug:messaging',
        flag: 'vo:flag:messaging_v2',
      },
    },
  }
}));

// Mock the avatar cache manager
vi.mock('@/lib/avatar-utils', () => ({
  avatarCacheManager: {
    invalidateUser: vi.fn(),
    invalidateAll: vi.fn(),
    getStats: vi.fn(() => ({
      size: 0,
      entries: []
    }))
  }
}));

// Mock user data
const mockUser: User = {
  id: 'user-123',
  companyId: 'company-456',
  supabase_uid: 'supabase-uid-123',
  email: 'test@example.com',
  displayName: 'Test User',
  avatarUrl: 'https://example.com/old-avatar.jpg',
  status: 'online',
  preferences: {},
  role: 'member',
  lastActive: '2024-01-01T00:00:00Z',
  createdAt: '2024-01-01T00:00:00Z',
  currentSpaceId: null
};

const mockGoogleOAuthUser: GoogleOAuthUser = {
  id: 'google-123',
  email: 'test@example.com',
  name: 'Test User',
  picture: 'https://lh3.googleusercontent.com/a/test-avatar=s96-c'
};

// Create mock repository
function createMockUserRepository(): IUserRepository {
  return {
    findById: vi.fn(),
    findBySupabaseUid: vi.fn(),
    findByEmail: vi.fn(),
    findByCompany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteById: vi.fn(),
    updateCompanyAssociation: vi.fn(),
    updateLocation: vi.fn(),
    findAll: vi.fn()
  };
}

// Create mock Google avatar service
function createMockGoogleAvatarService(): GoogleAvatarService {
  const mockService = {
    syncGoogleAvatar: vi.fn(),
    refreshGoogleAvatar: vi.fn(),
    removeGoogleAvatar: vi.fn(),
    extractAvatarFromOAuth: vi.fn(),
    storeGoogleAvatarUrl: vi.fn(),
    extractAndStoreGoogleAvatar: vi.fn(),
    isValidGoogleAvatarUrl: vi.fn(),
    bulkSyncGoogleAvatars: vi.fn()
  } as unknown as GoogleAvatarService;
  
  return mockService;
}

describe('AvatarSyncService', () => {
  let service: AvatarSyncService;
  let mockUserRepository: IUserRepository;
  let mockGoogleAvatarService: GoogleAvatarService;

  beforeEach(() => {
    mockUserRepository = createMockUserRepository();
    mockGoogleAvatarService = createMockGoogleAvatarService();
    service = new AvatarSyncService(mockUserRepository, mockGoogleAvatarService);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('syncUserGoogleAvatar', () => {
    it('should successfully sync Google avatar with OAuth data', async () => {
      // Arrange
      const userId = 'user-123';
      const newAvatarUrl = 'https://lh3.googleusercontent.com/a/new-avatar=s96-c';
      
      vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUser);
      vi.mocked(mockGoogleAvatarService.syncGoogleAvatar).mockResolvedValue({
        success: true,
        userId,
        avatarUrl: newAvatarUrl
      });

      // Act
      const result = await service.syncUserGoogleAvatar(userId, mockGoogleOAuthUser);

      // Assert
      expect(result.success).toBe(true);
      expect(result.userId).toBe(userId);
      expect(result.avatarUrl).toBe(newAvatarUrl);
      expect(result.source).toBe('google');
      expect(result.cacheInvalidated).toBe(true);
      expect(mockUserRepository.findById).toHaveBeenCalledWith(userId);
      expect(mockGoogleAvatarService.syncGoogleAvatar).toHaveBeenCalledWith(userId, mockGoogleOAuthUser);
      expect(avatarCacheManager.invalidateUser).toHaveBeenCalledWith(userId);
    });

    it('should handle missing user ID', async () => {
      // Act
      const result = await service.syncUserGoogleAvatar('');

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('User ID is required for avatar sync');
      expect(mockUserRepository.findById).not.toHaveBeenCalled();
    });

    it('should handle user not found', async () => {
      // Arrange
      const userId = 'nonexistent-user';
      vi.mocked(mockUserRepository.findById).mockResolvedValue(null);

      // Act
      const result = await service.syncUserGoogleAvatar(userId, mockGoogleOAuthUser);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe(`User not found with ID: ${userId}`);
      expect(mockGoogleAvatarService.syncGoogleAvatar).not.toHaveBeenCalled();
    });

    it('should handle Google avatar sync failure', async () => {
      // Arrange
      const userId = 'user-123';
      const errorMessage = 'Google API error';
      
      vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUser);
      vi.mocked(mockGoogleAvatarService.syncGoogleAvatar).mockResolvedValue({
        success: false,
        error: errorMessage
      });

      // Act
      const result = await service.syncUserGoogleAvatar(userId, mockGoogleOAuthUser);

      // Assert
      expect(result.success).toBe(false);
      expect(result.userId).toBe(userId);
      expect(result.error).toBe(errorMessage);
      expect(avatarCacheManager.invalidateUser).not.toHaveBeenCalled();
    });

    it('should skip cache invalidation when avatar unchanged and skipUnchanged is true', async () => {
      // Arrange
      const userId = 'user-123';
      const unchangedAvatarUrl = mockUser.avatarUrl;
      
      vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUser);
      vi.mocked(mockGoogleAvatarService.syncGoogleAvatar).mockResolvedValue({
        success: true,
        userId,
        avatarUrl: unchangedAvatarUrl
      });

      // Act
      const result = await service.syncUserGoogleAvatar(userId, mockGoogleOAuthUser, {
        skipUnchanged: true
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.cacheInvalidated).toBe(false);
      expect(avatarCacheManager.invalidateUser).not.toHaveBeenCalled();
    });

    it('should force cache invalidation when forceRefresh is true', async () => {
      // Arrange
      const userId = 'user-123';
      const unchangedAvatarUrl = mockUser.avatarUrl;
      
      vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUser);
      vi.mocked(mockGoogleAvatarService.syncGoogleAvatar).mockResolvedValue({
        success: true,
        userId,
        avatarUrl: unchangedAvatarUrl
      });

      // Act
      const result = await service.syncUserGoogleAvatar(userId, mockGoogleOAuthUser, {
        forceRefresh: true,
        skipUnchanged: true
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.cacheInvalidated).toBe(true);
      expect(avatarCacheManager.invalidateUser).toHaveBeenCalledWith(userId);
    });

    it('should handle sync without OAuth data (refresh mode)', async () => {
      // Arrange
      const userId = 'user-123';
      const errorMessage = 'Google avatar refresh requires user re-authentication or valid OAuth tokens';
      
      vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUser);
      vi.mocked(mockGoogleAvatarService.refreshGoogleAvatar).mockResolvedValue({
        success: false,
        error: errorMessage
      });

      // Act
      const result = await service.syncUserGoogleAvatar(userId);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe(errorMessage);
      expect(mockGoogleAvatarService.refreshGoogleAvatar).toHaveBeenCalledWith(userId);
    });
  });

  describe('refreshUserGoogleAvatar', () => {
    it('should force refresh with cache invalidation', async () => {
      // Arrange
      const userId = 'user-123';
      const newAvatarUrl = 'https://lh3.googleusercontent.com/a/refreshed-avatar=s96-c';
      
      vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUser);
      vi.mocked(mockGoogleAvatarService.refreshGoogleAvatar).mockResolvedValue({
        success: true,
        userId,
        avatarUrl: newAvatarUrl
      });

      // Act
      const result = await service.refreshUserGoogleAvatar(userId);

      // Assert
      expect(result.success).toBe(true);
      expect(result.cacheInvalidated).toBe(true);
      expect(mockGoogleAvatarService.refreshGoogleAvatar).toHaveBeenCalledWith(userId);
      expect(avatarCacheManager.invalidateUser).toHaveBeenCalledWith(userId);
    });
  });

  describe('removeUserGoogleAvatar', () => {
    it('should successfully remove Google avatar with cache invalidation', async () => {
      // Arrange
      const userId = 'user-123';
      
      vi.mocked(mockGoogleAvatarService.removeGoogleAvatar).mockResolvedValue({
        success: true,
        userId,
        avatarUrl: null
      });

      // Act
      const result = await service.removeUserGoogleAvatar(userId);

      // Assert
      expect(result.success).toBe(true);
      expect(result.userId).toBe(userId);
      expect(result.avatarUrl).toBeNull();
      expect(result.source).toBe('removed');
      expect(result.cacheInvalidated).toBe(true);
      expect(mockGoogleAvatarService.removeGoogleAvatar).toHaveBeenCalledWith(userId);
      expect(avatarCacheManager.invalidateUser).toHaveBeenCalledWith(userId);
    });

    it('should handle missing user ID', async () => {
      // Act
      const result = await service.removeUserGoogleAvatar('');

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('User ID is required for avatar removal');
      expect(mockGoogleAvatarService.removeGoogleAvatar).not.toHaveBeenCalled();
    });

    it('should handle removal failure', async () => {
      // Arrange
      const userId = 'user-123';
      const errorMessage = 'Removal failed';
      
      vi.mocked(mockGoogleAvatarService.removeGoogleAvatar).mockResolvedValue({
        success: false,
        error: errorMessage
      });

      // Act
      const result = await service.removeUserGoogleAvatar(userId);

      // Assert
      expect(result.success).toBe(false);
      expect(result.userId).toBe(userId);
      expect(result.error).toBe(errorMessage);
      expect(avatarCacheManager.invalidateUser).not.toHaveBeenCalled();
    });

    it('should skip cache invalidation when disabled', async () => {
      // Arrange
      const userId = 'user-123';
      
      vi.mocked(mockGoogleAvatarService.removeGoogleAvatar).mockResolvedValue({
        success: true,
        userId,
        avatarUrl: null
      });

      // Act
      const result = await service.removeUserGoogleAvatar(userId, {
        invalidateCache: false
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.cacheInvalidated).toBe(false);
      expect(avatarCacheManager.invalidateUser).not.toHaveBeenCalled();
    });
  });

  describe('bulkSyncGoogleAvatars', () => {
    it('should successfully sync multiple users', async () => {
      // Arrange
      const userIds = ['user-1', 'user-2', 'user-3'];
      const mockUsers = userIds.map((id, index) => ({
        ...mockUser,
        id,
        avatarUrl: `https://example.com/avatar-${index}.jpg`
      }));

      // Mock findById for each user
      userIds.forEach((userId, index) => {
        vi.mocked(mockUserRepository.findById).mockResolvedValueOnce(mockUsers[index]);
      });

      // Mock successful sync for each user
      userIds.forEach((userId, index) => {
        vi.mocked(mockGoogleAvatarService.refreshGoogleAvatar).mockResolvedValueOnce({
          success: true,
          userId,
          avatarUrl: `https://lh3.googleusercontent.com/a/synced-${index}=s96-c`
        });
      });

      // Act
      const result = await service.bulkSyncGoogleAvatars(userIds);

      // Assert
      expect(result.totalUsers).toBe(3);
      expect(result.successCount).toBe(3);
      expect(result.failureCount).toBe(0);
      expect(result.results).toHaveLength(3);
      expect(result.results.every(r => r.success)).toBe(true);
      expect(avatarCacheManager.invalidateUser).toHaveBeenCalledTimes(3);
    });

    it('should handle mixed success and failure results', async () => {
      // Arrange
      const userIds = ['user-1', 'user-2', 'user-3'];
      const mockUsers = userIds.map((id, index) => ({
        ...mockUser,
        id,
        avatarUrl: `https://example.com/avatar-${index}.jpg`
      }));

      // Mock findById for each user
      userIds.forEach((userId, index) => {
        vi.mocked(mockUserRepository.findById).mockResolvedValueOnce(mockUsers[index]);
      });

      // Mock mixed results
      vi.mocked(mockGoogleAvatarService.refreshGoogleAvatar)
        .mockResolvedValueOnce({
          success: true,
          userId: 'user-1',
          avatarUrl: 'https://lh3.googleusercontent.com/a/synced-1=s96-c'
        })
        .mockResolvedValueOnce({
          success: false,
          error: 'Sync failed for user-2'
        })
        .mockResolvedValueOnce({
          success: true,
          userId: 'user-3',
          avatarUrl: 'https://lh3.googleusercontent.com/a/synced-3=s96-c'
        });

      // Act
      const result = await service.bulkSyncGoogleAvatars(userIds);

      // Assert
      expect(result.totalUsers).toBe(3);
      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(1);
      expect(result.results).toHaveLength(3);
      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(false);
      expect(result.results[2].success).toBe(true);
    });

    it('should handle empty user list', async () => {
      // Act
      const result = await service.bulkSyncGoogleAvatars([]);

      // Assert
      expect(result.totalUsers).toBe(0);
      expect(result.successCount).toBe(0);
      expect(result.failureCount).toBe(0);
      expect(result.results).toHaveLength(0);
    });
  });

  describe('syncCompanyGoogleAvatars', () => {
    it('should successfully sync all users in a company', async () => {
      // Arrange
      const companyId = 'company-456';
      const companyUsers = [
        { ...mockUser, id: 'user-1' },
        { ...mockUser, id: 'user-2' },
        { ...mockUser, id: 'user-3' }
      ];

      vi.mocked(mockUserRepository.findByCompany).mockResolvedValue(companyUsers);
      
      // Mock successful sync for each user
      companyUsers.forEach((user) => {
        vi.mocked(mockUserRepository.findById).mockResolvedValueOnce(user);
        vi.mocked(mockGoogleAvatarService.refreshGoogleAvatar).mockResolvedValueOnce({
          success: true,
          userId: user.id,
          avatarUrl: `https://lh3.googleusercontent.com/a/synced-${user.id}=s96-c`
        });
      });

      // Act
      const result = await service.syncCompanyGoogleAvatars(companyId);

      // Assert
      expect(result.totalUsers).toBe(3);
      expect(result.successCount).toBe(3);
      expect(result.failureCount).toBe(0);
      expect(mockUserRepository.findByCompany).toHaveBeenCalledWith(companyId);
    });

    it('should handle missing company ID', async () => {
      // Act
      const result = await service.syncCompanyGoogleAvatars('');

      // Assert
      expect(result.totalUsers).toBe(0);
      expect(result.successCount).toBe(0);
      expect(result.failureCount).toBe(1);
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toBe('Company ID is required for company avatar sync');
    });

    it('should handle company with no users', async () => {
      // Arrange
      const companyId = 'empty-company';
      vi.mocked(mockUserRepository.findByCompany).mockResolvedValue([]);

      // Act
      const result = await service.syncCompanyGoogleAvatars(companyId);

      // Assert
      expect(result.totalUsers).toBe(0);
      expect(result.successCount).toBe(0);
      expect(result.failureCount).toBe(0);
      expect(result.results).toHaveLength(0);
    });
  });

  describe('utility methods', () => {
    it('should return service stats', () => {
      // Act
      const stats = service.getStats();

      // Assert
      expect(stats).toHaveProperty('cache');
      expect(stats).toHaveProperty('service');
      expect(stats.service.name).toBe('AvatarSyncService');
      expect(stats.service.features).toContain('google_avatar_sync');
      expect(stats.service.features).toContain('cache_invalidation');
    });

    it('should invalidate all cache', () => {
      // Act
      service.invalidateAllCache();

      // Assert
      expect(avatarCacheManager.invalidateAll).toHaveBeenCalled();
    });

    it('should invalidate user cache', () => {
      // Arrange
      const userId = 'user-123';

      // Act
      service.invalidateUserCache(userId);

      // Assert
      expect(avatarCacheManager.invalidateUser).toHaveBeenCalledWith(userId);
    });
  });

  describe('error handling', () => {
    it('should handle repository errors gracefully', async () => {
      // Arrange
      const userId = 'user-123';
      const repositoryError = new Error('Database connection failed');
      
      vi.mocked(mockUserRepository.findById).mockRejectedValue(repositoryError);

      // Act
      const result = await service.syncUserGoogleAvatar(userId, mockGoogleOAuthUser);

      // Assert
      expect(result.success).toBe(false);
      expect(result.userId).toBe(userId);
      expect(result.error).toContain('Failed to sync Google avatar');
      expect(result.error).toContain('Database connection failed');
    });

    it('should handle Google service errors gracefully', async () => {
      // Arrange
      const userId = 'user-123';
      const serviceError = new Error('Google API rate limit exceeded');
      
      vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUser);
      vi.mocked(mockGoogleAvatarService.syncGoogleAvatar).mockRejectedValue(serviceError);

      // Act
      const result = await service.syncUserGoogleAvatar(userId, mockGoogleOAuthUser);

      // Assert
      expect(result.success).toBe(false);
      expect(result.userId).toBe(userId);
      expect(result.error).toContain('Failed to sync Google avatar');
      expect(result.error).toContain('Google API rate limit exceeded');
    });
  });
});
