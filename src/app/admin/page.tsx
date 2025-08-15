'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, AlertTriangle } from 'lucide-react';

export default function AdminPage() {
  const { currentUserProfile, isLoading } = useCompany();
  const router = useRouter();

  // Check if user is admin
  const isAdmin = currentUserProfile?.role === 'admin';

  // Redirect to invitations page if admin
  useEffect(() => {
    if (!isLoading && isAdmin) {
      router.push('/admin/invitations');
    }
  }, [isLoading, isAdmin, router]);

  // Show loading state
  if (isLoading) {
    return (
      <div className="container mx-auto py-10">
        <div className="flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  // Show access denied if not admin
  if (!isAdmin) {
    return (
      <div className="container mx-auto py-10">
        <Card className="max-w-md mx-auto">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Access Denied
            </CardTitle>
            <CardDescription>
              You need administrator privileges to access the admin panel.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Only company administrators can access admin features. 
              Please contact your administrator if you need access to these features.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // This should not be reached due to the redirect, but just in case
  return (
    <div className="container mx-auto py-10">
      <div className="flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Redirecting to admin panel...</p>
        </div>
      </div>
    </div>
  );
}