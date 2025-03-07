// src/app/(dashboard)/company/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardShell } from '@/components/shell/dashboard-shell';
import { DashboardHeader } from '@/components/shell/dashboard-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CompanySettings } from '@/components/dashboard/company-settings';
import { CompanyMembers } from '@/components/dashboard/company-members';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function CompanyPage() {
  const { company, currentUserProfile, isLoading } = useCompany();
  const router = useRouter();
  
  // Get tab from URL or default to members
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('tab') || 'members';
    }
    return 'members';
  });
  
  // Update URL when tab changes
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    router.push(`/company?tab=${tab}`, { scroll: false });
  };
  
  // Check if the user belongs to a company
  const hasCompany = Boolean(currentUserProfile?.companyId);
  
  // Check if the user is an admin (only admins can access settings tab)
  const isAdmin = company?.adminIds?.includes(currentUserProfile?.id || '') || false;

  // Redirect to create-company page if user doesn't have a company
  useEffect(() => {
    if (!isLoading && !hasCompany) {
      router.push('/create-company');
    }
  }, [hasCompany, isLoading, router]);

  // If still loading, show loading state
  if (isLoading) {
    return (
      <DashboardShell>
        <DashboardHeader
          heading="Company Management"
          description="Loading company information..."
        />
        <div className="grid gap-8">
          <Card>
            <CardHeader>
              <CardTitle className="animate-pulse bg-muted h-6 w-48 rounded"></CardTitle>
              <CardDescription className="animate-pulse bg-muted h-4 w-72 rounded mt-2"></CardDescription>
            </CardHeader>
            <CardContent>
              <div className="animate-pulse space-y-4">
                <div className="h-8 bg-muted rounded w-full"></div>
                <div className="h-24 bg-muted rounded w-full"></div>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardShell>
    );
  }

  // If no company, show placeholder (should redirect, but just in case)
  if (!hasCompany) {
    return (
      <DashboardShell>
        <DashboardHeader
          heading="Company Management"
          description="You need to create or join a company first"
        />
        <div className="grid gap-8">
          <Card>
            <CardHeader>
              <CardTitle>No Company Found</CardTitle>
              <CardDescription>
                You need to create or join a company to access this page
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => router.push('/create-company')}>
                Create Company
              </Button>
            </CardContent>
          </Card>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <DashboardHeader
        heading="Company Management"
        description={`Manage ${company?.name || 'your company'} settings, members and permissions`}
      />
      
      <div className="grid gap-8">
        <Tabs 
          defaultValue="members" 
          className="w-full"
          value={activeTab}
          onValueChange={handleTabChange}
        >
          <TabsList className="mb-6">
            <TabsTrigger value="members">Team Members</TabsTrigger>
            {isAdmin && <TabsTrigger value="settings">Company Settings</TabsTrigger>}
          </TabsList>
          
          <TabsContent value="members" className="space-y-4">
            <CompanyMembers />
          </TabsContent>
          
          {isAdmin && (
            <TabsContent value="settings" className="space-y-4">
              <CompanySettings />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </DashboardShell>
  );
}