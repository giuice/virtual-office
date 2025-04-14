// src/app/(dashboard)/settings/page.tsx
'use client';

import { DashboardShell } from '@/components/shell/dashboard-shell';
import { DashboardHeader } from '@/components/shell/dashboard-header';
import { UserProfile } from '@/components/dashboard/user-profile';
import { EnhancedUserProfile } from '@/components/profile/EnhancedUserProfile';

export default function SettingsPage() {  // Toggle this to use either the original or enhanced profile component
  const useEnhancedProfile = true;
  
  return (
    <DashboardShell>
      <DashboardHeader
        heading="Settings"
        description="Manage your personal settings and preferences"
      />
      
      <div className="grid gap-8">
        {useEnhancedProfile ? (
          <EnhancedUserProfile />
        ) : (
          <UserProfile />
        )}
      </div>
    </DashboardShell>
  );
}