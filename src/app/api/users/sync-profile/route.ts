// src/app/api/users/sync-profile/route.ts
// import { cookies } from 'next/headers'; // No longer needed directly here
// import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'; // Replaced
import { createSupabaseServerClient } from '@/lib/supabase/server-client'; // Use the new server client helper
import { getAuthErrorCode, recordAuthValidation } from '@/lib/auth/auth-metrics';
import { API_ERROR_CODES } from '@/lib/api/error-contract';
import { createCorrelationId, jsonError, jsonSuccess, logServerError } from '@/lib/api/server-error';
import { IUserRepository } from '@/repositories/interfaces';
import { SupabaseUserRepository } from '@/repositories/implementations/supabase';
import { syncUserProfileSchema } from '@/lib/presence/user-write-contracts';
import { extractGoogleAvatarUrl } from '@/lib/avatar-utils';
import {
  isLegacyPresenceRouteAuditError,
  recordLegacyPresenceRouteCall,
} from '@/lib/presence/legacy-route-audit';

// Helper function to validate Google avatar URLs
function isValidGoogleAvatarUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    
    // Check for Google domains
    const googleDomains = ['googleapis.com', 'googleusercontent.com', 'google.com'];
    
    const hostname = parsedUrl.hostname.toLowerCase();
    const isGoogleDomain = googleDomains.some(
      domain => hostname === domain || hostname.endsWith(`.${domain}`)
    );
    
    if (!isGoogleDomain) {
      return false;
    }
    
    // Check for HTTPS protocol
    if (parsedUrl.protocol !== 'https:') {
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}



export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const correlationId = createCorrelationId();
  let refreshed = false;

  try {
    // Get Supabase client using the server helper
    const supabase = await createSupabaseServerClient(undefined, {
      onAuthCookiesSet: () => {
        refreshed = true;
      },
    });

    // First verify the user is authenticated
    let authResult: Awaited<ReturnType<typeof supabase.auth.getUser>>;
    try {
      authResult = await supabase.auth.getUser();
    } catch (authValidationError) {
      recordAuthValidation({
        correlationId,
        boundary: 'route',
        pathname: '/api/users/sync-profile',
        authMethod: 'getUser',
        authStatus: 'error',
        authErrorCode: getAuthErrorCode(authValidationError),
        refreshed,
      });
      throw authValidationError;
    }
    const { data: { user }, error: authError } = authResult;
    recordAuthValidation({
      correlationId,
      boundary: 'route',
      pathname: '/api/users/sync-profile',
      authMethod: 'getUser',
      authStatus: authError ? 'error' : user ? 'authenticated' : 'unauthenticated',
      authErrorCode: getAuthErrorCode(authError),
      refreshed,
    });
    
    if (authError || !user) {
      const isRateLimited = authError?.status === 429;
      return jsonError(
        isRateLimited ? 429 : 401,
        isRateLimited ? API_ERROR_CODES.RATE_LIMITED : API_ERROR_CODES.UNAUTHORIZED,
        isRateLimited ? 'Authentication service rate limit reached' : 'Authentication required',
        { correlationId, cause: authError, context: 'users.syncProfile.getUser' }
      );
    }

    const supabaseAdmin = await createSupabaseServerClient('service_role');
    const userRepository: IUserRepository = new SupabaseUserRepository(supabaseAdmin);

    const rawBody: unknown = await request.json();
    if (
      typeof rawBody === 'object' &&
      rawBody !== null &&
      'status' in rawBody &&
      rawBody.status === 'offline'
    ) {
      await recordLegacyPresenceRouteCall('users-offline-status');
    }

    const parsedBody = syncUserProfileSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return jsonError(400, API_ERROR_CODES.BAD_REQUEST, 'Invalid profile sync request', {
        correlationId,
        context: 'users.syncProfile',
      });
    }
    const userData = parsedBody.data;

    if (userData.supabaseUid !== user.id || userData.email !== user.email) {
      return jsonError(403, API_ERROR_CODES.FORBIDDEN, 'Profile data does not match authenticated user', {
        correlationId,
        context: 'users.syncProfile',
      });
    }

    // Derive avatar data from the verified Auth user, never from request input.
    const metadataAvatarUrl = extractGoogleAvatarUrl(user.user_metadata);
    let googleAvatarUrl = metadataAvatarUrl ?? undefined;
    if (googleAvatarUrl && !isValidGoogleAvatarUrl(googleAvatarUrl)) {
        console.warn(JSON.stringify({
          event: 'api_warning',
          correlationId,
          context: 'users.syncProfile.googleAvatarUrl',
          code: 'INVALID_GOOGLE_AVATAR_URL',
        }));
        // Don't fail the request, just log the warning and continue without the avatar
        googleAvatarUrl = undefined;
    }

    // Check if user already exists
    const existingUser = await userRepository.findBySupabaseUid(userData.supabaseUid);
    if (existingUser) {
      // If user exists but we have a Google avatar URL to update, update it
      if (googleAvatarUrl && googleAvatarUrl !== existingUser.avatarUrl) {
        console.log('Updating existing user with Google avatar URL:', {
          userId: existingUser.id,
          currentAvatarUrl: existingUser.avatarUrl,
          newGoogleAvatarUrl: googleAvatarUrl
        });
        
        try {
          const updatedUser = await userRepository.update(existingUser.id, {
            avatarUrl: googleAvatarUrl
          });
          
          return jsonSuccess({
            success: true,
            user: updatedUser,
            message: 'User profile updated with Google avatar'
          }, correlationId);
        } catch (updateError) {
          logServerError(500, API_ERROR_CODES.INTERNAL_ERROR, 'Failed to update profile avatar', {
            correlationId,
            cause: updateError,
            context: 'users.syncProfile.avatarUpdate',
          });
          // Return existing user if update fails
          return jsonSuccess({
            success: true,
            user: existingUser,
            message: 'User profile exists, avatar update failed'
          }, correlationId);
        }
      }
      
      return jsonSuccess({
        success: true,
        user: existingUser,
        message: 'User profile already exists'
      }, correlationId);
    }

    // Create new user profile with Google avatar if provided
    const newUser = await userRepository.create({
      supabase_uid: userData.supabaseUid,
      email: userData.email,
      displayName: userData.displayName || userData.email.split('@')[0],
      status: 'online',
      companyId: null,
      role: 'member',
      preferences: {},
      avatarUrl: googleAvatarUrl || undefined, // Store Google avatar URL if provided
      currentSpaceId: null
    });

    console.log('Created new user profile with Google avatar:', {
      userId: newUser.id,
      email: newUser.email,
      hasGoogleAvatar: !!googleAvatarUrl
    });

    return jsonSuccess({
      success: true,
      user: newUser,
      message: 'User profile created successfully'
    }, correlationId, { status: 201 });

  } catch (error) {
    if (isLegacyPresenceRouteAuditError(error)) {
      return jsonError(503, error.code, 'Legacy presence audit unavailable', {
        correlationId,
        cause: error,
        context: 'users.syncProfile.legacyAudit',
      });
    }

    if (error instanceof SyntaxError) {
      return jsonError(400, API_ERROR_CODES.BAD_REQUEST, 'Invalid JSON payload', {
        correlationId,
        cause: error,
        context: 'users.syncProfile',
      });
    }

    return jsonError(500, API_ERROR_CODES.INTERNAL_ERROR, 'Failed to sync user profile', {
      correlationId,
      cause: error,
      context: 'users.syncProfile',
    });
  }
}
