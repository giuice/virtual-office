// src/app/(auth)/set-password/page.tsx
'use client';

import { useReducerState } from '@/hooks/useReducerState';
import { useEffect, useCallback, useRef } from 'react';
import { redirect } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useNotification } from '@/hooks/useNotification';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser-client';
import type { PendingInvitationResponse } from '@/app/api/invitations/pending/route';
import { SetPasswordForm } from './SetPasswordView';
import { SetPasswordLoading } from './SetPasswordLoading';
import { SetPasswordSuccess } from './SetPasswordSuccess';

const getPasswordSetReturnUrl = () => sessionStorage.getItem('passwordSetReturnUrl');

function getSetPasswordValidationError(
  displayName: string,
  password: string,
  confirmPassword: string
) {
  if (!displayName.trim()) return 'Por favor, informe seu nome.';
  if (password.length < 6) return 'A senha deve ter pelo menos 6 caracteres.';
  if (password !== confirmPassword) return 'As senhas não coincidem.';
  return null;
}

export default function SetPasswordPage() {
  const [password, setPassword] = useReducerState('');
  const [confirmPassword, setConfirmPassword] = useReducerState('');
  const [displayName, setDisplayName] = useReducerState('');
  const [isLoading, setIsLoading] = useReducerState(false);
  const [isSuccess, setIsSuccess] = useReducerState(false);
  const [isAcceptingInvite, setIsAcceptingInvite] = useReducerState(false);
  const [formError, setFormError] = useReducerState<string | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useReducerState(true);
  const [successMessage, setSuccessMessage] = useReducerState('');
  const redirectTargetRef = useRef<string | null>(null);

  const { user, loading: authLoading, isAuthReady } = useAuth();
  const { showSuccess, showError } = useNotification();
  const queueRedirect = useCallback((target: string) => {
    redirectTargetRef.current = target;
    setIsCheckingSession(false);
  }, [setIsCheckingSession]);

  useEffect(() => {
    if (user?.user_metadata) {
      const existingName = user.user_metadata.full_name || user.user_metadata.displayName || user.user_metadata.name;
      if (existingName) {
        setDisplayName(existingName);
      }
    }
  }, [user, setDisplayName]);

  // Check if user has a valid session (came from invite/recovery link)
  useEffect(() => {
    const checkSession = async () => {
      const supabase = createSupabaseBrowserClient();

      // Support PKCE/code flows (some links arrive as ?code=...)
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get('code');
        if (code) {
          console.log('[set-password] Found code in URL, exchanging for session...');
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            console.error('[set-password] Error exchanging code for session:', error);
            showError({ description: 'Link expirado ou inválido. Solicite um novo convite.' });
            queueRedirect('/login');
            return;
          }
          url.searchParams.delete('code');
          window.history.replaceState(null, '', url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : ''));
        }
      } catch (err) {
        console.warn('[set-password] Failed to process code param:', err);
      }
      
      // Process hash fragment if present (from invite/recovery email)
      const hash = window.location.hash;
      if (hash) {
        const params = new URLSearchParams(hash.substring(1));
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        const type = params.get('type');
        
        console.log('Hash params:', { hasAccessToken: !!accessToken, type });
        
        if (accessToken && refreshToken) {
          try {
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            
            if (error) {
              console.error('Error setting session:', error);
              showError({ description: 'Link expirado ou inválido. Solicite um novo convite.' });
              queueRedirect('/login');
              return;
            }
            
            // Clean up URL
            window.history.replaceState(null, '', window.location.pathname);
          } catch (err) {
            console.error('Exception setting session:', err);
            showError({ description: 'Erro ao processar link. Tente novamente.' });
            queueRedirect('/login');
            return;
          }
        }
      }
      
      setIsCheckingSession(false);
    };
    
    checkSession();
  }, [queueRedirect, showError, setIsCheckingSession]);

  // Redirect if no session
  useEffect(() => {
    if (!isCheckingSession && isAuthReady && !user) {
      showError({ description: 'Você precisa estar autenticado para definir uma senha.' });
      queueRedirect('/login');
    }
  }, [isCheckingSession, isAuthReady, user, showError, queueRedirect]);

  /**
   * Check for pending invitation after session is established
   * This runs after password is set to auto-accept any pending invites
   */
  const checkAndAcceptPendingInvite = useCallback(async (): Promise<boolean> => {
    try {
      const returnUrl = getPasswordSetReturnUrl();
      let tokenFromReturnUrl: string | null = null;

      if (returnUrl) {
        try {
          const parsedReturnUrl = new URL(returnUrl, window.location.origin);
          tokenFromReturnUrl = parsedReturnUrl.searchParams.get('token');
        } catch (error) {
          console.warn('[set-password] Could not parse passwordSetReturnUrl:', error);
        }
      }

      // Priority 1: accept the exact token from the invitation flow.
      if (tokenFromReturnUrl) {
        console.log('[set-password] Found invitation token in return URL, accepting exact invitation...');
        setIsAcceptingInvite(true);

        const directAcceptResponse = await fetch('/api/invitations/accept', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: tokenFromReturnUrl,
            displayName,
          }),
        });

        const directAcceptData = await directAcceptResponse.json();
        if (directAcceptResponse.ok) {
          console.log('[set-password] Invitation accepted successfully from return URL token');
          setSuccessMessage('Você entrou na empresa!');
          return true;
        }

        console.warn('[set-password] Failed to accept invitation from return URL token, falling back to email lookup:', directAcceptData?.error);
        setIsAcceptingInvite(false);
      }

      // Fallback: email-based pending lookup
      console.log('[set-password] Checking for pending invitation...');
      
      const response = await fetch('/api/invitations/pending');
      const data: PendingInvitationResponse = await response.json();
      
      if (!data.hasPending || !data.invitation) {
        console.log('[set-password] No pending invitation found');
        return false;
      }

      console.log('[set-password] Found pending invitation for company:', data.invitation.companyName);
      setIsAcceptingInvite(true);

      // Auto-accept the invitation
      const acceptResponse = await fetch('/api/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          token: data.invitation.token,
          displayName: displayName 
        }),
      });

      const acceptData = await acceptResponse.json();

      if (!acceptResponse.ok) {
        console.error('[set-password] Failed to accept invitation:', acceptData.error);
        // Don't throw - let the user proceed to onboarding
        setIsAcceptingInvite(false);
        return false;
      }

      console.log('[set-password] Invitation accepted successfully!');
      setSuccessMessage(`Você entrou na empresa ${data.invitation.companyName}!`);
      return true;

    } catch (error) {
      console.error('[set-password] Error checking/accepting invite:', error);
      setIsAcceptingInvite(false);
      return false;
    }
  }, [displayName, setIsAcceptingInvite, setSuccessMessage]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);

    const validationError = getSetPasswordValidationError(displayName, password, confirmPassword);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createSupabaseBrowserClient();
      
      const { error } = await supabase.auth.updateUser({
        password: password,
        data: { full_name: displayName }
      });

      if (error) {
        console.error('Error updating password:', error);
        setFormError(error.message);
        showError({ description: 'Erro ao definir senha.' });
        setIsLoading(false);
        return;
      }

      // Password set successfully - now check for pending invite
      setIsSuccess(true);
      showSuccess({ description: 'Senha definida com sucesso!' });
      
      // Small delay to ensure session cookies are propagated to server
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check and auto-accept pending invitation
      const inviteAccepted = await checkAndAcceptPendingInvite();
      
      // Determine redirect destination
      let redirectUrl = '/onboarding';
      const returnUrl = getPasswordSetReturnUrl();
      sessionStorage.removeItem('passwordSetReturnUrl');
      
      if (inviteAccepted) {
        // Invite was accepted - go straight to dashboard
        redirectUrl = '/dashboard';
        showSuccess({ description: `Bem-vindo! Você entrou na empresa.` });
      } else {
        // Check if there's a manual return URL from the join flow
        if (returnUrl) {
          redirectUrl = returnUrl;
        }
      }
      
      // Redirect after a short delay
      // Use window.location.href for hard navigation to ensure fresh context
      setTimeout(() => {
        window.location.href = redirectUrl;
      }, 1500);

    } catch (error) {
      console.error('Exception updating password:', error);
      setFormError('Ocorreu um erro inesperado. Tente novamente.');
      showError({ description: 'Erro inesperado.' });
      setIsLoading(false);
    }
  };

  if (redirectTargetRef.current) {
    redirect(redirectTargetRef.current);
  }

  // Show loading while checking session or auth
  if (isCheckingSession || authLoading || !isAuthReady) {
    return <SetPasswordLoading />;
  }

  // Show success state with invite info
  if (isSuccess) {
    return (
      <SetPasswordSuccess
        acceptingInvite={isAcceptingInvite}
        message={successMessage}
      />
    );
  }

  return (
    <SetPasswordForm
      email={user?.email}
      displayName={displayName}
      password={password}
      confirmPassword={confirmPassword}
      formError={formError}
      loading={isLoading}
      displayNameRequired={!user?.user_metadata?.full_name}
      onDisplayNameChange={setDisplayName}
      onPasswordChange={setPassword}
      onConfirmPasswordChange={setConfirmPassword}
      onSubmit={handleSubmit}
    />
  );
}
