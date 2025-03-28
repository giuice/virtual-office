'use client';

import { useCompany } from '@/contexts/CompanyContext';
import { DashboardShell } from '@/components/shell/dashboard-shell';
import { DashboardHeader } from '@/components/shell/dashboard-header';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { 
  Users2Icon, 
  HomeIcon, 
  SettingsIcon, 
  MessageSquareIcon, 
  CalendarIcon,
  ArrowRightIcon
} from 'lucide-react';
import { QuickLinksGrid } from '@/app/(dashboard)/dashboard/components/QuickLinksGrid';
import { CompanyOverviewCard } from '@/app/(dashboard)/dashboard/components/CompanyOverviewCard';
import { useMessaging } from '@/contexts/MessagingContext'; // Import useMessaging
import { useState } from 'react'; // Import useState
import { Input } from '@/components/ui/input'; // Import Input
import { MessageType, MessageStatus } from '@/types/messaging'; // Import enums

export default function DashboardPage() {
  const { company, currentUserProfile, companyUsers } = useCompany();
  
  const isAdmin = company?.adminIds?.includes(currentUserProfile?.id || '') || false;

  return (
    <DashboardShell>
      <DashboardHeader
        heading={`Welcome, ${currentUserProfile?.displayName || 'User'}!`}
        description={`${company?.name || 'Your company'} virtual office dashboard`}
      />
      <div className="flex-1 space-y-8"> {/* Added space-y-8 for consistent spacing */}
        {/* Moved Overview and QuickLinks Up */}
        <CompanyOverviewCard 
          company={company || undefined}
          companyUsers={companyUsers}
          currentUserProfile={currentUserProfile || undefined}
        />
          
        <QuickLinksGrid isAdmin={isAdmin} /> 

        {/* Removed the large Floor Plan Card */}
        
        {/* Removed Temporary Messaging Test Component */}

        {isAdmin && (
          <Card>
              <CardHeader>
                <CardTitle>Admin Actions</CardTitle>
                <CardDescription>
                  Special actions available to company administrators
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button asChild variant="outline" className="w-full justify-start">
                    <Link href="/team">
                      <Users2Icon className="mr-2 h-4 w-4" />
                      Manage Team
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="w-full justify-start">
                    <Link href="/settings">
                      <SettingsIcon className="mr-2 h-4 w-4" />
                      Company Settings
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
  
      </div>
    </DashboardShell>
  );
}

// Removed Temporary Test Component definition
