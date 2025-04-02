// src/contexts/AuthContext.tsx
'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { AuthContextType, AuthState } from '@/types/auth';
import { getUserByFirebaseId, updateUserStatus, createUser } from '@/lib/api'; // Import the client-side API functions

const initialState: AuthState = {
  user: null,
  loading: true,
  error: null,
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(initialState);

  // Update user status when authentication state changes
  const updateStatus = async (user: AuthState['user'], status: 'online' | 'offline') => {
    if (user) {
      try {
        // Check if user has a profile in the database
        const userProfile = await getUserByFirebaseId(user.uid);
        if (userProfile) {
          // Update status using the Supabase User UUID, not the Firebase UID
          await updateUserStatus(userProfile.id, status);
        }
      } catch (error) {
        console.error('Error updating user status:', error);
      }
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, 
      (user) => {
        setState((prev) => ({ ...prev, user, loading: false }));
        
        // Update user status to online when they log in
        if (user) {
          updateStatus(user, 'online');
        }
      },
      (error) => {
        setState((prev) => ({ 
          ...prev, 
          error: error.message, 
          loading: false 
        }));
      }
    );

    // Update user status to offline when they close the tab or navigate away
    const handleBeforeUnload = () => {
      if (state.user) {
        updateStatus(state.user, 'offline');
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      unsubscribe();
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [state.user]);

  const signIn = async (email: string, password: string) => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      setState((prev) => ({ 
        ...prev, 
        error: error instanceof Error ? error.message : 'An error occurred', 
        loading: false 
      }));
      throw error;
    }
  };

  const signUp = async (email: string, password: string, displayName?: string): Promise<void> => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      if (user) {
        // Use the server-side API to create a new user
        await createUser({
          firebase_uid: user.uid,
          email,
          displayName: displayName || '',
          status: 'online' as const
        });

        if (displayName) {
          await updateProfile(user, { displayName });
        }
      }
    } catch (error: any) {
      setState((prev) => ({ 
        ...prev, 
        error: error.message, 
        loading: false 
      }));
      throw error;
    } finally {
      setState((prev) => ({ ...prev, loading: false }));
    }
  };

  const signInWithGoogle = async (): Promise<void> => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      
      // Check if user exists in our database, if not create them
      if (result.user) {
        const userProfile = await getUserByFirebaseId(result.user.uid);
        if (!userProfile) {
          // Use the server-side API to create a new user
          await createUser({
            firebase_uid: result.user.uid,
            email: result.user.email || '',
            displayName: result.user.displayName || '',
            status: 'online' as const
          });
        }
      }
    } catch (error) {
      setState((prev) => ({ 
        ...prev, 
        error: error instanceof Error ? error.message : 'An error occurred',
        loading: false 
      }));
      throw error;
    }
  };

  const signOut = async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      
      // Update status to offline before signing out
      if (state.user) {
        await updateStatus(state.user, 'offline');
      }
      
      await firebaseSignOut(auth);
    } catch (error) {
      setState((prev) => ({ 
        ...prev, 
        error: error instanceof Error ? error.message : 'An error occurred',
        loading: false 
      }));
      throw error;
    }
  };

  const value = {
    ...state,
    signIn,
    signOut,
    signUp,
    signInWithGoogle,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};