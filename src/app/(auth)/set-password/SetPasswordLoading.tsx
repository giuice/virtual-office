'use client';

import { Loader2 } from 'lucide-react';

export function SetPasswordLoading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
      <Loader2 className="size-8 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Verificando sessão…</p>
    </div>
  );
}
