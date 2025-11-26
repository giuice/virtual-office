// src/app/(dashboard)/settings/page.tsx
'use client';

import { DashboardShell } from '@/components/shell/dashboard-shell';
import { EnhancedUserProfile } from '@/components/profile/EnhancedUserProfile';

export default function SettingsPage() {
  return (
    <DashboardShell
      heading="Settings"
      description="Manage your personal settings and preferences"
    >
      <div className="grid gap-8">
        <EnhancedUserProfile />
      </div>
    </DashboardShell>
  );
}