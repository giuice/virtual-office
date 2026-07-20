// src/lib/auth/session.ts
import type { NextResponse } from 'next/server';
import type { SupabaseClient, User as SupabaseAuthUser } from '@supabase/supabase-js';
import { API_ERROR_CODES } from '@/lib/api/error-contract';
import { jsonError } from '@/lib/api/server-error';
import {
  createAuthCorrelationId,
  getAuthErrorCode,
  recordAuthValidation,
} from '@/lib/auth/auth-metrics';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { SupabaseUserRepository } from '@/repositories/implementations/supabase';
import type { User } from '@/types/database';

type SessionResult = {
  supabaseUid?: string; // Supabase Auth UID
  userDbId?: string; // Database UUID (from users table)
  error?: string;
};

/**
 * Validates the user session and returns the user ID if valid
 * Handles the relationship between Supabase Auth UIDs and Database UUIDs
 *
 * @returns Object containing supabaseUid (Supabase Auth UID), userDbId (Database UUID), and error (if any)
 */
export async function validateUserSession(): Promise<SessionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    
    const { data, error } = await supabase.auth.getUser();
    
    if (error) {
      console.error('Session error:', error.message);
      return { error: error.message };
    }
    
    if (!data.user) {
      return { error: 'No active session' };
    }
    
    const supabaseUid = data.user.id; // This is the Supabase Auth UID
    
    // Get the database user record to fetch the database UUID
    const { data: userRecord, error: userError } = await supabase
      .from('users')
      .select('id') // Database UUID
      .eq('supabase_uid', supabaseUid) // supabase_uid column holds the Supabase Auth UID
      .single();
    
    if (userError) {
      console.error('User lookup error:', userError.message);
      return { supabaseUid, error: 'User record not found' };
    }
    
    // Return both IDs for flexible usage
    return { 
      supabaseUid,   // Supabase Auth UID (from auth)
      userDbId: userRecord.id // Database UUID (from users table)
    };
    
  } catch (error) {
    console.error('Session validation error:', error);
    return { error: 'Failed to validate session' };
  }
}

type RequireAuthResult =
  | { supabase: SupabaseClient; dbUser: User; authUser: SupabaseAuthUser }
  | { errorResponse: NextResponse };

interface RequireAuthUserOptions {
  correlationId?: string;
  pathname?: string;
  beforeDatabaseOperation?: () => void;
}

type RequireAuthUserArgument = RequireAuthUserOptions | (() => void);

function normalizeRequireAuthOptions(argument?: RequireAuthUserArgument): RequireAuthUserOptions {
  return typeof argument === 'function' ? { beforeDatabaseOperation: argument } : (argument ?? {});
}

export async function requireAuthUser(argument?: RequireAuthUserArgument): Promise<RequireAuthResult> {
  const { correlationId: providedCorrelationId, pathname, beforeDatabaseOperation } = normalizeRequireAuthOptions(argument);
  const correlationId = providedCorrelationId ?? createAuthCorrelationId();
  let refreshed = false;
  const supabase = await createSupabaseServerClient(undefined, {
    onAuthCookiesSet: () => {
      refreshed = true;
    },
  });
  let authResult: Awaited<ReturnType<typeof supabase.auth.getUser>>;
  try {
    authResult = await supabase.auth.getUser();
  } catch (error) {
    recordAuthValidation({
      correlationId,
      boundary: 'route',
      pathname: pathname ?? '/unattributed',
      authMethod: 'getUser',
      authStatus: 'error',
      authErrorCode: getAuthErrorCode(error),
      refreshed,
    });
    throw error;
  }

  const { data, error } = authResult;
  recordAuthValidation({
    correlationId,
    boundary: 'route',
    pathname: pathname ?? '/unattributed',
    authMethod: 'getUser',
    authStatus: error ? 'error' : data.user ? 'authenticated' : 'unauthenticated',
    authErrorCode: getAuthErrorCode(error),
    refreshed,
  });

  if (error || !data.user) {
    const isRateLimited = error?.status === 429;
    return {
      errorResponse: jsonError(
        isRateLimited ? 429 : 401,
        isRateLimited ? API_ERROR_CODES.RATE_LIMITED : API_ERROR_CODES.UNAUTHORIZED,
        isRateLimited ? 'Authentication service rate limit reached' : 'Authentication required',
        { correlationId, cause: error, context: 'requireAuthUser.getUser' }
      ),
    };
  }

  const userRepository = new SupabaseUserRepository(supabase);

  let dbUser: User | null;
  try {
    beforeDatabaseOperation?.();
    dbUser = await userRepository.findBySupabaseUid(data.user.id);
  } catch (lookupError) {
    return {
      errorResponse: jsonError(
        500,
        API_ERROR_CODES.INTERNAL_ERROR,
        'Failed to load authenticated user profile',
        { correlationId, cause: lookupError, context: 'requireAuthUser.profileLookup' }
      ),
    };
  }

  if (!dbUser) {
    return {
      errorResponse: jsonError(
        404,
        API_ERROR_CODES.PROFILE_NOT_FOUND,
        'Authenticated user profile not found',
        { correlationId, context: 'requireAuthUser.profileLookup' }
      ),
    };
  }

  return { supabase, dbUser, authUser: data.user };
}
