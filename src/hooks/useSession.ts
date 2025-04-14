// src/hooks/useSession.ts
"use client";

import { useEffect, useState, useMemo } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser-client"; // Adjust path if needed
import { Session, User } from "@supabase/supabase-js";

interface SessionState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  error: string | null;
}

export function useSession() {
  // Memoize client creation to avoid recreating it on every render
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  
  const [state, setState] = useState<SessionState>({
    session: null,
    user: null,
    loading: true, // Start in loading state
    error: null,
  });

  useEffect(() => {
    let isMounted = true; // Flag to prevent state updates on unmounted component

    // Set loading true when the effect runs
    setState((prev) => ({ ...prev, loading: true, error: null }));

    // Get initial session state
    supabase.auth.getSession().then(({ data, error }) => {
      if (!isMounted) return; // Don't update if unmounted

      if (error) {
        console.error("Error getting initial session:", error);
        setState((prev) => ({
          ...prev,
          session: null,
          user: null,
          loading: false,
          error: error.message,
        }));
      } else {
        setState((prev) => ({
          ...prev,
          session: data.session,
          user: data.session?.user ?? null,
          loading: false, // Initial load complete
          error: null,
        }));
      }
    }).catch(err => {
        if (!isMounted) return;
        console.error("Exception getting initial session:", err);
        setState((prev) => ({
            ...prev,
            session: null,
            user: null,
            loading: false,
            error: err instanceof Error ? err.message : String(err),
        }));
    });

    // Set up the listener for auth state changes
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!isMounted) return; // Don't update if unmounted

        // Update state only if the session has actually changed
        setState((prevState) => {
          // Compare access tokens as a reliable way to check for session change
          if (prevState.session?.access_token !== session?.access_token) {
            console.log(`Auth state changed: ${event}`, session);
            return {
              session: session,
              user: session?.user ?? null,
              loading: false, // Auth state change means loading is complete
              error: null,
            };
          }
          // If tokens are the same, no actual session change occurred
          return { ...prevState, loading: false, error: null }; // Ensure loading is false even if no change
        });
      }
    );

    // Cleanup function
    return () => {
      isMounted = false; // Set flag on unmount
      authListener?.subscription.unsubscribe();
    };
  }, [supabase]); // Dependency array includes supabase client

  // Return the full state object including session, user, loading, and error
  return state;
}
