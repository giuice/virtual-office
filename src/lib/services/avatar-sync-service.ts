// src/lib/services/avatar-sync-service.ts
import { debugLogger } from '@/utils/debug-logger';
import { avatarCacheManager } from '@/lib/avatar-utils';
import { GoogleAvatarService, GoogleOAuthUser, GoogleAvatarStorageResult } from './google-avatar-service';
import { IUserRepository } from '@/repositories/interfaces';
import type { SupabaseUserRepository } from '@/repositories/implementations/supabase/SupabaseUserRepository';
import { User } from '@/types/database';

// Interface for avatar sync result
export interface AvatarSyncResult {
  success: boolean;
  userId?: string;
  avatarUrl?: string | null;
  source?: 'google' | 'custom' | 'removed';
  cacheInvalidated?: boolean;
  error?: string;
}

// Interface for bulk sync result
export interface BulkAvatarSyncResult {
  totalUsers: number;
  successCount: number;
  failureCount: number;
  results: AvatarSyncResult[];
}

// Interface for sync options
export interface AvatarSyncOptions {
  invalidateCache?: boolean;
  forceRefresh?: boolean;
  skipUnchanged?: boolean;
}

/**
 * Service for managing avatar synchronization with cache invalidation
 */
export class AvatarSyncService {
  private userRepository: IUserRepository;
  private googleAvatarService: GoogleAvatarService;

  constructor(
    userRepository?: IUserRepository,
    googleAvatarService?: GoogleAvatarService
  ) {
    this.userRepository = userRepository || ({} as unknown as IUserRepository);
    this.googleAvatarService = googleAvatarService || new GoogleAvatarService(this.userRepository);
  }

  /**
   * Sync Google avatar for a user with cache management
   * 
   * @param userId - User ID to sync avatar for
   * @param oauthData - Google OAuth data (optional, for fresh data)
   * @param options - Sync options
   * @returns AvatarSyncResult with operation result
   */
  async syncUserGoogleAvatar(
    userId: string,
    oauthData?: GoogleOAuthUser | null,
    options: AvatarSyncOptions = {}
  ): Promise<AvatarSyncResult> {
    const { invalidateCache = true, forceRefresh = false, skipUnchanged = true } = options;

    debugLogger.log('AvatarSyncService', 'Starting user Google avatar sync', {
      userId,
      hasOAuthData: !!oauthData,
      options
    });

    if (!userId) {
      const error = 'User ID is required for avatar sync';
      debugLogger.error('AvatarSyncService', error);
      return {
        success: false,
        error
      };
    }

    try {
      // Get current user data
      const user = await this.userRepository.findById(userId);
      
      if (!user) {
        const error = `User not found with ID: ${userId}`;
        debugLogger.error('AvatarSyncService', error);
        return {
          success: false,
          error
        };
      }

      const currentAvatarUrl = user.avatarUrl;

      // If we have OAuth data, use it for sync
      let syncResult: GoogleAvatarStorageResult;
      
      if (oauthData) {
        syncResult = await this.googleAvatarService.syncGoogleAvatar(userId, oauthData);
      } else {
        // Attempt to refresh from Google (this will currently return an error as noted in the service)
        syncResult = await this.googleAvatarService.refreshGoogleAvatar(userId);
      }

      if (!syncResult.success) {
        debugLogger.warn('AvatarSyncService', 'Google avatar sync failed', {
          userId,
          error: syncResult.error
        });
        return {
          success: false,
          userId,
          error: syncResult.error
        };
      }

      const newAvatarUrl = syncResult.avatarUrl;
      const avatarChanged = currentAvatarUrl !== newAvatarUrl;

      // Skip if unchanged and skipUnchanged is true
      if (!avatarChanged && skipUnchanged && !forceRefresh) {
        debugLogger.log('AvatarSyncService', 'Avatar unchanged, skipping cache invalidation', {
          userId,
          avatarUrl: currentAvatarUrl
        });
        return {
          success: true,
          userId,
          avatarUrl: currentAvatarUrl,
          source: 'google',
          cacheInvalidated: false
        };
      }

      // Invalidate cache if requested or if avatar changed
      let cacheInvalidated = false;
      if (invalidateCache && (avatarChanged || forceRefresh)) {
        avatarCacheManager.invalidateUser(userId);
        cacheInvalidated = true;
        
        debugLogger.log('AvatarSyncService', 'Invalidated avatar cache for user', {
          userId,
          reason: avatarChanged ? 'avatar_changed' : 'force_refresh'
        });
      }

      debugLogger.log('AvatarSyncService', 'Successfully synced user Google avatar', {
        userId,
        avatarChanged,
        cacheInvalidated,
        oldAvatarUrl: currentAvatarUrl?.substring(0, 50) + (currentAvatarUrl && currentAvatarUrl.length > 50 ? '...' : ''),
        newAvatarUrl: newAvatarUrl?.substring(0, 50) + (newAvatarUrl && newAvatarUrl.length > 50 ? '...' : '')
      });

      return {
        success: true,
        userId,
        avatarUrl: newAvatarUrl,
        source: 'google',
        cacheInvalidated
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      debugLogger.error('AvatarSyncService', 'Error syncing user Google avatar', {
        userId,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      });

      return {
        success: false,
        userId,
        error: `Failed to sync Google avatar: ${errorMessage}`
      };
    }
  }

  /**
   * Manually refresh Google avatar for a user
   * This is intended for user-initiated refresh actions
   * 
   * @param userId - User ID to refresh avatar for
   * @param options - Sync options
   * @returns AvatarSyncResult with operation result
   */
  async refreshUserGoogleAvatar(
    userId: string,
    options: AvatarSyncOptions = {}
  ): Promise<AvatarSyncResult> {
    debugLogger.log('AvatarSyncService', 'Starting manual Google avatar refresh', {
      userId,
      options
    });

    // Force refresh and cache invalidation for manual refresh
    const refreshOptions: AvatarSyncOptions = {
      invalidateCache: true,
      forceRefresh: true,
      skipUnchanged: false,
      ...options
    };

    return this.syncUserGoogleAvatar(userId, undefined, refreshOptions);
  }

  /**
   * Remove Google avatar for a user with cache invalidation
   * 
   * @param userId - User ID to remove avatar for
   * @param options - Sync options
   * @returns AvatarSyncResult with operation result
   */
  async removeUserGoogleAvatar(
    userId: string,
    options: AvatarSyncOptions = {}
  ): Promise<AvatarSyncResult> {
    const { invalidateCache = true } = options;

    debugLogger.log('AvatarSyncService', 'Starting Google avatar removal', {
      userId,
      options
    });

    if (!userId) {
      const error = 'User ID is required for avatar removal';
      debugLogger.error('AvatarSyncService', error);
      return {
        success: false,
        error
      };
    }

    try {
      const removeResult = await this.googleAvatarService.removeGoogleAvatar(userId);

      if (!removeResult.success) {
        debugLogger.warn('AvatarSyncService', 'Google avatar removal failed', {
          userId,
          error: removeResult.error
        });
        return {
          success: false,
          userId,
          error: removeResult.error
        };
      }

      // Invalidate cache if requested
      let cacheInvalidated = false;
      if (invalidateCache) {
        avatarCacheManager.invalidateUser(userId);
        cacheInvalidated = true;
        
        debugLogger.log('AvatarSyncService', 'Invalidated avatar cache after removal', {
          userId
        });
      }

      debugLogger.log('AvatarSyncService', 'Successfully removed user Google avatar', {
        userId,
        cacheInvalidated
      });

      return {
        success: true,
        userId,
        avatarUrl: null,
        source: 'removed',
        cacheInvalidated
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      debugLogger.error('AvatarSyncService', 'Error removing user Google avatar', {
        userId,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      });

      return {
        success: false,
        userId,
        error: `Failed to remove Google avatar: ${errorMessage}`
      };
    }
  }

  /**
   * Bulk sync Google avatars for multiple users
   * 
   * @param userIds - Array of user IDs to sync
   * @param options - Sync options
   * @returns BulkAvatarSyncResult with operation results
   */
  async bulkSyncGoogleAvatars(
    userIds: string[],
    options: AvatarSyncOptions = {}
  ): Promise<BulkAvatarSyncResult> {
    debugLogger.log('AvatarSyncService', 'Starting bulk Google avatar sync', {
      userCount: userIds.length,
      options
    });

    const results: AvatarSyncResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (const userId of userIds) {
      try {
        const result = await this.syncUserGoogleAvatar(userId, undefined, options);
        results.push(result);
        
        if (result.success) {
          successCount++;
        } else {
          failureCount++;
        }
        
        // Add a small delay to avoid overwhelming the database
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        debugLogger.error('AvatarSyncService', 'Error in bulk sync for user', {
          userId,
          error: errorMessage
        });
        
        const failureResult: AvatarSyncResult = {
          success: false,
          userId,
          error: `Bulk sync failed: ${errorMessage}`
        };
        
        results.push(failureResult);
        failureCount++;
      }
    }

    debugLogger.log('AvatarSyncService', 'Completed bulk Google avatar sync', {
      totalUsers: userIds.length,
      successCount,
      failureCount
    });

    return {
      totalUsers: userIds.length,
      successCount,
      failureCount,
      results
    };
  }

  /**
   * Sync avatars for all users in a company
   * 
   * @param companyId - Company ID to sync avatars for
   * @param options - Sync options
   * @returns BulkAvatarSyncResult with operation results
   */
  async syncCompanyGoogleAvatars(
    companyId: string,
    options: AvatarSyncOptions = {}
  ): Promise<BulkAvatarSyncResult> {
    debugLogger.log('AvatarSyncService', 'Starting company-wide Google avatar sync', {
      companyId,
      options
    });

    if (!companyId) {
      const error = 'Company ID is required for company avatar sync';
      debugLogger.error('AvatarSyncService', error);
      return {
        totalUsers: 0,
        successCount: 0,
        failureCount: 1,
        results: [{
          success: false,
          error
        }]
      };
    }

    try {
      // Get all users in the company
      const users = await this.userRepository.findByCompany(companyId);
      const userIds = users.map(user => user.id);

      debugLogger.log('AvatarSyncService', 'Found users for company avatar sync', {
        companyId,
        userCount: userIds.length
      });

      if (userIds.length === 0) {
        debugLogger.warn('AvatarSyncService', 'No users found for company', {
          companyId
        });
        return {
          totalUsers: 0,
          successCount: 0,
          failureCount: 0,
          results: []
        };
      }

      // Perform bulk sync
      return this.bulkSyncGoogleAvatars(userIds, options);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      debugLogger.error('AvatarSyncService', 'Error syncing company Google avatars', {
        companyId,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      });

      return {
        totalUsers: 0,
        successCount: 0,
        failureCount: 1,
        results: [{
          success: false,
          error: `Failed to sync company avatars: ${errorMessage}`
        }]
      };
    }
  }

  /**
   * Get sync statistics for monitoring
   * 
   * @returns Object with cache and sync statistics
   */
  getStats() {
    const cacheStats = avatarCacheManager.getStats();
    
    return {
      cache: cacheStats,
      service: {
        name: 'AvatarSyncService',
        version: '1.0.0',
        features: [
          'google_avatar_sync',
          'manual_refresh',
          'bulk_sync',
          'cache_invalidation',
          'company_sync'
        ]
      }
    };
  }

  /**
   * Invalidate cache for all users (utility method)
   */
  invalidateAllCache(): void {
    avatarCacheManager.invalidateAll();
    debugLogger.log('AvatarSyncService', 'Invalidated all avatar cache');
  }

  /**
   * Invalidate cache for specific user (utility method)
   */
  invalidateUserCache(userId: string): void {
    avatarCacheManager.invalidateUser(userId);
    debugLogger.log('AvatarSyncService', 'Invalidated avatar cache for user', { userId });
  }
}

// Export a default instance for convenience
export const avatarSyncService = new AvatarSyncService();