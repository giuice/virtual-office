// __tests__/google-avatar-service.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoogleAvatarService, GoogleOAuthUser } from '@/lib/services/google-avatar-service';
import { IUserRepository } from '@/repositories/interfaces';
import { User } from '@/types/database';
import * as avatarUtils from '@/lib/avatar-utils';

// Mock the debug logger
vi.mock('@/utils/debug-logger', () => ({
    debugLogger: {
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        trace: vi.fn()
    }
}));

// Mock the avatar utils
vi.mock('@/lib/avatar-utils', () => ({
    extractGoogleAvatarUrl: vi.fn()
}));

// Mock the Supabase repository
vi.mock('@/repositories/implementations/supabase', () => ({
    SupabaseUserRepository: vi.fn().mockImplementation(() => ({
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
    }))
}));

// Create a mock user repository
const createMockUserRepository = (): IUserRepository => ({
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
});

// Sample test data
const mockGoogleOAuthUser: GoogleOAuthUser = {
    id: 'google-user-123',
    email: 'test@example.com',
    name: 'Test User',
    picture: 'https://lh3.googleusercontent.com/a/default-user=s96-c',
    given_name: 'Test',
    family_name: 'User',
    verified_email: true
};

const mockUser: User = {
    id: 'user-123',
    companyId: 'company-123',
    supabase_uid: 'supabase-uid-123',
    email: 'test@example.com',
    displayName: 'Test User',
    avatarUrl: undefined,
    status: 'online',
    preferences: {},
    role: 'member',
    lastActive: '2024-01-01T00:00:00Z',
    createdAt: '2024-01-01T00:00:00Z'
};

describe('GoogleAvatarService', () => {
    let service: GoogleAvatarService;
    let mockUserRepository: IUserRepository;

    beforeEach(() => {
        mockUserRepository = createMockUserRepository();
        service = new GoogleAvatarService(mockUserRepository);
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('extractAvatarFromOAuth', () => {
        it('should successfully extract avatar URL from Google OAuth data', () => {
            // Arrange
            const expectedAvatarUrl = 'https://lh3.googleusercontent.com/a/default-user=s96-c';
            vi.mocked(avatarUtils.extractGoogleAvatarUrl).mockReturnValue(expectedAvatarUrl);

            // Act
            const result = service.extractAvatarFromOAuth(mockGoogleOAuthUser);

            // Assert
            expect(result.success).toBe(true);
            expect(result.avatarUrl).toBe(expectedAvatarUrl);
            expect(result.source).toBe('picture');
            expect(result.error).toBeUndefined();
            expect(avatarUtils.extractGoogleAvatarUrl).toHaveBeenCalledWith(mockGoogleOAuthUser);
        });

        it('should handle null OAuth data gracefully', () => {
            // Act
            const result = service.extractAvatarFromOAuth(null);

            // Assert
            expect(result.success).toBe(false);
            expect(result.avatarUrl).toBeNull();
            expect(result.source).toBeNull();
            expect(result.error).toBe('No OAuth data provided for Google avatar extraction');
            expect(avatarUtils.extractGoogleAvatarUrl).not.toHaveBeenCalled();
        });

        it('should handle undefined OAuth data gracefully', () => {
            // Act
            const result = service.extractAvatarFromOAuth(undefined);

            // Assert
            expect(result.success).toBe(false);
            expect(result.avatarUrl).toBeNull();
            expect(result.source).toBeNull();
            expect(result.error).toBe('No OAuth data provided for Google avatar extraction');
        });

        it('should handle case when no valid avatar URL is found', () => {
            // Arrange
            vi.mocked(avatarUtils.extractGoogleAvatarUrl).mockReturnValue(null);

            // Act
            const result = service.extractAvatarFromOAuth(mockGoogleOAuthUser);

            // Assert
            expect(result.success).toBe(false);
            expect(result.avatarUrl).toBeNull();
            expect(result.source).toBeNull();
            expect(result.error).toBe('No valid Google avatar URL found in OAuth data');
        });

        it('should identify correct source field for photoURL', () => {
            // Arrange
            const oauthDataWithPhotoURL = {
                ...mockGoogleOAuthUser,
                picture: undefined,
                photoURL: 'https://lh3.googleusercontent.com/a/photourl-test=s96-c'
            };
            vi.mocked(avatarUtils.extractGoogleAvatarUrl).mockReturnValue(oauthDataWithPhotoURL.photoURL);

            // Act
            const result = service.extractAvatarFromOAuth(oauthDataWithPhotoURL);

            // Assert
            expect(result.success).toBe(true);
            expect(result.source).toBe('photoURL');
        });

        it('should identify correct source field for photo', () => {
            // Arrange
            const oauthDataWithPhoto = {
                ...mockGoogleOAuthUser,
                picture: undefined,
                photoURL: undefined,
                photo: 'https://lh3.googleusercontent.com/a/photo-test=s96-c'
            };
            vi.mocked(avatarUtils.extractGoogleAvatarUrl).mockReturnValue(oauthDataWithPhoto.photo);

            // Act
            const result = service.extractAvatarFromOAuth(oauthDataWithPhoto);

            // Assert
            expect(result.success).toBe(true);
            expect(result.source).toBe('photo');
        });
    });

    describe('storeGoogleAvatarUrl', () => {
        it('should successfully store Google avatar URL', async () => {
            // Arrange
            const supabaseUid = 'supabase-uid-123';
            const googleAvatarUrl = 'https://lh3.googleusercontent.com/a/test-avatar=s96-c';
            const updatedUser = { ...mockUser, avatarUrl: googleAvatarUrl };

            vi.mocked(mockUserRepository.findBySupabaseUid).mockResolvedValue(mockUser);
            vi.mocked(mockUserRepository.update).mockResolvedValue(updatedUser);

            // Act
            const result = await service.storeGoogleAvatarUrl(supabaseUid, googleAvatarUrl);

            // Assert
            expect(result.success).toBe(true);
            expect(result.userId).toBe(mockUser.id);
            expect(result.avatarUrl).toBe(googleAvatarUrl);
            expect(result.error).toBeUndefined();
            expect(mockUserRepository.findBySupabaseUid).toHaveBeenCalledWith(supabaseUid);
            expect(mockUserRepository.update).toHaveBeenCalledWith(mockUser.id, {
                avatarUrl: googleAvatarUrl
            });
        });

        it('should handle missing Supabase UID', async () => {
            // Act
            const result = await service.storeGoogleAvatarUrl('', 'some-avatar-url');

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toBe('Supabase UID is required for storing Google avatar URL');
            expect(mockUserRepository.findBySupabaseUid).not.toHaveBeenCalled();
        });

        it('should handle user not found', async () => {
            // Arrange
            const supabaseUid = 'non-existent-uid';
            vi.mocked(mockUserRepository.findBySupabaseUid).mockResolvedValue(null);

            // Act
            const result = await service.storeGoogleAvatarUrl(supabaseUid, 'some-avatar-url');

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toBe(`User not found with Supabase UID: ${supabaseUid}`);
            expect(mockUserRepository.update).not.toHaveBeenCalled();
        });

        it('should handle null Google avatar URL gracefully', async () => {
            // Arrange
            const supabaseUid = 'supabase-uid-123';
            vi.mocked(mockUserRepository.findBySupabaseUid).mockResolvedValue(mockUser);

            // Act
            const result = await service.storeGoogleAvatarUrl(supabaseUid, null);

            // Assert
            expect(result.success).toBe(true);
            expect(result.userId).toBe(mockUser.id);
            expect(result.avatarUrl).toBeNull();
            expect(mockUserRepository.update).not.toHaveBeenCalled();
        });

        it('should handle user update failure', async () => {
            // Arrange
            const supabaseUid = 'supabase-uid-123';
            const googleAvatarUrl = 'https://lh3.googleusercontent.com/a/test-avatar=s96-c';

            vi.mocked(mockUserRepository.findBySupabaseUid).mockResolvedValue(mockUser);
            vi.mocked(mockUserRepository.update).mockResolvedValue(null);

            // Act
            const result = await service.storeGoogleAvatarUrl(supabaseUid, googleAvatarUrl);

            // Assert
            expect(result.success).toBe(false);
            expect(result.userId).toBe(mockUser.id);
            expect(result.error).toBe(`Failed to update user avatar URL for user ID: ${mockUser.id}`);
        });

        it('should handle repository errors', async () => {
            // Arrange
            const supabaseUid = 'supabase-uid-123';
            const googleAvatarUrl = 'https://lh3.googleusercontent.com/a/test-avatar=s96-c';
            const repositoryError = new Error('Database connection failed');

            vi.mocked(mockUserRepository.findBySupabaseUid).mockRejectedValue(repositoryError);

            // Act
            const result = await service.storeGoogleAvatarUrl(supabaseUid, googleAvatarUrl);

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toBe('Failed to store Google avatar URL: Database connection failed');
        });
    });

    describe('extractAndStoreGoogleAvatar', () => {
        it('should successfully extract and store Google avatar', async () => {
            // Arrange
            const supabaseUid = 'supabase-uid-123';
            const expectedAvatarUrl = 'https://lh3.googleusercontent.com/a/test-avatar=s96-c';
            const updatedUser = { ...mockUser, avatarUrl: expectedAvatarUrl };

            vi.mocked(avatarUtils.extractGoogleAvatarUrl).mockReturnValue(expectedAvatarUrl);
            vi.mocked(mockUserRepository.findBySupabaseUid).mockResolvedValue(mockUser);
            vi.mocked(mockUserRepository.update).mockResolvedValue(updatedUser);

            // Act
            const result = await service.extractAndStoreGoogleAvatar(supabaseUid, mockGoogleOAuthUser);

            // Assert
            expect(result.success).toBe(true);
            expect(result.userId).toBe(mockUser.id);
            expect(result.avatarUrl).toBe(expectedAvatarUrl);
            expect(result.error).toBeUndefined();
        });

        it('should handle extraction failure', async () => {
            // Arrange
            const supabaseUid = 'supabase-uid-123';
            vi.mocked(avatarUtils.extractGoogleAvatarUrl).mockReturnValue(null);

            // Act
            const result = await service.extractAndStoreGoogleAvatar(supabaseUid, mockGoogleOAuthUser);

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toContain('Avatar extraction failed');
            expect(mockUserRepository.findBySupabaseUid).not.toHaveBeenCalled();
        });

        it('should handle storage failure after successful extraction', async () => {
            // Arrange
            const supabaseUid = 'supabase-uid-123';
            const expectedAvatarUrl = 'https://lh3.googleusercontent.com/a/test-avatar=s96-c';

            vi.mocked(avatarUtils.extractGoogleAvatarUrl).mockReturnValue(expectedAvatarUrl);
            vi.mocked(mockUserRepository.findBySupabaseUid).mockResolvedValue(null); // User not found

            // Act
            const result = await service.extractAndStoreGoogleAvatar(supabaseUid, mockGoogleOAuthUser);

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toContain('User not found');
        });
    });

    describe('isValidGoogleAvatarUrl', () => {
        it('should validate Google avatar URLs correctly', () => {
            const testCases = [
                { url: 'https://lh3.googleusercontent.com/a/default-user=s96-c', expected: true },
                { url: 'https://lh4.googleusercontent.com/photo.jpg', expected: true },
                { url: 'https://accounts.google.com/avatar?sz=96', expected: true },
                { url: 'https://lh3.googleusercontent.com/image.png', expected: true }
            ];

            testCases.forEach(({ url, expected }) => {
                const result = service.isValidGoogleAvatarUrl(url);
                expect(result, `URL ${url} should be ${expected ? 'valid' : 'invalid'}`).toBe(expected);
            });
        });

        it('should reject invalid URLs', () => {
            const invalidUrls = [
                null,
                undefined,
                '',
                'not-a-url',
                'https://example.com/avatar.jpg',
                'https://facebook.com/photo.jpg'
            ];

            invalidUrls.forEach(url => {
                expect(service.isValidGoogleAvatarUrl(url)).toBe(false);
            });
        });

        it('should handle malformed URLs gracefully', () => {
            const malformedUrls = [
                'https://googleusercontent.com/[invalid]',
                'not-a-valid-url-at-all',
                'https://',
                'google.com' // Missing protocol
            ];

            malformedUrls.forEach(url => {
                expect(service.isValidGoogleAvatarUrl(url)).toBe(false);
            });
        });
    });

    describe('constructor', () => {
        it('should use provided user repository', () => {
            const customRepository = createMockUserRepository();
            const customService = new GoogleAvatarService(customRepository);

            // The service should use the provided repository
            expect(customService).toBeInstanceOf(GoogleAvatarService);
        });

        it('should use default repository when none provided', () => {
            const defaultService = new GoogleAvatarService();

            // Should not throw and should be properly instantiated
            expect(defaultService).toBeInstanceOf(GoogleAvatarService);
        });
    });

    describe('refreshGoogleAvatar', () => {
        it('should return error for missing user ID', async () => {
            // Act
            const result = await service.refreshGoogleAvatar('');

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toBe('User ID is required for Google avatar refresh');
            expect(mockUserRepository.findById).not.toHaveBeenCalled();
        });

        it('should return error for non-existent user', async () => {
            // Arrange
            const userId = 'nonexistent-user';
            vi.mocked(mockUserRepository.findById).mockResolvedValue(null);

            // Act
            const result = await service.refreshGoogleAvatar(userId);

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toBe(`User not found with ID: ${userId}`);
            expect(mockUserRepository.findById).toHaveBeenCalledWith(userId);
        });

        it('should return error indicating need for re-authentication', async () => {
            // Arrange
            const userId = 'user-123';
            vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUser);

            // Act
            const result = await service.refreshGoogleAvatar(userId);

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toBe('Google avatar refresh requires user re-authentication or valid OAuth tokens');
        });

        it('should handle repository errors', async () => {
            // Arrange
            const userId = 'user-123';
            const repositoryError = new Error('Database connection failed');
            vi.mocked(mockUserRepository.findById).mockRejectedValue(repositoryError);

            // Act
            const result = await service.refreshGoogleAvatar(userId);

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toBe('Failed to refresh Google avatar: Database connection failed');
        });
    });

    describe('syncGoogleAvatar', () => {
        it('should successfully sync Google avatar with OAuth data', async () => {
            // Arrange
            const userId = 'user-123';
            const newAvatarUrl = 'https://lh3.googleusercontent.com/a/new-avatar=s96-c';
            const updatedUser = { ...mockUser, avatarUrl: newAvatarUrl };

            vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUser);
            vi.mocked(avatarUtils.extractGoogleAvatarUrl).mockReturnValue(newAvatarUrl);
            vi.mocked(mockUserRepository.update).mockResolvedValue(updatedUser);

            // Act
            const result = await service.syncGoogleAvatar(userId, mockGoogleOAuthUser);

            // Assert
            expect(result.success).toBe(true);
            expect(result.userId).toBe(userId);
            expect(result.avatarUrl).toBe(newAvatarUrl);
            expect(mockUserRepository.findById).toHaveBeenCalledWith(userId);
            expect(mockUserRepository.update).toHaveBeenCalledWith(userId, {
                avatarUrl: newAvatarUrl
            });
        });

        it('should return error for missing user ID', async () => {
            // Act
            const result = await service.syncGoogleAvatar('', mockGoogleOAuthUser);

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toBe('User ID is required for Google avatar sync');
            expect(mockUserRepository.findById).not.toHaveBeenCalled();
        });

        it('should return error for non-existent user', async () => {
            // Arrange
            const userId = 'nonexistent-user';
            vi.mocked(mockUserRepository.findById).mockResolvedValue(null);

            // Act
            const result = await service.syncGoogleAvatar(userId, mockGoogleOAuthUser);

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toBe(`User not found with ID: ${userId}`);
        });

        it('should handle failed avatar extraction', async () => {
            // Arrange
            const userId = 'user-123';
            vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUser);
            vi.mocked(avatarUtils.extractGoogleAvatarUrl).mockReturnValue(null);

            // Act
            const result = await service.syncGoogleAvatar(userId, mockGoogleOAuthUser);

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toContain('Avatar extraction failed');
        });

        it('should skip update when avatar URL is unchanged', async () => {
            // Arrange
            const userId = 'user-123';
            const unchangedAvatarUrl = mockUser.avatarUrl;

            vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUser);
            vi.mocked(avatarUtils.extractGoogleAvatarUrl).mockReturnValue(unchangedAvatarUrl);

            // Act
            const result = await service.syncGoogleAvatar(userId, mockGoogleOAuthUser);

            // Assert
            expect(result.success).toBe(true);
            expect(result.userId).toBe(userId);
            expect(result.avatarUrl).toBe(unchangedAvatarUrl);
            expect(mockUserRepository.update).not.toHaveBeenCalled();
        });

        it('should handle repository update failure', async () => {
            // Arrange
            const userId = 'user-123';
            const newAvatarUrl = 'https://lh3.googleusercontent.com/a/new-avatar=s96-c';

            vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUser);
            vi.mocked(avatarUtils.extractGoogleAvatarUrl).mockReturnValue(newAvatarUrl);
            vi.mocked(mockUserRepository.update).mockResolvedValue(null);

            // Act
            const result = await service.syncGoogleAvatar(userId, mockGoogleOAuthUser);

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toBe(`Failed to update user avatar URL for user ID: ${userId}`);
        });
    });

    describe('bulkSyncGoogleAvatars', () => {
        it('should successfully sync multiple users', async () => {
            // Arrange
            const userOAuthPairs = [
                { userId: 'user-1', oauthData: { ...mockGoogleOAuthUser, id: 'google-1' } },
                { userId: 'user-2', oauthData: { ...mockGoogleOAuthUser, id: 'google-2' } },
                { userId: 'user-3', oauthData: { ...mockGoogleOAuthUser, id: 'google-3' } }
            ];

            // Mock successful sync for each user
            userOAuthPairs.forEach((pair, index) => {
                const user = { ...mockUser, id: pair.userId };
                const newAvatarUrl = `https://lh3.googleusercontent.com/a/synced-${index}=s96-c`;
                const updatedUser = { ...user, avatarUrl: newAvatarUrl };

                vi.mocked(mockUserRepository.findById).mockResolvedValueOnce(user);
                vi.mocked(avatarUtils.extractGoogleAvatarUrl).mockReturnValueOnce(newAvatarUrl);
                vi.mocked(mockUserRepository.update).mockResolvedValueOnce(updatedUser);
            });

            // Act
            const results = await service.bulkSyncGoogleAvatars(userOAuthPairs);

            // Assert
            expect(results).toHaveLength(3);
            expect(results.every(r => r.success)).toBe(true);
            expect(mockUserRepository.findById).toHaveBeenCalledTimes(3);
            expect(mockUserRepository.update).toHaveBeenCalledTimes(3);
        });

        it('should handle mixed success and failure results', async () => {
            // Arrange
            const userOAuthPairs = [
                { userId: 'user-1', oauthData: { ...mockGoogleOAuthUser, id: 'google-1' } },
                { userId: 'user-2', oauthData: null }, // This will fail
                { userId: 'user-3', oauthData: { ...mockGoogleOAuthUser, id: 'google-3' } }
            ];

            // Mock first user success
            const user1 = { ...mockUser, id: 'user-1' };
            const newAvatarUrl1 = 'https://lh3.googleusercontent.com/a/synced-1=s96-c';
            const updatedUser1 = { ...user1, avatarUrl: newAvatarUrl1 };

            vi.mocked(mockUserRepository.findById).mockResolvedValueOnce(user1);
            vi.mocked(avatarUtils.extractGoogleAvatarUrl).mockReturnValueOnce(newAvatarUrl1);
            vi.mocked(mockUserRepository.update).mockResolvedValueOnce(updatedUser1);

            // Mock second user failure (will be handled by extractGoogleAvatarUrl returning null)
            const user2 = { ...mockUser, id: 'user-2' };
            vi.mocked(mockUserRepository.findById).mockResolvedValueOnce(user2);
            vi.mocked(avatarUtils.extractGoogleAvatarUrl).mockReturnValueOnce(null);

            // Mock third user success
            const user3 = { ...mockUser, id: 'user-3' };
            const newAvatarUrl3 = 'https://lh3.googleusercontent.com/a/synced-3=s96-c';
            const updatedUser3 = { ...user3, avatarUrl: newAvatarUrl3 };

            vi.mocked(mockUserRepository.findById).mockResolvedValueOnce(user3);
            vi.mocked(avatarUtils.extractGoogleAvatarUrl).mockReturnValueOnce(newAvatarUrl3);
            vi.mocked(mockUserRepository.update).mockResolvedValueOnce(updatedUser3);

            // Act
            const results = await service.bulkSyncGoogleAvatars(userOAuthPairs);

            // Assert
            expect(results).toHaveLength(3);
            expect(results[0].success).toBe(true);
            expect(results[1].success).toBe(false);
            expect(results[2].success).toBe(true);
        });

        it('should handle empty array', async () => {
            // Act
            const results = await service.bulkSyncGoogleAvatars([]);

            // Assert
            expect(results).toHaveLength(0);
            expect(mockUserRepository.findById).not.toHaveBeenCalled();
        });
    });

    describe('removeGoogleAvatar', () => {
        it('should successfully remove Google avatar', async () => {
            // Arrange
            const userId = 'user-123';
            const userWithGoogleAvatar = {
                ...mockUser,
                avatarUrl: 'https://lh3.googleusercontent.com/a/test-avatar=s96-c'
            };
            const updatedUser = { ...userWithGoogleAvatar, avatarUrl: null };

            vi.mocked(mockUserRepository.findById).mockResolvedValue(userWithGoogleAvatar);
            vi.mocked(mockUserRepository.update).mockResolvedValue(updatedUser);
            vi.mocked(service.isValidGoogleAvatarUrl).mockReturnValue(true);

            // Act
            const result = await service.removeGoogleAvatar(userId);

            // Assert
            expect(result.success).toBe(true);
            expect(result.userId).toBe(userId);
            expect(result.avatarUrl).toBeNull();
            expect(mockUserRepository.update).toHaveBeenCalledWith(userId, {
                avatarUrl: null
            });
        });

        it('should return error for missing user ID', async () => {
            // Act
            const result = await service.removeGoogleAvatar('');

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toBe('User ID is required for Google avatar removal');
            expect(mockUserRepository.findById).not.toHaveBeenCalled();
        });

        it('should return error for non-existent user', async () => {
            // Arrange
            const userId = 'nonexistent-user';
            vi.mocked(mockUserRepository.findById).mockResolvedValue(null);

            // Act
            const result = await service.removeGoogleAvatar(userId);

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toBe(`User not found with ID: ${userId}`);
        });

        it('should skip removal when user has no Google avatar', async () => {
            // Arrange
            const userId = 'user-123';
            const userWithoutGoogleAvatar = {
                ...mockUser,
                avatarUrl: 'https://example.com/custom-avatar.jpg'
            };

            vi.mocked(mockUserRepository.findById).mockResolvedValue(userWithoutGoogleAvatar);
            vi.mocked(service.isValidGoogleAvatarUrl).mockReturnValue(false);

            // Act
            const result = await service.removeGoogleAvatar(userId);

            // Assert
            expect(result.success).toBe(true);
            expect(result.userId).toBe(userId);
            expect(result.avatarUrl).toBe(userWithoutGoogleAvatar.avatarUrl);
            expect(mockUserRepository.update).not.toHaveBeenCalled();
        });

        it('should handle repository update failure', async () => {
            // Arrange
            const userId = 'user-123';
            const userWithGoogleAvatar = {
                ...mockUser,
                avatarUrl: 'https://lh3.googleusercontent.com/a/test-avatar=s96-c'
            };

            vi.mocked(mockUserRepository.findById).mockResolvedValue(userWithGoogleAvatar);
            vi.mocked(service.isValidGoogleAvatarUrl).mockReturnValue(true);
            vi.mocked(mockUserRepository.update).mockResolvedValue(null);

            // Act
            const result = await service.removeGoogleAvatar(userId);

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toBe(`Failed to remove avatar URL for user ID: ${userId}`);
        });
    });
});