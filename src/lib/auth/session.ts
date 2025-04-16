// src/lib/auth/session.ts
import { createSupabaseServerClient } from '@/lib/supabase/server-client'; // Use the new server client helper
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
    
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error) {
      console.error('Session error:', error.message);
      return { error: error.message };
    }
    
    if (!user) {
      return { error: 'No active session' };
    }
    
    const supabaseUid = user.id; // This is the Supabase Auth UID
    
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
