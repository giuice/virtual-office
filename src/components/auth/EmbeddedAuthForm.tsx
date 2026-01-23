// src/components/auth/EmbeddedAuthForm.tsx
'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { useNotification } from '@/hooks/useNotification';
import { mapSupabaseAuthError } from '@/lib/auth/error-messages';
import { Loader2, Mail, KeyRound } from 'lucide-react';
import { Session } from '@supabase/supabase-js';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser-client';

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

type FormStatus = 'idle' | 'credential' | 'google' | 'resending';
type AuthMode = 'login' | 'signup' | 'set-password';

export function EmbeddedAuthForm({
  onSuccess,
  inviteEmail,
  onEmailConfirmation,
  disabled = false,
  oauthNextPath,
}: EmbeddedAuthFormProps) {
  const [email, setEmail] = useState(inviteEmail || '');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formStatus, setFormStatus] = useState<FormStatus>('idle');
  const [formError, setFormError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  // If user was invited via email, show set-password flow (they need to define password via reset)
  const [authMode, setAuthMode] = useState<AuthMode>(inviteEmail ? 'set-password' : 'signup');

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
      showSuccess({ description: 'Redirecionando para Google...' });
    } catch (error) {
      const friendlyMessage = mapSupabaseAuthError(error);
      setFormError(friendlyMessage);
      showError({ description: friendlyMessage });
      errorRef.current?.focus();
    } finally {
      setFormStatus('idle');
    }
  };

  const GoogleButton = (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      onClick={handleGoogleSignIn}
      disabled={isDisabled}
    >
      {formStatus === 'google' ? (
        <span className="inline-flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Entrando com Google...
        </span>
      ) : (
        <span className="inline-flex items-center justify-center gap-2">
          <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Entrar com Google
        </span>
      )}
    </Button>
  );

  const Divider = (
    <div className="relative my-4">
      <div className="absolute inset-0 flex items-center">
        <span className="w-full border-t" />
      </div>
      <div className="relative flex justify-center text-xs uppercase">
        <span className="bg-background px-2 text-muted-foreground">Ou continuar com</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Special flow for invited users - they need to click email link or use Google */}
      {inviteEmail && authMode === 'set-password' && (
        <div className="space-y-4">
          <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200">
            <p className="font-medium flex items-center gap-2">
              <Mail className="h-4 w-4" />
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
            <label htmlFor="invite-email" className="text-sm font-medium">
              Email
            </label>
            <Input id="invite-email" type="email" value={inviteEmail} disabled readOnly />
            <p className="text-xs text-muted-foreground">Email do convite (não pode ser alterado)</p>
          </div>

          {emailSent ? (
            <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
              <p>✓ Email reenviado! Verifique sua caixa de entrada (e spam).</p>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleResendInviteEmail}
              disabled={isDisabled}
            >
              {formStatus === 'resending' ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Reenviando...
                </span>
              ) : (
                <span className="inline-flex items-center justify-center gap-2">
                  <Mail className="h-4 w-4" />
                  Reenviar email de acesso
                </span>
              )}
            </Button>
          )}

          {formError && (
            <div
              role="alert"
              tabIndex={-1}
              ref={errorRef}
              aria-live="assertive"
              className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
            >
              {formError}
            </div>
          )}

          {Divider}
          {GoogleButton}
          
          <div className="text-center">
            <Button
              type="button"
              variant="link"
              className="text-xs text-muted-foreground"
              onClick={() => setAuthMode('login')}
            >
              Já tenho senha? Fazer login
            </Button>
          </div>
        </div>
      )}

      {/* Standard auth flow (no invite or user chose login/signup) */}
      {(!inviteEmail || authMode !== 'set-password') && (
        <Tabs value={authMode === 'set-password' ? 'login' : authMode} onValueChange={(v) => setAuthMode(v as AuthMode)}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="signup" disabled={isDisabled}>
            Criar conta
          </TabsTrigger>
          <TabsTrigger value="login" disabled={isDisabled}>
            Já tenho conta
          </TabsTrigger>
        </TabsList>

        <TabsContent value="signup" className="mt-4">
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="signup-email" className="text-sm font-medium">
                Email
              </label>
              <Input
                id="signup-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Digite seu email"
                required
                disabled={isDisabled || !!inviteEmail}
                aria-describedby={inviteEmail ? 'email-prefilled' : undefined}
              />
              {inviteEmail && (
                <p id="email-prefilled" className="text-xs text-muted-foreground">
                  Email do convite (não pode ser alterado)
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="signup-name" className="text-sm font-medium">
                Nome
              </label>
              <Input
                id="signup-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Digite seu nome"
                required
                disabled={isDisabled}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="signup-password" className="text-sm font-medium">
                Senha
              </label>
              <Input
                id="signup-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Crie uma senha"
                required
                disabled={isDisabled}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="signup-confirm-password" className="text-sm font-medium">
                Confirmar senha
              </label>
              <Input
                id="signup-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirme sua senha"
                required
                disabled={isDisabled}
              />
            </div>

            {formError && (
              <div
                role="alert"
                tabIndex={-1}
                ref={errorRef}
                aria-live="assertive"
                className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
              >
                {formError}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isDisabled}>
              {formStatus === 'credential' ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Criando conta...
                </span>
              ) : (
                'Criar conta'
              )}
            </Button>

            {Divider}
            {GoogleButton}
          </form>
        </TabsContent>

        <TabsContent value="login" className="mt-4">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="login-email" className="text-sm font-medium">
                Email
              </label>
              <Input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Digite seu email"
                required
                disabled={isDisabled}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="login-password" className="text-sm font-medium">
                Senha
              </label>
              <Input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Digite sua senha"
                required
                disabled={isDisabled}
              />
            </div>

            {formError && (
              <div
                role="alert"
                tabIndex={-1}
                ref={errorRef}
                aria-live="assertive"
                className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
              >
                {formError}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isDisabled}>
              {formStatus === 'credential' ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Entrando...
                </span>
              ) : (
                'Entrar'
              )}
            </Button>

            {Divider}
            {GoogleButton}
          </form>
        </TabsContent>
      </Tabs>
      )}
    </div>
  );
}
