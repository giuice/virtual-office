'use client';

import { useEffect, useState, useCallback } from 'react';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/contexts/CompanyContext';
import { Loader2, Building2, Mail, CheckCircle } from 'lucide-react';
import type { PendingInvitationResponse } from '@/app/api/invitations/pending/route';
import { useReducerState } from '@/hooks/useReducerState';

export default function OnboardingPage() {
  const { user, isAuthReady } = useAuth();
  const { company, isLoading: companyLoading, currentUserProfile } = useCompany();
  
  const [pendingInviteState, updatePendingInviteState] = useReducerState<{
    invitation: PendingInvitationResponse['invitation'] | null;
    status: 'checking' | 'ready';
  }>({ invitation: null, status: 'checking' });
  const [isAcceptingInvite, setIsAcceptingInvite] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  /**
   * Check for pending invitation for this user's email
   */
  const checkPendingInvitation = useCallback(async () => {
    if (!user?.email) {
      updatePendingInviteState({ invitation: null, status: 'ready' });
      return;
    }

    try {
      console.log('[onboarding] Checking for pending invitation...');
      const response = await fetch('/api/invitations/pending');
      const data: PendingInvitationResponse = await response.json();
      
      if (data.hasPending && data.invitation) {
        console.log('[onboarding] Found pending invitation for:', data.invitation.companyName);
        updatePendingInviteState({ invitation: data.invitation, status: 'ready' });
      } else {
        console.log('[onboarding] No pending invitation found');
        updatePendingInviteState({ invitation: null, status: 'ready' });
      }
    } catch (error) {
      console.error('[onboarding] Error checking pending invitation:', error);
      updatePendingInviteState({ invitation: null, status: 'ready' });
    }
  }, [user?.email, updatePendingInviteState]);

  /**
   * Accept the pending invitation
   */
  const handleAcceptInvite = async () => {
    if (!pendingInvite) return;

    setIsAcceptingInvite(true);
    setAcceptError(null);

    try {
      const response = await fetch('/api/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: pendingInvite.token }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao aceitar convite');
      }

      // Success! Redirect to dashboard with hard navigation
      window.location.href = '/dashboard';
    } catch (error) {
      console.error('[onboarding] Error accepting invitation:', error);
      setAcceptError(error instanceof Error ? error.message : 'Erro ao aceitar convite');
      setIsAcceptingInvite(false);
    }
  };

  // Check for pending invitation when user is ready
  useEffect(() => {
    if (isAuthReady && user && !companyLoading) {
      checkPendingInvitation();
    }
  }, [isAuthReady, user, companyLoading, checkPendingInvitation]);

  // Loading state
  const pendingInvite = pendingInviteState.invitation;

  if (!isAuthReady || companyLoading || pendingInviteState.status === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Configurando sua conta…</p>
        </div>
      </div>
    );
  }

  // Redirect states
  if (!user) {
    redirect('/login');
  }

  if (company?.id || currentUserProfile?.companyId) {
    redirect('/dashboard');
  }

  if (company?.id || currentUserProfile?.companyId) {
    return null;
  }

  // User has a pending invite - show accept UI
  if (pendingInvite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Mail className="size-6 text-primary" />
              <CardTitle>Você foi convidado!</CardTitle>
            </div>
            <CardDescription>
              Você tem um convite pendente para entrar em uma empresa.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border p-4 bg-muted/50">
              <div className="flex items-center gap-3">
                <Building2 className="size-8 text-primary" />
                <div>
                  <p className="font-semibold text-lg">{pendingInvite.companyName}</p>
                  <p className="text-sm text-muted-foreground">
                    Função: {pendingInvite.role === 'admin' ? 'Administrador' : 'Membro'}
                  </p>
                </div>
              </div>
            </div>

            {acceptError && (
              <div
                role="alert"
                className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
              >
                {acceptError}
              </div>
            )}

            <Button 
              className="w-full" 
              onClick={handleAcceptInvite}
              disabled={isAcceptingInvite}
            >
              {isAcceptingInvite ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" />
                  Entrando na empresa…
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <CheckCircle className="size-4" />
                  Aceitar convite e entrar
                </span>
              )}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Enviado para {user.email}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // No pending invite - show create company option
  // Note: We don't show "Tenho um código de convite" since invites are sent by email
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Bem-vindo!</CardTitle>
          <CardDescription>
            Para começar, crie sua empresa no Virtual Office.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button asChild className="w-full">
            <Link href="/create-company">
              <Building2 className="size-4 mr-2" />
              Criar nova empresa
            </Link>
          </Button>

          <Button asChild variant="outline" className="w-full">
            <Link href="/join">Tenho um código de convite</Link>
          </Button>
          
          <p className="text-xs text-center text-muted-foreground">
            Se você foi convidado para uma empresa, verifique seu email ({user.email}) 
            e clique no link do convite.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
