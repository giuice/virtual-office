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

    // If company is required but user doesn't have one
    if (requireCompany && !company && !companyLoading) {
      router.push('/create-company');
      return;
    }

    setIsReady(true);
  }, [authLoading, companyLoading, user, company, router, requireCompany]);

  return {
    isAuthenticated: !!user,
    isReady,
    loading: authLoading || companyLoading,
    user,
    company,
    userProfile: currentUserProfile,
  };
};