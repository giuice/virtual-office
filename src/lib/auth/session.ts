// src/lib/auth/session.ts
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

type SessionResult = {
  userId?: string;
  userDbId?: string; // Database UUID (different from Firebase UID)
  error?: string;
};

/**
 * Validates the user session and returns the user ID if valid
 * Handles the mismatch between Firebase UIDs and Database UUIDs
 * 
 * @returns Object containing userId (Firebase UID), userDbId (Database UUID), and error (if any)
 */
export async function validateUserSession(): Promise<SessionResult> {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      console.error('Session error:', error.message);
      return { error: error.message };
    }
    
    if (!session) {
      return { error: 'No active session' };
    }
    
    const firebaseUid = session.user.id; // This is the Firebase UID
    
    // Get the database user record to fetch the database UUID
    const { data: userRecord, error: userError } = await supabase
      .from('users')
      .select('id') // Database UUID
      .eq('auth_id', firebaseUid) // auth_id column holds the Firebase UID
      .single();
    
    if (userError) {
      console.error('User lookup error:', userError.message);
      return { userId: firebaseUid, error: 'User record not found' };
    }
    
    // Return both IDs for flexible usage
    return { 
      userId: firebaseUid,   // Firebase UID (from auth)
      userDbId: userRecord.id // Database UUID (from users table)
    };
    
  } catch (error) {
    console.error('Session validation error:', error);
    return { error: 'Failed to validate session' };
  }
}
