// src/hooks/useProtectedRoute.ts
'use client';

import { redirect } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/contexts/CompanyContext';

/**
 * A hook to protect routes that require authentication and company association
 * @param requireCompany If true, redirects to company creation if user doesn't have a company
 */
export const useProtectedRoute = (requireCompany: boolean = true) => {
  const { user, loading: authLoading, isAuthReady } = useAuth();
  const { company, isLoading: companyLoading, currentUserProfile } = useCompany();
  const loading = authLoading || !isAuthReady || (requireCompany && companyLoading);
  const hasCompany = Boolean(currentUserProfile?.companyId);
  const canAllowWithoutProfile = Boolean(user && !currentUserProfile && !companyLoading);
  const isReady = Boolean(user && !loading && (!requireCompany || hasCompany || canAllowWithoutProfile));

  if (!loading && !user) {
    redirect('/login');
  }

  if (!loading && requireCompany && user && currentUserProfile && !currentUserProfile.companyId && !companyLoading) {
    redirect('/create-company');
  }

  return {
    isAuthenticated: !!user,
    isReady,
    loading,
    user,
    company,
    userProfile: currentUserProfile,
  };
};
