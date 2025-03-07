'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useProtectedRoute } from '@/hooks/useProtectedRoute';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useCompany } from '@/contexts/CompanyContext';
import { CompanyMembers } from '@/components/dashboard/company-members';

export default function OfficePage() {
  const { isReady, loading } = useProtectedRoute();
  const router = useRouter();
  const { company, currentUserProfile } = useCompany();

  // Redirect to floor plan
  useEffect(() => {
    if (isReady) {
      router.push('/floor-plan');
    }
  }, [isReady, router]);

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-semibold">Loading...</h2>
          <p className="text-muted-foreground">Setting up your workspace</p>
        </div>
      </div>
    );
  }

  const isAdmin = company?.adminIds.includes(currentUserProfile?.id || '') || false;

  return (
    <div className="container mx-auto py-8">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Company Info Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{company?.name}</CardTitle>
              {isAdmin && <Badge>Admin</Badge>}
            </div>
            <CardDescription>Your virtual office workspace</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex flex-col space-y-1">
                <span className="text-sm font-medium">Current Members</span>
                <span className="text-2xl font-bold">{company?.adminIds.length || 0}</span>
              </div>
              <div className="flex justify-start space-x-2">
                <Button onClick={() => router.push('/floor-plan')}>
                  Enter Floor Plan
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Team Members Card */}
        <div className="md:col-span-2">
          <CompanyMembers />
        </div>
      </div>
    </div>
  );
}