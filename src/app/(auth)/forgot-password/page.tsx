'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useNotification } from '@/hooks/useNotification';
import { Loader2, ArrowLeft } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser-client';
import { mapSupabaseAuthError } from '@/lib/auth/error-messages';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const { showSuccess, showError } = useNotification();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/set-password`,
      });

      if (error) throw error;

      setIsSuccess(true);
      showSuccess({ description: 'Email de recuperação enviado!' });
    } catch (error) {
      const friendlyMessage = mapSupabaseAuthError(error);
      showError({ description: friendlyMessage });
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Verifique seu email</CardTitle>
            <CardDescription>
              Enviamos um link de recuperação para <strong>{email}</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Clique no link enviado para redefinir sua senha. Se não encontrar o email, verifique sua pasta de spam.
            </p>
            <Button asChild className="w-full" variant="outline">
              <Link href="/login">Voltar para o login</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Recuperar senha</CardTitle>
          <CardDescription>
            Digite seu email para receber um link de redefinição de senha.
          </CardDescription>
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
                disabled={isLoading}
              />
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                'Enviar link de recuperação'
              )}
            </Button>

            <Button asChild variant="ghost" className="w-full">
              <Link href="/login" className="flex items-center gap-2">
                <ArrowLeft className="h-4 w-4" />
                Voltar para o login
              </Link>
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
