// src/app/(dashboard)/settings/page.tsx
'use client';

import { DashboardShell } from '@/components/shell/dashboard-shell';
import { DashboardHeader } from '@/components/shell/dashboard-header';
import { UserProfile } from '@/components/dashboard/user-profile';

export default function SettingsPage() {
  return (
    <DashboardShell>
      <DashboardHeader
        heading="Settings"
        description="Manage your personal settings and preferences"
      />
      
      <div className="grid gap-8">
        <UserProfile />
      </div>
    </DashboardShell>
  );
}