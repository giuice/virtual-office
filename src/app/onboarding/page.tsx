'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/contexts/CompanyContext';
import { Loader2 } from 'lucide-react';

export default function OnboardingPage() {
  const router = useRouter();
  const { user, isAuthReady } = useAuth();
  const { company, isLoading: companyLoading, currentUserProfile } = useCompany();

  useEffect(() => {
    if (!isAuthReady) return;

    if (!user) {
      router.push('/login');
      return;
    }

    if (!companyLoading && (company?.id || currentUserProfile?.companyId)) {
      router.push('/dashboard');
    }
  }, [user, company, companyLoading, currentUserProfile, isAuthReady, router]);

  if (!isAuthReady || companyLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Configurando sua conta...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect
  }

  if (company?.id || currentUserProfile?.companyId) {
    return null; // Will redirect
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Bem-vindo!</CardTitle>
          <CardDescription>Para começar, crie uma empresa ou use um convite.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button asChild className="w-full">
            <Link href="/create-company">Criar nova empresa</Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href="/join">Tenho um código de convite</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}