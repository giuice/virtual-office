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
  /** Allow the shell to expand to full width (default: false) */
  fullWidth?: boolean;
}

export function DashboardShell({
  children,
  heading,
  description,
  hideHeader = false,
  fullWidth = false
}: DashboardShellProps) {
  return (
    <div className="flex flex-col min-h-screen">
      {!hideHeader && <DashboardHeader heading={heading} description={description} />}
      <div className={`flex-1 space-y-4 p-8 pt-6 mx-auto w-full ${fullWidth ? 'max-w-none' : 'max-w-[1600px]'}`}>
        {children}
      </div>
    </div>
  );
}