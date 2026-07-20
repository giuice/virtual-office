// src/contexts/AuthContext.tsx
'use client';

import { createContext, useCallback, use, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { AuthContextType } from '@/types/auth';
import { useSession } from '@/hooks/useSession';
import { mapSupabaseAuthError } from '@/lib/auth/error-messages';
import { fencePresenceLogout } from '@/lib/presence/logout-client';
import { useQueryClient } from '@tanstack/react-query';
import { presenceQueryKeys } from '@/lib/presence/query-keys';
import {
  invalidatePresenceClientLifecycle,
  subscribeToPresenceClientInvalidation,
} from '@/lib/presence/client-lifecycle';
import { clearAllPresenceStorage } from '@/lib/presence/storage-keys';

function clearPresenceStorage(): void {
  try {
    if (typeof window === 'undefined') return;
    const storage = window.localStorage;
    if (!storage) return;
    clearAllPresenceStorage(storage);
  } catch {
    // Storage is advisory. Browser privacy modes must never block local auth sign-out.
  }
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function combineSignOutErrors(
  presenceError: unknown,
  localSignOutError: unknown,
  cleanupErrors: readonly unknown[],
): Error | null {
  const localError = localSignOutError ? toError(localSignOutError) : null;
  const serverError = presenceError ? toError(presenceError) : null;
  const normalizedCleanupErrors = cleanupErrors.map(toError);

  if (localError && serverError) {
    return new AggregateError(
      [localError, serverError, ...normalizedCleanupErrors],
      `Local authentication sign-out failed: ${localError.message}. Presence logout also failed: ${serverError.message}`,
    );
  }

  if (localError) {
    return normalizedCleanupErrors.length > 0
      ? new AggregateError(
          [localError, ...normalizedCleanupErrors],
          `Local authentication sign-out failed: ${localError.message}`,
        )
      : localError;
  }

  if (serverError) {
    return normalizedCleanupErrors.length > 0
      ? new AggregateError(
          [serverError, ...normalizedCleanupErrors],
          `Presence logout failed: ${serverError.message}`,
        )
      : serverError;
  }

  if (normalizedCleanupErrors.length === 1) return normalizedCleanupErrors[0];
  if (normalizedCleanupErrors.length > 1) {
    return new AggregateError(normalizedCleanupErrors, 'Presence client cleanup failed');
  }

  return null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) { const { user, session, loading: sessionLoading, error: sessionError, initialized } = useSession();
  const queryClient = useQueryClient();

  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const isAuthReady = initialized && !sessionLoading && !actionLoading;

  const supabaseClient = useMemo(() => supabase, []);

  useEffect(
    () =>
      subscribeToPresenceClientInvalidation((invalidation) => {
        if (invalidation.reason !== 'auth-session-revoked') return;

        void (async () => {
          try {
            queryClient.removeQueries({ queryKey: presenceQueryKeys.all });
          } catch {
            console.warn('Presence query cleanup failed after Auth-session revocation');
          }
          clearPresenceStorage();

          try {
            const { error } = await supabaseClient.auth.signOut({ scope: 'local' });
            if (error) {
              console.warn('Local Auth sign-out failed after Presence session revocation');
            }
          } catch {
            console.warn('Local Auth sign-out failed after Presence session revocation');
          }
        })();
      }),
    [queryClient, supabaseClient],
  );

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
    let presenceError: unknown = null;
    let localSignOutError: unknown = null;
    const cleanupErrors: unknown[] = [];
    let cleanupAttempted = false;
    const cleanPresenceClient = (): void => {
      if (cleanupAttempted) return;
      cleanupAttempted = true;
      try {
        invalidatePresenceClientLifecycle({ reason: 'logout' });
      } catch (error) {
        cleanupErrors.push(error);
      }
      try {
        queryClient.removeQueries({ queryKey: presenceQueryKeys.all });
      } catch (error) {
        cleanupErrors.push(error);
      }
      clearPresenceStorage();
    };
    try {
      if (user) {
        try {
          await fencePresenceLogout();
        } catch (error) {
          presenceError = error;
        }
      }

      // Clear the old tenant generation before Supabase emits SIGNED_OUT and
      // consumers can begin rendering the next identity.
      cleanPresenceClient();

      try {
        const { error } = await supabaseClient.auth.signOut({ scope: 'local' });
        localSignOutError = error;
      } catch (error) {
        localSignOutError = error;
      }
    } finally {
      cleanPresenceClient();
      setActionLoading(false);
    }

    const signOutError = combineSignOutErrors(
      presenceError,
      localSignOutError,
      cleanupErrors,
    );
    if (signOutError) {
      console.error('Sign out error:', signOutError);
      const friendlyMessage = mapSupabaseAuthError(signOutError);
      setActionError(friendlyMessage);
      throw new Error(friendlyMessage, { cause: signOutError });
    }
  }, [queryClient, supabaseClient, user]);

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
