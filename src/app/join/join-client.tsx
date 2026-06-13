// src/app/join/page.tsx
'use client';

import { useReducerState } from '@/hooks/useReducerState';
import { useCallback, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useNotification } from '@/hooks/useNotification';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser-client';
import type { ValidateInvitationResponse } from '@/app/api/invitations/validate/route';
import { JoinLoadingFallback, JoinPageStateView } from './JoinPageView';
import { joinMessages as messages } from './joinMessages';

/**
 * Page state machine for invitation accept flow
 * AC8 - Loading States requirement
 */
export type PageState =
  | 'loading'           // Initial load, validating token
  | 'processing-hash'   // Processing Supabase hash fragment (magic link)
  | 'invalid-token'     // Token expired/used/not found (AC5)
  | 'show-auth'         // Valid token, show auth UI (AC3)
  | 'already-company'   // User already has company_id (AC6)
  | 'email-confirmation' // User signed up, waiting email confirmation
  | 'accepting'         // Calling accept API (AC4)
  | 'success'           // Accepted, redirecting
  | 'error';            // Accept failed

async function processJoinHashFragment(): Promise<{
  pageState?: PageState;
  errorMessage?: string;
  hashProcessed: boolean;
}> {
  if (typeof window === 'undefined') return { hashProcessed: true };

  const supabase = createSupabaseBrowserClient();
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const typeFromQuery = url.searchParams.get('type');

  if (code) {
    console.log('Processing Supabase auth code from URL...');

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error('Error exchanging code for session:', error);
      return {
        pageState: 'error',
        errorMessage: 'Erro ao processar link de convite. Tente novamente.',
        hashProcessed: true,
      };
    }

    url.searchParams.delete('code');
    window.history.replaceState(null, '', url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : ''));

    if (typeFromQuery === 'invite' || typeFromQuery === 'recovery') {
      console.log('Invite/recovery flow detected (query), redirecting to set-password...');
      const currentToken = new URLSearchParams(window.location.search).get('token');
      const returnUrl = currentToken ? `/join?token=${currentToken}` : '/onboarding';
      sessionStorage.setItem('passwordSetReturnUrl', returnUrl);
      window.location.href = '/set-password';
      return { pageState: 'processing-hash', hashProcessed: false };
    }
  }

  const hash = window.location.hash;
  if (!hash || !hash.includes('access_token')) {
    return { hashProcessed: true };
  }

  console.log('Processing Supabase hash fragment from invite email...');

  try {
    const hashParams = new URLSearchParams(hash.substring(1));
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');
    const type = hashParams.get('type');

    console.log('Hash fragment type:', type);

    if (accessToken && refreshToken) {
      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (error) {
        console.error('Error setting session from hash:', error);
        return {
          pageState: 'error',
          errorMessage: 'Erro ao processar link de convite. Tente novamente.',
          hashProcessed: true,
        };
      }

      console.log('Session set successfully from hash:', data.user?.email);

      if (type === 'invite' || type === 'recovery') {
        console.log('Invite/recovery flow detected, redirecting to set-password...');
        const currentToken = new URLSearchParams(window.location.search).get('token');
        const returnUrl = currentToken ? `/join?token=${currentToken}` : '/onboarding';
        sessionStorage.setItem('passwordSetReturnUrl', returnUrl);
        window.location.href = '/set-password';
        return { pageState: 'processing-hash', hashProcessed: false };
      }

      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  } catch (error) {
    console.error('Error processing hash fragment:', error);
  }

  return { hashProcessed: true };
}

function JoinPageContent() {
  const searchParams = useSearchParams();
  const token = searchParams?.get('token') || null;

  const { user, session, isAuthReady, loading: authLoading } = useAuth();
  const { showSuccess, showError } = useNotification();

  // Page state
  const [pageState, setPageState] = useReducerState<PageState>('loading');
  const [validationData, setValidationData] = useReducerState<{
    email?: string;
    companyName?: string;
    companyId?: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useReducerState<string>('');
  const [userCompanyName, setUserCompanyName] = useReducerState<string>('');
  const [pendingEmail, setPendingEmail] = useReducerState<string>('');
  const [hashProcessed, setHashProcessed] = useReducerState(false);

  // CRITICAL: Prevent duplicate flow execution
  const flowExecutedRef = useRef(false);

  useEffect(() => {
    processJoinHashFragment().then((result) => {
      if (result.pageState) setPageState(result.pageState);
      setHashProcessed(result.hashProcessed);
    });
  }, [setPageState, setHashProcessed]);

  /**
   * Validate token via API (AC2)
   */
  const validateToken = useCallback(async () => {
    if (!token) {
      setErrorMessage(messages.noToken);
      setPageState('invalid-token');
      return;
    }

    try {
      const response = await fetch(`/api/invitations/validate?token=${encodeURIComponent(token)}`);
      const data: ValidateInvitationResponse = await response.json();

      if (!data.valid) {
        setErrorMessage(data.error || messages.invalidToken.description);
        setPageState('invalid-token');
        return;
      }

      setValidationData({
        email: data.email,
        companyName: data.companyName,
        companyId: data.companyId,
      });

      return data;
    } catch (error) {
      console.error('Token validation error:', error);
      setErrorMessage(messages.invalidToken.description);
      setPageState('invalid-token');
      return null;
    }
  }, [token, setErrorMessage, setPageState, setValidationData]);

  /**
   * Check if authenticated user already belongs to a company (AC6)
   */
  const checkUserCompany = useCallback(async (userId: string) => {
    try {
      const response = await fetch(`/api/users/get-by-id?supabase_uid=${userId}`);
      if (response.ok) {
        const data = await response.json();
        const userData = data?.user;
        if (userData?.companyId) {
          // User already has a company
          setUserCompanyName(userData.companyName || 'uma empresa');
          setPageState('already-company');
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error('Error checking user company:', error);
      return false;
    }
  }, [setUserCompanyName, setPageState]);

  /**
   * Accept invitation API call (AC4)
   */
  const acceptInvitation = useCallback(async () => {
    if (!token || !user) {
      setErrorMessage(messages.error);
      setPageState('error');
      return;
    }

    setPageState('accepting');

    try {
      const response = await fetch('/api/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle specific error cases
        if (response.status === 409) {
          // User already belongs to another company
          setUserCompanyName(data.companyName || 'uma empresa');
          setPageState('already-company');
          return;
        }
        throw new Error(data.error || messages.error);
      }

      setPageState('success');
      showSuccess({ description: messages.success });

      // CRITICAL: Use hard navigation to force full app reload
      // This ensures CompanyContext fetches fresh data with the new company_id
      // router.push() would use cached context data and redirect to /create-company
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 1500);
    } catch (error) {
      console.error('Accept invitation error:', error);
      const errorMsg = error instanceof Error ? error.message : messages.error;
      setErrorMessage(errorMsg);
      showError({ description: errorMsg });
      setPageState('error');
    }
  }, [token, user, showSuccess, showError, setErrorMessage, setPageState, setUserCompanyName]);

  /**
   * Initial validation on mount
   * IMPORTANT: Wait for hash to be processed BEFORE starting flow
   * When user clicks Supabase invite email, the hash contains their session
   * CRITICAL: Only execute ONCE to prevent duplicate accept calls
   */
  useEffect(() => {
    // Wait for hash processing to complete first (handles magic link from email)
    if (!hashProcessed) return;

    // Then wait for auth to be ready
    if (!isAuthReady || authLoading) return;

    const initFlow = async () => {
      // Step 1: Validate token (AC2)
      const validation = await validateToken();
      if (!validation?.valid) return;

      // Step 2: Check if user is authenticated
      // After hash processing, user/session should be available if they clicked email link
      // OR if they just came from Google OAuth
      if (user && session) {
        // User has session - prevent duplicate execution
        if (flowExecutedRef.current) return;
        flowExecutedRef.current = true;

        console.log('User authenticated, proceeding to accept:', user.email);

        // Step 3: Check if user already has company (AC6)
        const hasCompany = await checkUserCompany(user.id);
        if (hasCompany) return;

        // Step 4: Auto-accept invitation (AC4)
        await acceptInvitation();
      } else {
        // No session - show auth UI (AC3)
        // This happens if user manually navigated to /join?token=xxx
        // Don't mark flowExecuted yet - will re-check when session becomes available (e.g., after OAuth)
        console.log('No session, showing auth UI');
        setPageState('show-auth');
      }
    };

    initFlow();
  }, [hashProcessed, isAuthReady, authLoading, user, session, validateToken, checkUserCompany, acceptInvitation, setPageState]);


  /**
   * Handle successful authentication from EmbeddedAuthForm
   */
  const handleAuthSuccess = useCallback(async () => {
    // After auth, auto-accept invitation
    // Note: User state will update via auth context
    // We need to wait for user to be available
    setPageState('accepting');
  }, [setPageState]);

  /**
   * Handle email confirmation requirement (signup flow)
   */
  const handleEmailConfirmation = useCallback((email: string) => {
    setPendingEmail(email);
    setPageState('email-confirmation');
  }, [setPendingEmail, setPageState]);

  /**
   * Watch for user changes after auth to trigger accept
   */
  useEffect(() => {
    if (pageState === 'accepting' && user && session && validationData) {
      acceptInvitation();
    }
  }, [pageState, user, session, validationData, acceptInvitation]);

  return (
    <JoinPageStateView
      state={pageState}
      hashProcessed={hashProcessed}
      authReady={isAuthReady}
      authLoading={authLoading}
      errorMessage={errorMessage}
      userCompanyName={userCompanyName}
      pendingEmail={pendingEmail}
      validationData={validationData}
      token={token}
      onRetry={() => {
        setPageState('loading');
        setErrorMessage('');
      }}
      onAuthSuccess={handleAuthSuccess}
      onEmailConfirmation={handleEmailConfirmation}
      onResendConfirmation={async () => {
        const supabase = createSupabaseBrowserClient();
        const { error } = await supabase.auth.resend({ type: 'signup', email: pendingEmail });
        if (error) throw error;
      }}
    />
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={<JoinLoadingFallback />}>
      <JoinPageContent />
    </Suspense>
  );
}
