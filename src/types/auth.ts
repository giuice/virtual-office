// src/types/auth.ts
import { User as SupabaseUser, Session } from '@supabase/supabase-js'; // Import Session

export interface AuthState {
  session: Session | null; // Add session
  user: SupabaseUser | null;
  loading: boolean;
  error: string | null;
}

export interface AuthContextType extends AuthState {
  // Auth Actions
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;

  // Multi-account support methods
  clearAuthState: () => void;
  refreshSession: () => Promise<void>;
  switchAccount: () => Promise<void>;

  // Action-specific loading/error states
  actionLoading: boolean;
  actionError: string | null;
}
