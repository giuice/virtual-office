// src/lib/auth/session-manager.ts
import { supabase } from '@/lib/supabase/client';
import { AuthError } from '@supabase/supabase-js';

/**
 * Session management utilities for multi-account support
 */
export class SessionManager {
  /**
   * Clear all browser data related to authentication
   * This helps resolve multi-account conflicts during testing
   */
  static clearBrowserData(): void {
    try {
      // Clear localStorage
      const authKeys = Object.keys(localStorage).filter(key => 
        key.includes('supabase') || 
        key.includes('auth') || 
        key.includes('session') ||
        key.includes('sb-')
      );
      
      authKeys.forEach(key => {
        localStorage.removeItem(key);
      });

      // Clear sessionStorage
      const sessionKeys = Object.keys(sessionStorage).filter(key => 
        key.includes('supabase') || 
        key.includes('auth') || 
        key.includes('session') ||
        key.includes('sb-')
      );
      
      sessionKeys.forEach(key => {
        sessionStorage.removeItem(key);
      });

      // Clear cookies related to auth (if any)
      document.cookie.split(";").forEach(cookie => {
        const eqPos = cookie.indexOf("=");
        const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
        if (name.includes('supabase') || name.includes('auth') || name.includes('sb-')) {
          document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
        }
      });

      console.log('Browser auth data cleared successfully');
    } catch (error) {
      console.error('Error clearing browser data:', error);
      throw new Error('Failed to clear browser authentication data');
    }
  }

  /**
   * Validate current session integrity
   * Checks if the session is valid and not expired
   */
  static async validateSession(): Promise<boolean> {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) {
        console.error('Session validation error:', error);
        return false;
      }

      if (!session) {
        return false;
      }

      // Check if session is expired
      const now = Math.floor(Date.now() / 1000);
      if (session.expires_at && session.expires_at < now) {
        console.log('Session expired');
        return false;
      }

      // Verify the session with the server
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        console.error('User validation error:', userError);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Session validation failed:', error);
      return false;
    }
  }

  /**
   * Handle authentication conflicts that occur with multiple accounts
   * Provides recovery strategies based on the error type
   */
  static async handleAuthConflicts(error: AuthError): Promise<void> {
    console.log('Handling auth conflict:', error.message);

    try {
      switch (error.message) {
        case 'Invalid login credentials':
        case 'Email not confirmed':
          // These are user input errors, not conflicts
          throw error;

        case 'User already registered':
          // Clear any existing session and allow re-authentication
          await supabase.auth.signOut();
          this.clearBrowserData();
          throw new Error('Account already exists. Please sign in instead of signing up.');

        default:
          // For unknown auth errors, try to recover by clearing state
          if (error.message.includes('session') || 
              error.message.includes('token') || 
              error.message.includes('expired')) {
            
            console.log('Attempting to recover from session/token error');
            
            // Sign out current session
            await supabase.auth.signOut();
            
            // Clear browser data
            this.clearBrowserData();
            
            // Wait a moment for cleanup to complete
            await new Promise(resolve => setTimeout(resolve, 100));
            
            throw new Error('Session conflict detected. Please sign in again.');
          }
          
          // Re-throw unknown errors
          throw error;
      }
    } catch (recoveryError) {
      console.error('Error during conflict recovery:', recoveryError);
      throw recoveryError;
    }
  }

  /**
   * Switch account utility for testing different accounts
   * Signs out current user and clears all auth data
   */
  static async switchAccount(): Promise<void> {
    try {
      console.log('Switching account - signing out current user');
      
      // Sign out current session
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Error signing out:', error);
      }

      // Clear all browser auth data
      this.clearBrowserData();

      // Wait for cleanup to complete
      await new Promise(resolve => setTimeout(resolve, 200));

      console.log('Account switch completed - ready for new authentication');
    } catch (error) {
      console.error('Error switching account:', error);
      throw new Error('Failed to switch account. Please refresh the page and try again.');
    }
  }

  /**
   * Refresh the current session token
   * Useful for handling token expiration
   */
  static async refreshSession(): Promise<boolean> {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      
      if (error) {
        console.error('Session refresh error:', error);
        return false;
      }

      if (!data.session) {
        console.log('No session to refresh');
        return false;
      }

      console.log('Session refreshed successfully');
      return true;
    } catch (error) {
      console.error('Failed to refresh session:', error);
      return false;
    }
  }

  /**
   * Get detailed session information for debugging
   */
  static async getSessionInfo(): Promise<{
    hasSession: boolean;
    isExpired: boolean;
    user: any;
    expiresAt?: number;
    timeUntilExpiry?: number;
  }> {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error || !session) {
        return {
          hasSession: false,
          isExpired: false,
          user: null
        };
      }

      const now = Math.floor(Date.now() / 1000);
      const isExpired = session.expires_at ? session.expires_at < now : false;
      const timeUntilExpiry = session.expires_at ? session.expires_at - now : undefined;

      return {
        hasSession: true,
        isExpired,
        user: session.user,
        expiresAt: session.expires_at,
        timeUntilExpiry
      };
    } catch (error) {
      console.error('Error getting session info:', error);
      return {
        hasSession: false,
        isExpired: false,
        user: null
      };
    }
  }
}