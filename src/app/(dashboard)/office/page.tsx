// src/app/(dashboard)/layout.tsx
'use client';

import { useProtectedRoute } from '@/hooks/useProtectedRoute';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, loading } = useProtectedRoute();

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return null; // The useProtectedRoute hook will handle the redirect
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* We'll add the navigation bar here later */}
      <main className="p-4">{children}</main>
    </div>
  );
}