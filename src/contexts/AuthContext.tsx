// src/contexts/AuthContext.tsx
'use client';

import { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase/client'; // Keep for direct auth actions
import { AuthContextType } from '@/types/auth'; // Updated type
import { getUserById, updateUserStatus } from '@/lib/api';
import { User } from '@supabase/supabase-js';
import { useSession } from '@/hooks/useSession'; // Import the new hook

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
          // Update status using the Supabase Auth UID, which the API endpoint expects via the 'id' query param
          await updateUserStatus(currentUser.id, status);
        } else {
          // It's possible the profile doesn't exist yet if signup/sync is slow, log warning but don't error
          console.warn(`User profile not found for supabase_uid: ${currentUser.id}. Cannot update status yet.`);
        }
      } catch (error) {
        console.error('Error updating user status:', error);
        // Optionally set an error state specific to status updates if needed
      }
    }
  };

  // Effect to update status when user logs in/out (based on useSession)
  useEffect(()  =>  {
    if (user) {
       void updateStatus(user, 'online'); // Explicitly ignore promise
    }


    // Update user status to offline when they close the tab or navigate away
    const handleBeforeUnload = () => {
      // Use the user state variable directly
      if (user) {

        void updateStatus(user, 'offline');
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
    
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
      // Profile synchronization is now handled by the database trigger 'on_auth_user_created'.
      if (data.user) {
        console.log(`Sign up successful for ${data.user.email}. Profile sync handled by trigger.`);
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
