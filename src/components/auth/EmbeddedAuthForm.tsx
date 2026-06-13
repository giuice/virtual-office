// src/components/auth/EmbeddedAuthForm.tsx
'use client';

import { useReducerState } from '@/hooks/useReducerState';
import { useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNotification } from '@/hooks/useNotification';
import { mapSupabaseAuthError } from '@/lib/auth/error-messages';
import { Session } from '@supabase/supabase-js';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser-client';
import { EmbeddedAuthFormView } from './EmbeddedAuthFormView';

interface EmbeddedAuthFormProps {
  /**
   * Called when authentication succeeds.
   * Session may be null if email confirmation is required.
   */
  onSuccess: (session: Session | null) => void;
  /** Pre-fill email from invitation */
  inviteEmail?: string;
  /** Called when user completes signup and needs email confirmation */
  onEmailConfirmation?: (email: string) => void;
  /** Disable the form (e.g., during accept flow) */
  disabled?: boolean;

  /**
   * Optional in-app path to return to after Google OAuth completes.
   * Must start with '/'. Example: `/join?token=...`
   */
  oauthNextPath?: string;
}

export type FormStatus = 'idle' | 'credential' | 'google' | 'resending';
export type AuthMode = 'login' | 'signup' | 'set-password';

export function EmbeddedAuthForm({
  onSuccess,
  inviteEmail,
  onEmailConfirmation,
  disabled = false,
  oauthNextPath,
}: EmbeddedAuthFormProps) {
  const [email, setEmail] = useReducerState(inviteEmail || '');
  const [displayName, setDisplayName] = useReducerState('');
  const [password, setPassword] = useReducerState('');
  const [confirmPassword, setConfirmPassword] = useReducerState('');
  const [formStatus, setFormStatus] = useReducerState<FormStatus>('idle');
  const [formError, setFormError] = useReducerState<string | null>(null);
  const [emailSent, setEmailSent] = useReducerState(false);
  // If user was invited via email, show set-password flow (they need to define password via reset)
  const [authMode, setAuthMode] = useReducerState<AuthMode>(inviteEmail ? 'set-password' : 'signup');

  const errorRef = useRef<HTMLDivElement>(null);
  
  const { signIn, signUp, signInWithGoogle, session, isAuthReady, actionLoading } = useAuth();
  const { showSuccess, showError } = useNotification();

  const isBusy = actionLoading || formStatus !== 'idle';
  const isDisabled = disabled || isBusy || !isAuthReady;

  // Resend invite/magic link for invited users
  const handleResendInviteEmail = async () => {
    if (!inviteEmail) return;
    
    setFormStatus('resending');
    setFormError(null);
    
    try {
      const supabase = createSupabaseBrowserClient();
      
      // Use password reset to send a new magic link
      // This works because the user was created via invite
      const { error } = await supabase.auth.resetPasswordForEmail(inviteEmail, {
        redirectTo: `${window.location.origin}${window.location.pathname}${window.location.search}`,
      });
      
      if (error) throw error;
      
      setEmailSent(true);
      showSuccess({ description: 'Email reenviado! Verifique sua caixa de entrada.' });
    } catch (error) {
      const friendlyMessage = mapSupabaseAuthError(error);
      setFormError(friendlyMessage);
      showError({ description: friendlyMessage });
    } finally {
      setFormStatus('idle');
    }
  };

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    setFormStatus('credential');

    try {
      await signIn(email, password);
      showSuccess({ description: 'Login realizado com sucesso!' });
      // Session will be available via auth context after successful login
      // Wait a tick for session to propagate
      setTimeout(() => {
        onSuccess(session);
      }, 100);
    } catch (error) {
      const friendlyMessage = mapSupabaseAuthError(error);
      setFormError(friendlyMessage);
      showError({ description: friendlyMessage });
      errorRef.current?.focus();
    } finally {
      setFormStatus('idle');
    }
  };

  const handleSignup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);

    if (password !== confirmPassword) {
      const mismatchMessage = 'As senhas não conferem';
      setFormError(mismatchMessage);
      showError({ description: mismatchMessage });
      return;
    }

    setFormStatus('credential');

    try {
      await signUp(email, password, displayName);
      showSuccess({ description: 'Conta criada! Verifique seu email.' });
      // For signup, email confirmation is typically required
      if (onEmailConfirmation) {
        onEmailConfirmation(email);
      }
    } catch (error) {
      const friendlyMessage = mapSupabaseAuthError(error);
      setFormError(friendlyMessage);
      showError({ description: friendlyMessage });
      errorRef.current?.focus();
    } finally {
      setFormStatus('idle');
    }
  };

  const handleGoogleSignIn = async () => {
    setFormError(null);
    setFormStatus('google');

    try {
      await signInWithGoogle(oauthNextPath);
      // Google OAuth will redirect, so this may not execute
      showSuccess({ description: 'Redirecionando para Google…' });
    } catch (error) {
      const friendlyMessage = mapSupabaseAuthError(error);
      setFormError(friendlyMessage);
      showError({ description: friendlyMessage });
      errorRef.current?.focus();
    } finally {
      setFormStatus('idle');
    }
  };

  return (
    <EmbeddedAuthFormView
      inviteEmail={inviteEmail}
      authMode={authMode}
      email={email}
      displayName={displayName}
      password={password}
      confirmPassword={confirmPassword}
      formStatus={formStatus}
      formError={formError}
      emailSent={emailSent}
      disabled={isDisabled}
      errorRef={errorRef}
      onAuthModeChange={setAuthMode}
      onEmailChange={setEmail}
      onDisplayNameChange={setDisplayName}
      onPasswordChange={setPassword}
      onConfirmPasswordChange={setConfirmPassword}
      onResendInviteEmail={handleResendInviteEmail}
      onGoogleSignIn={handleGoogleSignIn}
      onLogin={handleLogin}
      onSignup={handleSignup}
    />
  );
}
