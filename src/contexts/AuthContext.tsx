// src/contexts/AuthContext.tsx
'use client';

import { createContext, useCallback, use, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { AuthContextType } from '@/types/auth';
import { getUserById } from '@/lib/api';
import { useSession } from '@/hooks/useSession';
import { mapSupabaseAuthError } from '@/lib/auth/error-messages';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) { const { user, session, loading: sessionLoading, error: sessionError, initialized } = useSession();

  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const isAuthReady = initialized && !sessionLoading && !actionLoading;

  const supabaseClient = useMemo(() => supabase, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setActionLoading(true);
    setActionError(null);
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
    }
  }, [supabaseClient]);

  const signUp = useCallback(async (email: string, password: string, displayName?: string): Promise<void> => {
    setActionLoading(true);
    setActionError(null);
    try {
      const { error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          data: { displayName: displayName || email.split('@')[0] },
        },
      });
      if (error) throw error;

    } catch (error: unknown) {
      console.error('Sign up error:', error);
      const friendlyMessage = mapSupabaseAuthError(error);
      setActionError(friendlyMessage);
      throw new Error(friendlyMessage);
    } finally {
      setActionLoading(false);
    }
  }, [supabaseClient]);

  const signInWithGoogle = useCallback(async (nextPath?: string): Promise<void> => {
    setActionLoading(true);
    setActionError(null);
    try {
      const safeNextPath = nextPath && nextPath.startsWith('/') && !nextPath.startsWith('//') ? nextPath : undefined;
      const callbackUrl = safeNextPath
        ? `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(safeNextPath)}`
        : `${window.location.origin}/api/auth/callback`;

      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: callbackUrl,
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
    }
  }, [supabaseClient]);

  const signOut = useCallback(async () => { setActionLoading(true);
    setActionError(null);
    const currentUser = user;
    try {
      if (currentUser) {
        const userProfile = await getUserById(currentUser.id);
        if (userProfile) {
          await fetch(`/api/users/update?id=${userProfile.id }`, {
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
    }
  }, [supabaseClient, user]);

  const value: AuthContextType = useMemo(
    () => ({ session, user, loading: sessionLoading, error: sessionError, isAuthReady, signIn, signOut, signUp, signInWithGoogle, actionLoading, actionError }),
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

export function useAuth() { const context = use(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider'); }
  return context;
}
