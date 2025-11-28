// src/components/shell/dashboard-shell.tsx
'use client';

import { DashboardHeader } from './dashboard-header';

interface DashboardShellProps {
  children: React.ReactNode;
  /** Optional heading for the header */
  heading?: string;
  /** Optional description for the header */
  description?: string;
  /** Hide the header entirely (default: false) */
  hideHeader?: boolean;
}

export function DashboardShell({
  children,
  heading,
  description,
  hideHeader = false
}: DashboardShellProps) {
  return (
    <div className="flex flex-col min-h-screen">
      {!hideHeader && <DashboardHeader heading={heading} description={description} />}
      <div className="flex-1 space-y-4 p-8 pt-6 max-w-[1600px] mx-auto w-full">
        {children}
      </div>
    </div>
  );
}