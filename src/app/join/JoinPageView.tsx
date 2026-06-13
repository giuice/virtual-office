'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle, CheckCircle, Building2 } from 'lucide-react';
import { EmbeddedAuthForm } from '@/components/auth/EmbeddedAuthForm';
import { EmailConfirmationMessage } from '@/components/auth/EmailConfirmationMessage';
import type { PageState } from './join-client';
import { joinMessages } from './joinMessages';

interface JoinPageStateViewProps {
  state: PageState;
  hashProcessed: boolean;
  authReady: boolean;
  authLoading: boolean;
  errorMessage: string;
  userCompanyName: string;
  pendingEmail: string;
  validationData: {
    email?: string;
    companyName?: string;
    companyId?: string;
  } | null;
  token: string | null;
  onRetry: () => void;
  onAuthSuccess: () => void;
  onEmailConfirmation: (email: string) => void;
  onResendConfirmation: () => Promise<void>;
}

export function JoinPageStateView({
  state,
  hashProcessed,
  authReady,
  authLoading,
  errorMessage,
  userCompanyName,
  pendingEmail,
  validationData,
  token,
  onRetry,
  onAuthSuccess,
  onEmailConfirmation,
  onResendConfirmation,
}: JoinPageStateViewProps) {
  if (!hashProcessed || !authReady || authLoading || state === 'loading' || state === 'processing-hash') {
    const loadingMessage = state === 'processing-hash'
      ? 'Processando link de convite…'
      : joinMessages.validating;

    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <output className="flex flex-col items-center gap-4" aria-live="polite">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{loadingMessage}</p>
            </output>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state === 'invalid-token') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-3">
              <AlertCircle className="size-6 text-destructive" />
              <CardTitle>{joinMessages.invalidToken.title}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground" aria-live="assertive">
              {errorMessage || joinMessages.invalidToken.description}
            </p>
            <p className="text-sm text-muted-foreground">{joinMessages.invalidToken.action}</p>
            <Button asChild className="w-full">
              <Link href="/login">{joinMessages.invalidToken.button}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state === 'already-company') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Building2 className="size-6 text-amber-500" />
              <CardTitle>{joinMessages.alreadyCompany.title}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground" aria-live="assertive">
              {joinMessages.alreadyCompany.description.replace('{companyName}', userCompanyName)}
            </p>
            <p className="text-sm text-muted-foreground">{joinMessages.alreadyCompany.action}</p>
            <Button asChild className="w-full">
              <Link href="/dashboard">{joinMessages.alreadyCompany.button}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state === 'email-confirmation') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <EmailConfirmationMessage email={pendingEmail} onResend={onResendConfirmation} />
            <div className="mt-4 text-center text-sm text-muted-foreground">
              <p>Após confirmar seu email, retorne a esta página para entrar na empresa.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state === 'accepting') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <output className="flex flex-col items-center gap-4" aria-live="polite">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{joinMessages.accepting}</p>
            </output>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <output className="flex flex-col items-center gap-4" aria-live="polite">
              <CheckCircle className="size-8 text-green-500" />
              <p className="text-lg font-medium">{joinMessages.success}</p>
              <p className="text-sm text-muted-foreground">Redirecionando para o dashboard…</p>
            </output>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-3">
              <AlertCircle className="size-6 text-destructive" />
              <CardTitle>Erro</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground" aria-live="assertive">
              {errorMessage || joinMessages.error}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={onRetry}>
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
              Se você recebeu um email de convite, clique no link do email para acesso automático.
            </p>
          )}
        </CardHeader>
        <CardContent>
          <EmbeddedAuthForm
            onSuccess={onAuthSuccess}
            inviteEmail={validationData?.email}
            oauthNextPath={token ? `/join?token=${token}` : undefined}
            onEmailConfirmation={onEmailConfirmation}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export function JoinLoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Carregando…</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
