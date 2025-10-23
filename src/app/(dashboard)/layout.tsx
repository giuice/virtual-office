// src/app/(dashboard)/layout.tsx
'use client';

import { useProtectedRoute } from '@/hooks/useProtectedRoute';
import { SearchProvider } from '@/contexts/SearchContext';
import { SpaceRealtimeProvider } from '@/components/providers/space-realtime-provider';
import { Loader2 } from 'lucide-react';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Use the protected route hook with company check
  const { isAuthenticated, loading, isReady } = useProtectedRoute();

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <div className="text-center text-sm text-muted-foreground">
          Restoring your workspace session...
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !isReady) {
    return null; // The useProtectedRoute hook will handle the redirect
  }

  return (
    <SearchProvider>
      <SpaceRealtimeProvider>
        <div className="min-h-screen bg-background">
          {children}
        </div>
      </SpaceRealtimeProvider>
    </SearchProvider>
  );
}
