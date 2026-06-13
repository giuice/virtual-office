'use client';

import { RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Mail } from 'lucide-react';
import type { AuthMode, FormStatus } from './EmbeddedAuthForm';
import { EmbeddedAuthFormError } from './EmbeddedAuthFormError';

const AUTH_DIVIDER = (
  <div className="relative my-4">
    <div className="absolute inset-0 flex items-center">
      <span className="w-full border-t" />
    </div>
    <div className="relative flex justify-center text-xs uppercase">
      <span className="bg-background px-2 text-muted-foreground">Ou continuar com</span>
    </div>
  </div>
);

interface EmbeddedAuthFormViewProps {
  inviteEmail?: string;
  authMode: AuthMode;
  email: string;
  displayName: string;
  password: string;
  confirmPassword: string;
  formStatus: FormStatus;
  formError: string | null;
  emailSent: boolean;
  disabled: boolean;
  errorRef: RefObject<HTMLDivElement | null>;
  onAuthModeChange: (mode: AuthMode) => void;
  onEmailChange: (value: string) => void;
  onDisplayNameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onResendInviteEmail: () => void;
  onGoogleSignIn: () => void;
  onLogin: (event: React.FormEvent<HTMLFormElement>) => void;
  onSignup: (event: React.FormEvent<HTMLFormElement>) => void;
}

function renderGoogleButton({
  formStatus,
  disabled,
  onClick,
}: Pick<EmbeddedAuthFormViewProps, 'formStatus' | 'disabled'> & { onClick: () => void }) {
  return (
    <Button type="button" variant="outline" className="w-full" onClick={onClick} disabled={disabled}>
      {formStatus === 'google' ? (
        <span className="inline-flex items-center justify-center gap-2">
          <Loader2 className="size-4 animate-spin" />
          Entrando com Google…
        </span>
      ) : (
        <span className="inline-flex items-center justify-center gap-2">
          <svg className="mr-2 size-4" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          Entrar com Google
        </span>
      )}
    </Button>
  );
}

export function EmbeddedAuthFormView({
  inviteEmail,
  authMode,
  email,
  displayName,
  password,
  confirmPassword,
  formStatus,
  formError,
  emailSent,
  disabled,
  errorRef,
  onAuthModeChange,
  onEmailChange,
  onDisplayNameChange,
  onPasswordChange,
  onConfirmPasswordChange,
  onResendInviteEmail,
  onGoogleSignIn,
  onLogin,
  onSignup,
}: EmbeddedAuthFormViewProps) {
  const googleButton = renderGoogleButton({ formStatus, disabled, onClick: onGoogleSignIn });

  return (
    <div className="space-y-4">
      {inviteEmail && authMode === 'set-password' && (
        <div className="space-y-4">
          <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200">
            <p className="font-medium flex items-center gap-2">
              <Mail className="size-4" />
              Você foi convidado!
            </p>
            <p className="mt-2">
              Um email de convite foi enviado para <strong>{inviteEmail}</strong>.
            </p>
            <p className="mt-1 text-xs">
              Clique no link do email para acessar automaticamente, ou use uma das opções abaixo.
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="invite-email" className="text-sm font-medium">Email</label>
            <Input id="invite-email" type="email" value={inviteEmail} disabled readOnly />
            <p className="text-xs text-muted-foreground">Email do convite (não pode ser alterado)</p>
          </div>

          {emailSent ? (
            <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
              <p>Email reenviado! Verifique sua caixa de entrada (e spam).</p>
            </div>
          ) : (
            <Button type="button" variant="outline" className="w-full" onClick={onResendInviteEmail} disabled={disabled}>
              {formStatus === 'resending' ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <Loader2 className="size-4 animate-spin" />
                  Reenviando…
                </span>
              ) : (
                <span className="inline-flex items-center justify-center gap-2">
                  <Mail className="size-4" />
                  Reenviar email de acesso
                </span>
              )}
            </Button>
          )}

          <EmbeddedAuthFormError message={formError} errorRef={errorRef} />
          {AUTH_DIVIDER}
          {googleButton}

          <div className="text-center">
            <Button type="button" variant="link" className="text-xs text-muted-foreground" onClick={() => onAuthModeChange('login')}>
              Já tenho senha? Fazer login
            </Button>
          </div>
        </div>
      )}

      {(!inviteEmail || authMode !== 'set-password') && (
        <Tabs value={authMode === 'set-password' ? 'login' : authMode} onValueChange={(value) => onAuthModeChange(value as AuthMode)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signup" disabled={disabled}>Criar conta</TabsTrigger>
            <TabsTrigger value="login" disabled={disabled}>Já tenho conta</TabsTrigger>
          </TabsList>

          <TabsContent value="signup" className="mt-4">
            <form onSubmit={onSignup} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="signup-email" className="text-sm font-medium">Email</label>
                <Input id="signup-email" type="email" value={email} onChange={(e) => onEmailChange(e.target.value)} placeholder="Digite seu email" required disabled={disabled || !!inviteEmail} aria-describedby={inviteEmail ? 'email-prefilled' : undefined} />
                {inviteEmail && <p id="email-prefilled" className="text-xs text-muted-foreground">Email do convite (não pode ser alterado)</p>}
              </div>

              <div className="space-y-2">
                <label htmlFor="signup-name" className="text-sm font-medium">Nome</label>
                <Input id="signup-name" type="text" value={displayName} onChange={(e) => onDisplayNameChange(e.target.value)} placeholder="Digite seu nome" required disabled={disabled} />
              </div>

              <div className="space-y-2">
                <label htmlFor="signup-password" className="text-sm font-medium">Senha</label>
                <Input id="signup-password" type="password" value={password} onChange={(e) => onPasswordChange(e.target.value)} placeholder="Crie uma senha" required disabled={disabled} />
              </div>

              <div className="space-y-2">
                <label htmlFor="signup-confirm-password" className="text-sm font-medium">Confirmar senha</label>
                <Input id="signup-confirm-password" type="password" value={confirmPassword} onChange={(e) => onConfirmPasswordChange(e.target.value)} placeholder="Confirme sua senha" required disabled={disabled} />
              </div>

              <EmbeddedAuthFormError message={formError} errorRef={errorRef} />
              <Button type="submit" className="w-full" disabled={disabled}>
                {formStatus === 'credential' ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    Criando conta…
                  </span>
                ) : 'Criar conta'}
              </Button>

              {AUTH_DIVIDER}
              {googleButton}
            </form>
          </TabsContent>

          <TabsContent value="login" className="mt-4">
            <form onSubmit={onLogin} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="login-email" className="text-sm font-medium">Email</label>
                <Input id="login-email" type="email" value={email} onChange={(e) => onEmailChange(e.target.value)} placeholder="Digite seu email" required disabled={disabled} />
              </div>

              <div className="space-y-2">
                <label htmlFor="login-password" className="text-sm font-medium">Senha</label>
                <Input id="login-password" type="password" value={password} onChange={(e) => onPasswordChange(e.target.value)} placeholder="Digite sua senha" required disabled={disabled} />
              </div>

              <EmbeddedAuthFormError message={formError} errorRef={errorRef} />
              <Button type="submit" className="w-full" disabled={disabled}>
                {formStatus === 'credential' ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    Entrando…
                  </span>
                ) : 'Entrar'}
              </Button>

              {AUTH_DIVIDER}
              {googleButton}
            </form>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
