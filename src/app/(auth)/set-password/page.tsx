// src/app/(auth)/set-password/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useNotification } from '@/hooks/useNotification';
import { Loader2, KeyRound, CheckCircle, Building2 } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser-client';
import type { PendingInvitationResponse } from '@/app/api/invitations/pending/route';

export default function SetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isAcceptingInvite, setIsAcceptingInvite] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [pendingInvite, setPendingInvite] = useState<PendingInvitationResponse['invitation'] | null>(null);
  const [successMessage, setSuccessMessage] = useState('');

  const router = useRouter();
  const { user, loading: authLoading, isAuthReady } = useAuth();
  const { showSuccess, showError } = useNotification();

  // Check if user has a valid session (came from invite/recovery link)
  useEffect(() => {
    const checkSession = async () => {
      const supabase = createSupabaseBrowserClient();
      
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
              router.push('/login');
              return;
            }
            
            // Clean up URL
            window.history.replaceState(null, '', window.location.pathname);
          } catch (err) {
            console.error('Exception setting session:', err);
            showError({ description: 'Erro ao processar link. Tente novamente.' });
            router.push('/login');
            return;
          }
        }
      }
      
      setIsCheckingSession(false);
    };
    
    checkSession();
  }, [router, showError]);

  // Redirect if no session
  useEffect(() => {
    if (!isCheckingSession && isAuthReady && !user) {
      showError({ description: 'Você precisa estar autenticado para definir uma senha.' });
      router.push('/login');
    }
  }, [isCheckingSession, isAuthReady, user, router, showError]);

  /**
   * Check for pending invitation after session is established
   * This runs after password is set to auto-accept any pending invites
   */
  const checkAndAcceptPendingInvite = useCallback(async (): Promise<boolean> => {
    try {
      console.log('[set-password] Checking for pending invitation...');
      
      const response = await fetch('/api/invitations/pending');
      const data: PendingInvitationResponse = await response.json();
      
      if (!data.hasPending || !data.invitation) {
        console.log('[set-password] No pending invitation found');
        return false;
      }

      console.log('[set-password] Found pending invitation for company:', data.invitation.companyName);
      setPendingInvite(data.invitation);
      setIsAcceptingInvite(true);

      // Auto-accept the invitation
      const acceptResponse = await fetch('/api/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: data.invitation.token }),
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
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);

    // Validations
    if (password.length < 6) {
      setFormError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setFormError('As senhas não coincidem.');
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createSupabaseBrowserClient();
      
      const { error } = await supabase.auth.updateUser({
        password: password,
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
      
      if (inviteAccepted) {
        // Invite was accepted - go straight to dashboard
        redirectUrl = '/dashboard';
        showSuccess({ description: `Bem-vindo! Você entrou na empresa.` });
      } else {
        // Check if there's a manual return URL from the join flow
        const returnUrl = sessionStorage.getItem('passwordSetReturnUrl');
        sessionStorage.removeItem('passwordSetReturnUrl');
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

  // Show loading while checking session or auth
  if (isCheckingSession || authLoading || !isAuthReady) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Verificando sessão...</p>
      </div>
    );
  }

  // Show success state with invite info
  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CheckCircle className="mx-auto h-12 w-12 text-green-500 mb-4" />
            <CardTitle>Senha definida!</CardTitle>
            <CardDescription>
              {isAcceptingInvite ? (
                <span className="flex items-center justify-center gap-2 mt-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Entrando na empresa...
                </span>
              ) : successMessage ? (
                <span className="flex items-center justify-center gap-2 mt-2">
                  <Building2 className="h-4 w-4 text-green-500" />
                  {successMessage}
                </span>
              ) : (
                'Sua senha foi configurada com sucesso. Redirecionando...'
              )}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            <CardTitle>Definir sua senha</CardTitle>
          </div>
          <CardDescription>
            {user?.email ? (
              <>Crie uma senha para a conta <strong>{user.email}</strong></>
            ) : (
              'Crie uma senha para acessar sua conta'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                Nova senha
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Digite sua nova senha"
                required
                disabled={isLoading}
                minLength={6}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="text-sm font-medium">
                Confirmar senha
              </label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirme sua senha"
                required
                disabled={isLoading}
                minLength={6}
              />
            </div>

            {formError && (
              <div
                role="alert"
                className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
              >
                {formError}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Salvando...
                </span>
              ) : (
                'Definir senha'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
