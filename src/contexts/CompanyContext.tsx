// src/contexts/CompanyContext.tsx
'use client';

import React, { createContext, useContext, useMemo } from 'react';
import { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import { useAuth } from './AuthContext';
import { Company, User, UserRole, Space } from '@/types/database';

// Import Query Hooks
import { useUserProfile } from '@/hooks/queries/useUserProfile';
import { useCompany as useCompanyQuery } from '@/hooks/queries/useCompany'; // Alias to avoid naming conflict
import { useCompanyUsers } from '@/hooks/queries/useCompanyUsers';
import { useSpaces } from '@/hooks/queries/useSpaces'; // Assuming this exists or will be created

// Import Mutation Hooks
import {
  useCreateCompanyMutation,
  useUpdateCompanyMutation,
} from '@/hooks/mutations/useCompanyMutations';
import {
  useUpdateUserProfileMutation,
  useUpdateUserRoleMutation,
  useRemoveUserFromCompanyMutation,
} from '@/hooks/mutations/useUserMutations';

// Define Query Keys (central place for keys related to company data)
// Exporting this allows hooks to import and use the same keys for invalidation etc.
export const companyQueryKeys = {
  all: ['companies'] as const,
  lists: () => [...companyQueryKeys.all, 'list'] as const,
  details: () => [...companyQueryKeys.all, 'detail'] as const,
  detail: (id: string | undefined) => [...companyQueryKeys.details(), id] as const,
  users: (companyId: string | undefined) => [...companyQueryKeys.detail(companyId), 'users'] as const,
  spaces: (companyId: string | undefined) => [...companyQueryKeys.detail(companyId), 'spaces'] as const,
  profile: (userId: string | undefined) => ['userProfile', userId] as const, // User profile key
};

// Define the shape of the context value
interface CompanyContextType {
  // Queries
  currentUserProfileQuery: UseQueryResult<User | null, Error>;
  companyQuery: UseQueryResult<Company | null, Error>;
  companyUsersQuery: UseQueryResult<User[], Error>;
  spacesQuery: UseQueryResult<Space[], Error>; // Assuming useSpaces hook returns this

  // Convenience accessors for data (might be null/undefined during loading/error)
  currentUserProfile: User | null | undefined;
  company: Company | null | undefined;
  companyUsers: User[] | undefined;
  spaces: Space[] | undefined;
  isAdmin: boolean; // Derived state: is the current user an admin of the company?

  // Mutations
  createCompanyMutation: UseMutationResult<Company, Error, { name: string; creatorAuthId: string; creatorDbId: string }>;
  updateCompanyMutation: UseMutationResult<void, Error, { companyId: string; data: Partial<Company> }>;
  // Update the variable type for updateUserProfileMutation to include userDbId
  updateUserProfileMutation: UseMutationResult<void, Error, { authUserId: string; userDbId: string; data: { status: User['status']; statusMessage?: User['statusMessage'] } }>;
  updateUserRoleMutation: UseMutationResult<void, Error, { userId: string; newRole: UserRole; companyId: string }>;
  removeUserFromCompanyMutation: UseMutationResult<void, Error, { userDbIdToRemove: string; companyId: string }>;

  // Derived Loading/Error States (optional, can use individual query states)
  isLoading: boolean;
  error: Error | null;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  // Correctly destructure 'loading' from useAuth and rename it to 'authIsLoading'
  const { user: authUser, loading: authIsLoading } = useAuth();

  // --- Queries ---

  // 1. Fetch User Profile (using Supabase Auth UID)
  const currentUserProfileQuery = useUserProfile(authUser?.id, !!authUser?.id); // Enable only when authUser.id is available
  const currentUserProfile = currentUserProfileQuery.data; // Convenience accessor

  // 2. Fetch Company Details (using companyId from user profile)
  const companyId = currentUserProfile?.companyId;
  const companyQuery = useCompanyQuery(companyId, !!companyId); // Enable only when companyId is available
  const company = companyQuery.data; // Convenience accessor

  // 3. Fetch Company Users (using companyId)
  const companyUsersQuery = useCompanyUsers(companyId, !!companyId); // Enable only when companyId is available
  const companyUsers = companyUsersQuery.data; // Convenience accessor

  // 4. Fetch Company Spaces (using companyId) - Assuming useSpaces hook exists
  const spacesQuery = useSpaces(companyId, !!companyId); // Enable only when companyId is available
  const spaces = spacesQuery.data; // Convenience accessor

  // --- Mutations ---

  const createCompanyMutation = useCreateCompanyMutation();
  const updateCompanyMutation = useUpdateCompanyMutation();
  const updateUserProfileMutation = useUpdateUserProfileMutation();
  const updateUserRoleMutation = useUpdateUserRoleMutation();
  const removeUserFromCompanyMutation = useRemoveUserFromCompanyMutation();

  // --- Derived State ---

  // Determine if the current user is an admin
  const isAdmin = useMemo(() => {
    if (!authUser?.id || !company?.adminIds) return false;
    return company.adminIds.includes(authUser.id);
  }, [authUser?.id, company?.adminIds]);

  // Aggregate loading state (consider if auth is loading or initial profile fetch)
  // Use the correctly named 'authIsLoading' variable
  const isLoading = useMemo(() => {
    return authIsLoading || // Auth must finish first
           currentUserProfileQuery.isLoading || // Profile must load
           (!!companyId && (companyQuery.isLoading || companyUsersQuery.isLoading || spacesQuery.isLoading)); // If companyId exists, wait for company data
  }, [authIsLoading, currentUserProfileQuery.isLoading, companyId, companyQuery.isLoading, companyUsersQuery.isLoading, spacesQuery.isLoading]);

  // Aggregate error state (prioritize profile error, then company errors)
  const error = useMemo(() => {
    return currentUserProfileQuery.error || companyQuery.error || companyUsersQuery.error || spacesQuery.error || null;
  }, [currentUserProfileQuery.error, companyQuery.error, companyUsersQuery.error, spacesQuery.error]);


  // --- Context Value ---

  const value = useMemo(() => ({
    // Queries
    currentUserProfileQuery,
    companyQuery,
    companyUsersQuery,
    spacesQuery,

    // Convenience accessors
    currentUserProfile,
    company,
    companyUsers,
    spaces,
    isAdmin,

    // Mutations
    createCompanyMutation,
    updateCompanyMutation,
    updateUserProfileMutation,
    updateUserRoleMutation,
    removeUserFromCompanyMutation,

    // Aggregated States
    isLoading,
    error,
  }), [
    currentUserProfileQuery, companyQuery, companyUsersQuery, spacesQuery, // Queries
    currentUserProfile, company, companyUsers, spaces, isAdmin, // Accessors & Derived
    createCompanyMutation, updateCompanyMutation, updateUserProfileMutation, // Mutations
    updateUserRoleMutation, removeUserFromCompanyMutation,
    isLoading, error // Aggregated states
  ]);

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

// Custom hook to use the CompanyContext
export const useCompany = () => {
  const context = useContext(CompanyContext);
  if (context === undefined) {
    throw new Error('useCompany must be used within a CompanyProvider');
  }
  return context;
};
