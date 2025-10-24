// src/components/shell/dashboard-shell.tsx
'use client';

import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMessaging } from '@/contexts/messaging/MessagingContext';

interface DashboardShellProps {
  children: React.ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps) {
  const { forceOpenDrawerToList } = useMessaging();

  return (
    <div className="flex flex-col min-h-screen">
      {/* Floating messaging trigger button */}
      <div className="fixed bottom-4 right-4 z-50">
        <Button
          data-drawer-trigger
          onClick={forceOpenDrawerToList}
          size="icon"
          className="h-12 w-12 rounded-full shadow-lg"
          title="Open messaging"
        >
          <MessageSquare className="h-6 w-6" />
        </Button>
      </div>
      <div className="flex-1 space-y-4 p-8 pt-6">
        {children}
      </div>
    </div>
  );
}