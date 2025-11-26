'use client';

import { useCompany } from '@/contexts/CompanyContext';
import { DashboardShell } from '@/components/shell/dashboard-shell';
import { QuickLinksGrid } from '@/app/(dashboard)/dashboard/components/QuickLinksGrid';
import { CompanyOverviewCard } from '@/app/(dashboard)/dashboard/components/CompanyOverviewCard';

export default function DashboardPage() {
  const { company, currentUserProfile, companyUsers } = useCompany();
  
  const isAdmin = company?.adminIds?.includes(currentUserProfile?.id || '') || false;

  return (
    <DashboardShell
      heading={`Welcome, ${currentUserProfile?.displayName || 'User'}!`}
      description={`${company?.name || 'Your company'} virtual office dashboard`}
    >
      <div className="flex-1 space-y-8">
        {/* Company Overview Card */}
        <CompanyOverviewCard 
          company={company || undefined}
          companyUsers={companyUsers}
          currentUserProfile={currentUserProfile || undefined}
        />
        
        {/* Quick Links Grid - now includes:
            - Working features (Floor Plan, Team, Settings)
            - Admin features (Invite Team, Company Settings) - shown only to admins
            - Coming Soon teasers (Messaging, Video, AI, Calendar, Analytics)
            - Investor Resources (Investor Deck, Product Vision)
        */}
        <QuickLinksGrid isAdmin={isAdmin} />
      </div>
    </DashboardShell>
  );
}
