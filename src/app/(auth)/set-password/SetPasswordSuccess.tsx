'use client';

import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle, Building2 } from 'lucide-react';

interface SetPasswordSuccessProps {
  acceptingInvite: boolean;
  message: string;
}

export function SetPasswordSuccess({ acceptingInvite, message }: SetPasswordSuccessProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CheckCircle className="mx-auto size-12 text-green-500 mb-4" />
          <CardTitle>Senha definida!</CardTitle>
          <CardDescription>
            {acceptingInvite ? (
              <span className="flex items-center justify-center gap-2 mt-2">
                <Loader2 className="size-4 animate-spin" />
                Entrando na empresa…
              </span>
            ) : message ? (
              <span className="flex items-center justify-center gap-2 mt-2">
                <Building2 className="size-4 text-green-500" />
                {message}
              </span>
            ) : (
              'Sua senha foi configurada com sucesso. Redirecionando…'
            )}
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
