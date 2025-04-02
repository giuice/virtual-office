// src/hooks/useProtectedRoute.ts
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/contexts/CompanyContext';

/**
 * A hook to protect routes that require authentication and company association
 * @param requireCompany If true, redirects to company creation if user doesn't have a company
 */
export const useProtectedRoute = (requireCompany: boolean = true) => {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { company, isLoading: companyLoading, currentUserProfile } = useCompany();
  const [isReady, setIsReady] = useState(false);
  const [redirectAttempted, setRedirectAttempted] = useState(false);

  useEffect(() => {
    // Skip checks during loading to avoid flicker
    if (authLoading || (requireCompany && companyLoading)) {
      return;
    }

    // If no user is authenticated, redirect to login
    if (!user) {
      router.push('/login');
      return;
    }

    // If we've already tried redirecting once, don't try again
    // This prevents infinite redirect loops when API calls fail
    if (redirectAttempted) {
      setIsReady(true);
      return;
    }

    // If API calls are failing but we have a user, still allow access to dashboard
    if (user && !currentUserProfile && !companyLoading) {
      console.warn('API may be failing but user is authenticated - allowing access');
      setIsReady(true);
      return;
    }

    // Debug logging to identify the issue
    console.log('useProtectedRoute check:', {
      requireCompany,
      hasCompanyId: !!currentUserProfile?.companyId,
      currentUserProfile,
      companyLoading,
      redirectAttempted
    });

    // If company is required but user doesn't have one
    if (requireCompany && !currentUserProfile?.companyId && !companyLoading && !redirectAttempted) {
      console.log('Redirecting from useProtectedRoute to create-company...');
      setRedirectAttempted(true); // Prevent multiple redirects
      router.push('/create-company');
      return;
    }

    setIsReady(true);
  }, [authLoading, companyLoading, user, currentUserProfile, router, requireCompany, redirectAttempted]);

  return {
    isAuthenticated: !!user,
    isReady,
    loading: authLoading || companyLoading,
    user,
    company,
    userProfile: currentUserProfile,
  };
};