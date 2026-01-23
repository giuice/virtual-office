// src/app/join/page.tsx
'use client';

import { useCallback, useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useNotification } from '@/hooks/useNotification';
import { Loader2, AlertCircle, CheckCircle, Building2 } from 'lucide-react';
import { EmbeddedAuthForm } from '@/components/auth/EmbeddedAuthForm';
import { EmailConfirmationMessage } from '@/components/auth/EmailConfirmationMessage';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser-client';
import type { ValidateInvitationResponse } from '@/app/api/invitations/validate/route';

/**
 * Page state machine for invitation accept flow
 * AC8 - Loading States requirement
 */
type PageState =
  | 'loading'           // Initial load, validating token
  | 'processing-hash'   // Processing Supabase hash fragment (magic link)
  | 'invalid-token'     // Token expired/used/not found (AC5)
  | 'show-auth'         // Valid token, show auth UI (AC3)
  | 'already-company'   // User already has company_id (AC6)
  | 'email-confirmation' // User signed up, waiting email confirmation
  | 'accepting'         // Calling accept API (AC4)
  | 'success'           // Accepted, redirecting
  | 'error';            // Accept failed

/**
 * Portuguese strings for error messages (AC5, AC6)
 */
const messages = {
  validating: 'Validando convite...',
  accepting: 'Entrando na empresa...',
  invalidToken: {
    title: 'Convite inválido ou expirado',
    description: 'Este link pode ter expirado ou já foi utilizado.',
    action: 'Entre em contato com o administrador da empresa para um novo convite.',
    button: 'Ir para Login',
  },
  alreadyCompany: {
    title: 'Você já pertence a uma empresa',
    description: 'Atualmente você é membro de {companyName}.',
    action: 'Para aceitar este convite, você precisa sair da empresa atual primeiro.',
    button: 'Ir para Dashboard',
  },
  success: 'Bem-vindo à empresa!',
  error: 'Erro ao aceitar convite. Tente novamente.',
  noToken: 'Link de convite inválido. Verifique o link e tente novamente.',
};

function JoinPageContent() {
  const searchParams = useSearchParams();
  const token = searchParams?.get('token') || null;
  const router = useRouter();
  
  const { user, session, isAuthReady, loading: authLoading } = useAuth();
  const { showSuccess, showError } = useNotification();

  // Page state
  const [pageState, setPageState] = useState<PageState>('loading');
  const [validationData, setValidationData] = useState<{
    email?: string;
    companyName?: string;
    companyId?: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [userCompanyName, setUserCompanyName] = useState<string>('');
  const [pendingEmail, setPendingEmail] = useState<string>('');
  const [hashProcessed, setHashProcessed] = useState(false);
  
  // CRITICAL: Prevent duplicate flow execution
  const [flowExecuted, setFlowExecuted] = useState(false);

  /**
   * Process Supabase hash fragment from magic link/invite email
   * The URL hash contains access_token when user clicks invite email link
   */
  useEffect(() => {
    const processHashFragment = async () => {
      // Check if URL has hash fragment with access_token (from Supabase invite email)
      if (typeof window === 'undefined') return;

      const supabase = createSupabaseBrowserClient();

      // Support PKCE/code flows as well as hash-token flows.
      // Some providers/flows return `?code=...` and require an exchange.
      const url = new URL(window.location.href);
      const code = url.searchParams.get('code');
      const typeFromQuery = url.searchParams.get('type');

      if (code) {
        console.log('Processing Supabase auth code from URL...');
        setPageState('processing-hash');

        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          console.error('Error exchanging code for session:', error);
          setErrorMessage('Erro ao processar link de convite. Tente novamente.');
          setPageState('error');
          setHashProcessed(true);
          return;
        }

        // Clean up URL so we don't re-process the code on refresh
        url.searchParams.delete('code');
        window.history.replaceState(null, '', url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : ''));

        // If this code corresponds to an invite/recovery flow, send user to set-password
        if (typeFromQuery === 'invite' || typeFromQuery === 'recovery') {
          console.log('Invite/recovery flow detected (query), redirecting to set-password...');
          const currentToken = new URLSearchParams(window.location.search).get('token');
          const returnUrl = currentToken ? `/join?token=${currentToken}` : '/onboarding';
          sessionStorage.setItem('passwordSetReturnUrl', returnUrl);
          window.location.href = '/set-password';
          return;
        }
      }
      
      const hash = window.location.hash;
      if (!hash || !hash.includes('access_token')) {
        setHashProcessed(true);
        return;
      }

      console.log('Processing Supabase hash fragment from invite email...');
      setPageState('processing-hash');

      try {
        // Parse the hash fragment
        const hashParams = new URLSearchParams(hash.substring(1));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        const type = hashParams.get('type');

        console.log('Hash fragment type:', type);

        if (accessToken && refreshToken) {
          // Set the session from the hash tokens
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            console.error('Error setting session from hash:', error);
            setErrorMessage('Erro ao processar link de convite. Tente novamente.');
            setPageState('error');
          } else {
            console.log('Session set successfully from hash:', data.user?.email);
            
            // Check if this is an invite flow - user needs to set password
            // The 'type' will be 'invite' or 'recovery' for password-less users
            if (type === 'invite' || type === 'recovery') {
              console.log('Invite/recovery flow detected, redirecting to set-password...');
              // Preserve the token in the URL for after password setup
              const currentToken = new URLSearchParams(window.location.search).get('token');
              const returnUrl = currentToken ? `/join?token=${currentToken}` : '/onboarding';
              
              // Store return URL for after password setup
              sessionStorage.setItem('passwordSetReturnUrl', returnUrl);
              
              // Clear the hash and redirect to set-password
              window.location.href = '/set-password';
              return;
            }
            
            // Clear the hash from URL to prevent reprocessing
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
          }
        }
      } catch (error) {
        console.error('Error processing hash fragment:', error);
      } finally {
        setHashProcessed(true);
      }
    };

    processHashFragment();
  }, [router]);

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
  }, [token]);

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
  }, []);

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
  }, [token, user, showSuccess, showError]);

  /**
   * Initial validation on mount
   * IMPORTANT: Wait for hash to be processed BEFORE starting flow
   * When user clicks Supabase invite email, the hash contains their session
   * CRITICAL: Only execute ONCE to prevent duplicate accept calls
   */
  useEffect(() => {
    // Prevent duplicate execution
    if (flowExecuted) return;
    
    // Wait for hash processing to complete first (handles magic link from email)
    if (!hashProcessed) return;
    
    // Then wait for auth to be ready
    if (!isAuthReady || authLoading) return;

    // Mark flow as executed IMMEDIATELY to prevent race conditions
    setFlowExecuted(true);

    const initFlow = async () => {
      // Step 1: Validate token (AC2)
      const validation = await validateToken();
      if (!validation?.valid) return;

      // Step 2: Check if user is authenticated
      // After hash processing, user/session should be available if they clicked email link
      if (user && session) {
        console.log('User authenticated, proceeding to accept:', user.email);
        
        // Step 3: Check if user already has company (AC6)
        const hasCompany = await checkUserCompany(user.id);
        if (hasCompany) return;

        // Step 4: Auto-accept invitation (AC4)
        await acceptInvitation();
      } else {
        // No session - show auth UI (AC3)
        // This happens if user manually navigated to /join?token=xxx
        console.log('No session, showing auth UI');
        setPageState('show-auth');
      }
    };

    initFlow();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowExecuted, hashProcessed, isAuthReady, authLoading, user, session]);

  /**
   * Handle successful authentication from EmbeddedAuthForm
   */
  const handleAuthSuccess = useCallback(async () => {
    // After auth, auto-accept invitation
    // Note: User state will update via auth context
    // We need to wait for user to be available
    setPageState('accepting');
  }, []);

  /**
   * Handle email confirmation requirement (signup flow)
   */
  const handleEmailConfirmation = useCallback((email: string) => {
    setPendingEmail(email);
    setPageState('email-confirmation');
  }, []);

  /**
   * Watch for user changes after auth to trigger accept
   */
  useEffect(() => {
    if (pageState === 'accepting' && user && session && validationData) {
      acceptInvitation();
    }
  }, [pageState, user, session, validationData, acceptInvitation]);

  // Loading state (AC8)
  // Also show loading while processing hash fragment from invite email
  if (!hashProcessed || !isAuthReady || authLoading || pageState === 'loading' || pageState === 'processing-hash') {
    const loadingMessage = pageState === 'processing-hash' 
      ? 'Processando link de convite...' 
      : messages.validating;
    
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4" role="status" aria-live="polite">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{loadingMessage}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Invalid/Expired Token State (AC5)
  if (pageState === 'invalid-token') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-3">
              <AlertCircle className="h-6 w-6 text-destructive" />
              <CardTitle>{messages.invalidToken.title}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground" aria-live="assertive">
              {errorMessage || messages.invalidToken.description}
            </p>
            <p className="text-sm text-muted-foreground">
              {messages.invalidToken.action}
            </p>
            <Button asChild className="w-full">
              <Link href="/login">{messages.invalidToken.button}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // User Already Has Company State (AC6)
  if (pageState === 'already-company') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Building2 className="h-6 w-6 text-amber-500" />
              <CardTitle>{messages.alreadyCompany.title}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground" aria-live="assertive">
              {messages.alreadyCompany.description.replace('{companyName}', userCompanyName)}
            </p>
            <p className="text-sm text-muted-foreground">
              {messages.alreadyCompany.action}
            </p>
            <Button asChild className="w-full">
              <Link href="/dashboard">{messages.alreadyCompany.button}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Email Confirmation State (signup completed, awaiting confirmation)
  if (pageState === 'email-confirmation') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <EmailConfirmationMessage
              email={pendingEmail}
              onResend={async () => {
                const supabase = createSupabaseBrowserClient();
                const { error } = await supabase.auth.resend({ type: 'signup', email: pendingEmail });
                if (error) throw error;
              }}
            />
            <div className="mt-4 text-center text-sm text-muted-foreground">
              <p>Após confirmar seu email, retorne a esta página para entrar na empresa.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Accepting State (AC8)
  if (pageState === 'accepting') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4" role="status" aria-live="polite">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{messages.accepting}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success State
  if (pageState === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4" role="status" aria-live="polite">
              <CheckCircle className="h-8 w-8 text-green-500" />
              <p className="text-lg font-medium">{messages.success}</p>
              <p className="text-sm text-muted-foreground">Redirecionando para o dashboard...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error State
  if (pageState === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-3">
              <AlertCircle className="h-6 w-6 text-destructive" />
              <CardTitle>Erro</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground" aria-live="assertive">
              {errorMessage || messages.error}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setPageState('loading');
                  setErrorMessage('');
                }}
              >
                Tentar novamente
              </Button>
              <Button asChild className="flex-1">
                <Link href="/login">Ir para Login</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show Auth State (AC3)
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Entrar na empresa</CardTitle>
          <CardDescription>
            {validationData?.companyName 
              ? `Você foi convidado para ${validationData.companyName}`
              : 'Você foi convidado para entrar em uma empresa'}
          </CardDescription>
          {validationData?.email && (
            <p className="text-xs text-muted-foreground mt-2">
              💡 Se você recebeu um email de convite, clique no link do email para acesso automático.
            </p>
          )}
        </CardHeader>
        <CardContent>
          <EmbeddedAuthForm
            onSuccess={handleAuthSuccess}
            inviteEmail={validationData?.email}
            oauthNextPath={token ? `/join?token=${token}` : undefined}
            onEmailConfirmation={handleEmailConfirmation}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Carregando...</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <JoinPageContent />
    </Suspense>
  );
}