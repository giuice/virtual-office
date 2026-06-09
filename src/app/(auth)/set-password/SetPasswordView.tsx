'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, KeyRound } from 'lucide-react';

interface SetPasswordFormProps {
  email?: string;
  displayName: string;
  password: string;
  confirmPassword: string;
  formError: string | null;
  loading: boolean;
  displayNameRequired: boolean;
  onDisplayNameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}

export function SetPasswordForm({
  email,
  displayName,
  password,
  confirmPassword,
  formError,
  loading,
  displayNameRequired,
  onDisplayNameChange,
  onPasswordChange,
  onConfirmPasswordChange,
  onSubmit,
}: SetPasswordFormProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <KeyRound className="size-5 text-primary" />
            <CardTitle>Definir sua senha</CardTitle>
          </div>
          <CardDescription>
            {email ? (
              <>Crie uma senha para a conta <strong>{email}</strong></>
            ) : (
              'Crie uma senha para acessar sua conta'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="displayName" className="text-sm font-medium">
                Nome completo
              </label>
              <Input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => onDisplayNameChange(e.target.value)}
                placeholder="Seu nome"
                required={displayNameRequired}
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                Nova senha
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
                placeholder="Digite sua nova senha"
                required
                disabled={loading}
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
                onChange={(e) => onConfirmPasswordChange(e.target.value)}
                placeholder="Confirme sua senha"
                required
                disabled={loading}
                minLength={6}
              />
            </div>

            {formError && (
              <div role="alert" className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                {formError}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <Loader2 className="size-4 animate-spin" />
                  Salvando…
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
