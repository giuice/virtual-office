// src/app/(dashboard)/layout.tsx
'use client';

import { useProtectedRoute } from '@/hooks/useProtectedRoute';
import { SearchProvider } from '@/contexts/SearchContext';
import { SpaceRealtimeProvider } from '@/components/providers/space-realtime-provider';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Use the protected route hook with company check
  const { isAuthenticated, loading, isReady } = useProtectedRoute();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-center">
          <div className="h-8 w-32 bg-muted rounded mb-4 mx-auto"></div>
          <div className="h-4 w-48 bg-muted rounded mx-auto"></div>
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