// src/app/(auth)/signup/page.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { mapSupabaseAuthError } from '@/lib/auth/error-messages';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser-client';
import { EmailConfirmationMessage } from '@/components/auth/EmailConfirmationMessage';

type FormStatus = 'idle' | 'password' | 'google';

function AuthLoadingScreen({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground" aria-live="assertive">
        {message}
      </p>
    </div>
  );
}

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [formStatus, setFormStatus] = useState<FormStatus>('idle');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [signupSuccess, setSignupSuccess] = useState<{ success: boolean; email: string } | null>(null);

  const { signUp, signInWithGoogle, loading: authLoading, isAuthReady, actionLoading } = useAuth();
  const errorRef = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLDivElement>(null);

  const isBusy = isLoading || actionLoading;
  const isDisabled = isBusy || !isAuthReady;

  useEffect(() => {
    if (formError) {
      errorRef.current?.focus();
    }
  }, [formError]);

  useEffect(() => {
    if (signupSuccess?.success) {
      successRef.current?.focus();
    }
  }, [signupSuccess]);

  if (!isAuthReady || authLoading) {
    return <AuthLoadingScreen message="Preparando experiência de cadastro..." />;
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);

    if (password !== confirmPassword) {
      setFormError('As senhas não conferem. Confirme sua senha.');
      return;
    }

    setStatusMessage('Criando sua conta...');
    setIsLoading(true);
    setFormStatus('password');

    try {
      await signUp(email, password, displayName);
      setSignupSuccess({ success: true, email });
    } catch (error) {
      const friendlyMessage = mapSupabaseAuthError(error);
      setFormError(friendlyMessage);
      setStatusMessage(null);
    } finally {
      setFormStatus('idle');
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setFormError(null);
    setStatusMessage('Entrando com Google...');
    setIsLoading(true);
    setFormStatus('google');

    try {
      await signInWithGoogle();
      setStatusMessage('Redirecionando...');
    } catch (error) {
      const friendlyMessage = mapSupabaseAuthError(error);
      setFormError(friendlyMessage);
      setStatusMessage(null);
    } finally {
      setFormStatus('idle');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        {signupSuccess ? (
          <CardContent className="pt-6" tabIndex={-1} ref={successRef}>
            <EmailConfirmationMessage
              email={signupSuccess.email}
              onResend={async () => {
                const supabase = createSupabaseBrowserClient();
                const { error } = await supabase.auth.resend({ type: 'signup', email: signupSuccess.email });
                if (error) throw error;
              }}
            />
            <div className="mt-4 text-center">
              <Link href="/login" className="text-sm text-primary hover:underline">
                Já confirmou? Fazer login
              </Link>
            </div>
          </CardContent>
        ) : (
          <>
            <CardHeader>
              <CardTitle>Criar conta</CardTitle>
              <CardDescription>Cadastre-se para acessar seu escritório virtual</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Digite seu email"
                required
                disabled={isDisabled}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="displayName" className="text-sm font-medium">
                Nome
              </label>
              <Input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Digite seu nome"
                required
                disabled={isDisabled}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                Senha
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Crie uma senha"
                required
                disabled={isDisabled}
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
                disabled={isDisabled}
              />
            </div>

            {formError && (
              <div
                role="alert"
                tabIndex={-1}
                ref={errorRef}
                className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
              >
                {formError}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isDisabled}>
              {isBusy && formStatus === 'password' ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {statusMessage ?? 'Criando conta...'}
                </span>
              ) : (
                'Criar conta'
              )}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Ou continuar com</span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleGoogleSignIn}
              disabled={isDisabled}
            >
              {isBusy && formStatus === 'google' ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {statusMessage ?? 'Entrando com Google...'}
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

            <p aria-live="polite" className="min-h-[1.25rem] text-xs text-muted-foreground">
              {statusMessage}
            </p>

            <p className="text-sm text-center text-muted-foreground">
              Já tem uma conta?{' '}
              <Link href="/login" className="text-primary hover:underline">
                Entrar
              </Link>
            </p>
          </form>
        </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
