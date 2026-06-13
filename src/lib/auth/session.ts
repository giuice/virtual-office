// src/lib/auth/session.ts
import { NextResponse } from 'next/server';
import type { SupabaseClient, User as SupabaseAuthUser } from '@supabase/supabase-js';
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

export async function requireAuthUser(): Promise<RequireAuthResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return {
      errorResponse: NextResponse.json(
        { error: 'Authentication required', code: 'UNAUTHORIZED' },
        { status: 401 }
      ),
    };
  }

  const userRepository = new SupabaseUserRepository(supabase);

  let dbUser: User | null;
  try {
    dbUser = await userRepository.findBySupabaseUid(data.user.id);
  } catch (lookupError) {
    console.error('Auth user profile lookup failed:', lookupError);
    return {
      errorResponse: NextResponse.json(
        { error: 'Failed to load authenticated user profile' },
        { status: 500 }
      ),
    };
  }

  if (!dbUser) {
    return {
      errorResponse: NextResponse.json(
        { error: 'Authenticated user profile not found' },
        { status: 404 }
      ),
    };
  }

  return { supabase, dbUser, authUser: data.user };
}
