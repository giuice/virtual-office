// src/types/auth.ts
import { User as FirebaseUser } from 'firebase/auth';

export interface AuthState {
  user: FirebaseUser | null;
  loading: boolean;
  error: string | null;
}

export interface AuthContextType extends AuthState {
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
}