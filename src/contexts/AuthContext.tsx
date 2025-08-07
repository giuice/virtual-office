// src/contexts/AuthContext.tsx
'use client';

import { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase/client'; // Keep for direct auth actions
import { AuthContextType } from '@/types/auth'; // Updated type
import { getUserById, updateUserStatus, syncUserProfile } from '@/lib/api';
import { User } from '@supabase/supabase-js';
import { useSession } from '@/hooks/useSession'; // Import the new hook
import { extractGoogleAvatarUrl } from '@/lib/avatar-utils';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Get session state from the hook
  const { user, session, loading: sessionLoading, error: sessionError } = useSession();

  // Local state for tracking loading/error states of specific actions (signIn, signUp, etc.)
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Memoize the Supabase client instance from the import
  const supabaseClient = useMemo(() => supabase, []);

  // Update user status (presence) based on the user from useSession
  const updateStatus = async (currentUser: User | null, status: 'online' | 'offline') => {
    // Corrected: Only one check for currentUser needed
    if (currentUser) {
      try {
        // Check if user has a profile in the database using Supabase UID
        const userProfile = await getUserById(currentUser.id); // getUserById expects supabase_uid
        if (userProfile) {
          // Update status using the Database User ID (assuming updateUserStatus expects DB ID)
          // If updateUserStatus expects supabase_uid, change userProfile.id to currentUser.id
          await updateUserStatus(userProfile.id, status);
        } else {
          console.warn(`User profile not found for supabase_uid: ${currentUser.id}. Cannot update status.`);
        }
      } catch (error) {
        console.error('Error updating user status:', error);
        // Optionally set an error state specific to status updates if needed
      }
    }
  };

  // Effect to update status when user logs in/out (based on useSession)
  useEffect(() => {
    if (user) {
      updateStatus(user, 'online');

      // Check if this is a Google OAuth user and sync their profile
      if (user.app_metadata?.provider === 'google' && user.user_metadata) {
        syncGoogleOAuthUser(user);
      }
    }
    // No explicit 'offline' on logout needed here if handled by beforeunload

    // Update user status to offline when they close the tab or navigate away
    const handleBeforeUnload = () => {
      // Use the user state variable directly
      if (user) {
        // Note: This is best-effort and might not always run reliably,
        // especially on mobile or abrupt closes. Consider backend mechanisms too.
        updateStatus(user, 'offline');
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // No need to unsubscribe from onAuthStateChange here, useSession handles it
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]); // Depend on the user object from useSession

  // --- Auth Actions ---

  // Email/password sign in
  const signIn = async (email: string, password: string) => {
    setActionLoading(true);
    setActionError(null);
    try {
      // Use the memoized client instance
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // No need to setState here, useSession hook will update
    } catch (error: any) {
      console.error("Sign in error:", error);
      setActionError(error.message || 'An error occurred during sign in.');
      // Re-throw the error so the calling component can handle it if needed
      throw error;
    } finally {
      setActionLoading(false);
    }
  };

  // Email/password sign up
  const signUp = async (email: string, password: string, displayName?: string): Promise<void> => {
    setActionLoading(true);
    setActionError(null);
    try {
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          // Include email redirect URL if needed for email confirmation
          // emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: { displayName: displayName || email.split('@')[0] }, // Add display name if provided
        },
      });
      if (error) throw error;
      // Sign up successful, user object might be available in data.user
      // Sync profile if user data is present (might require email confirmation first depending on settings)
      if (data.user) {
        try {
          await syncUserProfile({
            supabase_uid: data.user.id,
            email: data.user.email!, // Email should exist on user object after signup
            displayName: data.user.user_metadata?.displayName || displayName || email.split('@')[0],
            status: 'online' as const,
          });
        } catch (syncError) {
          console.error("Error syncing profile after sign up:", syncError);
          // Decide how to handle profile sync failure - maybe notify user?
        }
      } else {
        // Handle case where sign up requires email confirmation
        console.log("Sign up successful, awaiting email confirmation potentially.");
      }
    } catch (error: any) {
      console.error("Sign up error:", error);
      setActionError(error.message || 'An error occurred during sign up.');
      throw error;
    } finally {
      setActionLoading(false);
    }
  };

  // Helper function to sync Google OAuth user profile
  const syncGoogleOAuthUser = async (user: User): Promise<void> => {
    try {
      // Extract Google avatar URL from user metadata
      let googleAvatarUrl: string | null = null;

      try {
        googleAvatarUrl = extractGoogleAvatarUrl(user.user_metadata);
      } catch (extractError) {
        console.warn('Error extracting Google avatar URL:', extractError);
        // Continue without avatar URL
      }

      console.log('Syncing Google OAuth user profile:', {
        userId: user.id,
        email: user.email,
        hasGoogleAvatar: !!googleAvatarUrl,
        userMetadata: user.user_metadata ? Object.keys(user.user_metadata) : []
      });

      // Validate extracted Google avatar URL
      if (googleAvatarUrl) {
        try {
          new URL(googleAvatarUrl); // Basic URL validation
          if (!googleAvatarUrl.includes('google')) {
            console.warn('Avatar URL does not appear to be from Google:', googleAvatarUrl);
            googleAvatarUrl = null;
          }
        } catch (urlError) {
          console.warn('Invalid Google avatar URL format:', googleAvatarUrl);
          googleAvatarUrl = null;
        }
      }

      // Sync user profile with Google avatar data
      await syncUserProfile({
        supabase_uid: user.id,
        email: user.email!,
        displayName: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || '',
        status: 'online' as const,
        googleAvatarUrl: googleAvatarUrl || undefined,
      });
    } catch (syncError) {
      console.error("Error syncing Google OAuth user profile:", syncError);
      // Don't throw error to avoid breaking the auth flow
    }
  };

  // Google sign in
  const signInWithGoogle = async (): Promise<void> => {
    setActionLoading(true);
    setActionError(null);
    try {
      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
          // Specify where to redirect after successful OAuth flow
          redirectTo: `${window.location.origin}/api/auth/callback`,
          // Request additional scopes to get profile picture
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });
      if (error) throw error;
      // User will be redirected by Supabase to the provider and then back to your callback URL
    } catch (error: any) {
      console.error("Google sign in error:", error);
      setActionError(error.message || 'An error occurred during Google sign in.');
      throw error;
    } finally {
      // Set loading false only if error occurred, otherwise redirection happens
      // Correction: actionLoading should always be set to false in finally
      setActionLoading(false);
    }
  };

  // Sign out
  const signOut = async () => {
    setActionLoading(true);
    setActionError(null);
    // Get the current user *before* signing out to update status
    const currentUser = user;
    try {
      if (currentUser) {
        // Attempt to set status to offline before sign out
        await updateStatus(currentUser, 'offline');
      }
      const { error } = await supabaseClient.auth.signOut();
      if (error) throw error;
      // No need to setState, useSession hook will update
    } catch (error: any) {
      console.error("Sign out error:", error);
      setActionError(error.message || 'An error occurred during sign out.');
      // Re-throw error
      throw error;
    } finally {
      setActionLoading(false);
    }
  };

  // --- Context Value ---
  // Provide session state from useSession and the action methods
  const value: AuthContextType = {
    // State from useSession
    session,
    user,
    loading: sessionLoading, // Use loading state from useSession
    error: sessionError,     // Use error state from useSession

    // Auth actions
    signIn,
    signOut,
    signUp,
    signInWithGoogle,

    // Action-specific loading/error states
    actionLoading,
    actionError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Custom hook to consume the AuthContext
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Note: Components needing just the user/session might prefer using useSession() directly.
// useAuth() is useful for components that need to trigger auth actions (signIn, signOut, etc.)
// or need the action-specific loading/error states.
