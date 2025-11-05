// src/contexts/AuthContext.tsx
'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { AuthContextType } from '@/types/auth';
import { getUserById, syncUserProfile } from '@/lib/api';
import { User } from '@supabase/supabase-js';
import { useSession } from '@/hooks/useSession';
import { extractGoogleAvatarUrl } from '@/lib/avatar-utils';
import { mapSupabaseAuthError } from '@/lib/auth/error-messages';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { user, session, loading: sessionLoading, error: sessionError, initialized } = useSession();

  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  const supabaseClient = useMemo(() => supabase, []);

  const syncGoogleOAuthUser = useCallback(async (googleUser: User): Promise<void> => {
    try {
      let googleAvatarUrl: string | null = null;

      try {
        googleAvatarUrl = extractGoogleAvatarUrl(googleUser.user_metadata);
      } catch (extractError) {
        console.warn('Error extracting Google avatar URL:', extractError);
      }

      console.log('Syncing Google OAuth user profile:', {
        userId: googleUser.id,
        email: googleUser.email,
        hasGoogleAvatar: !!googleAvatarUrl,
        userMetadata: googleUser.user_metadata ? Object.keys(googleUser.user_metadata) : [],
      });

      if (googleAvatarUrl) {
        try {
          new URL(googleAvatarUrl);
          if (!googleAvatarUrl.includes('google')) {
            console.warn('Avatar URL does not appear to be from Google:', googleAvatarUrl);
            googleAvatarUrl = null;
          }
        } catch (urlError) {
          console.warn('Invalid Google avatar URL format:', googleAvatarUrl);
          googleAvatarUrl = null;
        }
      }

      await syncUserProfile({
        supabase_uid: googleUser.id,
        email: googleUser.email!,
        displayName:
          googleUser.user_metadata?.full_name ||
          googleUser.user_metadata?.name ||
          googleUser.email?.split('@')[0] ||
          '',
        status: 'online' as const,
        googleAvatarUrl: googleAvatarUrl || undefined,
      });
    } catch (syncError) {
      console.error('Error syncing Google OAuth user profile:', syncError);
    }
  }, []);

  useEffect(() => {
    if (user && user.app_metadata?.provider === 'google' && user.user_metadata) {
      syncGoogleOAuthUser(user);
    }
  }, [syncGoogleOAuthUser, user]);

  useEffect(() => {
    setIsAuthReady(initialized && !sessionLoading);
  }, [initialized, sessionLoading]);

  const signIn = useCallback(async (email: string, password: string) => {
    setActionLoading(true);
    setActionError(null);
    setIsAuthReady(false);
    try {
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (error: unknown) {
      console.error('Sign in error:', error);
      const friendlyMessage = mapSupabaseAuthError(error);
      setActionError(friendlyMessage);
      throw new Error(friendlyMessage);
    } finally {
      setActionLoading(false);
      if (!sessionLoading && initialized) {
        setIsAuthReady(true);
      }
    }
  }, [initialized, sessionLoading, supabaseClient]);

  const signUp = useCallback(async (email: string, password: string, displayName?: string): Promise<void> => {
    setActionLoading(true);
    setActionError(null);
    setIsAuthReady(false);
    try {
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          data: { displayName: displayName || email.split('@')[0] },
        },
      });
      if (error) throw error;

      if (data.user) {
        try {
          await syncUserProfile({
            supabase_uid: data.user.id,
            email: data.user.email!,
            displayName: data.user.user_metadata?.displayName || displayName || email.split('@')[0],
            status: 'online' as const,
          });
        } catch (syncError) {
          console.error('Error syncing profile after sign up:', syncError);
        }
      } else {
        console.log('Sign up successful, awaiting email confirmation potentially.');
      }
    } catch (error: unknown) {
      console.error('Sign up error:', error);
      const friendlyMessage = mapSupabaseAuthError(error);
      setActionError(friendlyMessage);
      throw new Error(friendlyMessage);
    } finally {
      setActionLoading(false);
      if (!sessionLoading && initialized) {
        setIsAuthReady(true);
      }
    }
  }, [initialized, sessionLoading, supabaseClient]);

  const signInWithGoogle = useCallback(async (): Promise<void> => {
    setActionLoading(true);
    setActionError(null);
    setIsAuthReady(false);
    try {
      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/api/auth/callback`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });
      if (error) throw error;
    } catch (error: unknown) {
      console.error('Google sign in error:', error);
      const friendlyMessage = mapSupabaseAuthError(error);
      setActionError(friendlyMessage);
      throw new Error(friendlyMessage);
    } finally {
      setActionLoading(false);
      if (!sessionLoading && initialized) {
        setIsAuthReady(true);
      }
    }
  }, [initialized, sessionLoading, supabaseClient]);

  const signOut = useCallback(async () => {
    setActionLoading(true);
    setActionError(null);
    setIsAuthReady(false);
    const currentUser = user;
    try {
      if (currentUser) {
        const userProfile = await getUserById(currentUser.id);
        if (userProfile) {
          await fetch(`/api/users/update?id=${userProfile.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              status: 'offline',
              currentSpaceId: null,
              lastActive: new Date().toISOString(),
            }),
          });
        }
      }
      const { error } = await supabaseClient.auth.signOut();
      if (error) throw error;
    } catch (error: unknown) {
      console.error('Sign out error:', error);
      const friendlyMessage = mapSupabaseAuthError(error);
      setActionError(friendlyMessage);
      throw new Error(friendlyMessage);
    } finally {
      setActionLoading(false);
      if (!sessionLoading && initialized) {
        setIsAuthReady(true);
      }
    }
  }, [getUserById, initialized, sessionLoading, supabaseClient, user]);

  const value: AuthContextType = useMemo(
    () => ({
      session,
      user,
      loading: sessionLoading,
      error: sessionError,
      isAuthReady,
      signIn,
      signOut,
      signUp,
      signInWithGoogle,
      actionLoading,
      actionError,
    }),
    [
      actionError,
      actionLoading,
      isAuthReady,
      session,
      sessionError,
      sessionLoading,
      signIn,
      signInWithGoogle,
      signOut,
      signUp,
      user,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

