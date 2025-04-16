// src/hooks/mutations/useCompanyMutations.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { createCompany, updateCompany } from '@/lib/api';
import { Company, User, UserRole } from '@/types/database';
import { companyQueryKeys } from '@/contexts/CompanyContext'; // Assuming query keys are exported

// We need a way to update the user profile after company creation.
// This could be a separate mutation or handled within onSuccess.
// Let's define a helper function for the user update API call for now.
async function linkUserToCompany(userId: string, companyId: string): Promise<User> {
  console.log(`[CompanyMutation] Linking user ${userId} to company ${companyId}`);
  const response = await fetch(`/api/users/update?id=${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      companyId: companyId,
      role: 'admin' as UserRole,
    }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Failed to parse error response' }));
    console.error('[CompanyMutation] Failed to link user:', errorData);
    throw new Error(`Failed to link user to company: ${errorData.message || response.statusText}`);
  }
  const result = await response.json();
  if (!result.success || !result.user) {
     throw new Error('API response did not contain expected user data after linking.');
  }
  console.log('[CompanyMutation] User linked successfully:', result.user);
  return result.user as User;
}

/**
 * Mutation hook for creating a new company.
 * Handles creating the company and linking the creator as admin.
 */
export function useCreateCompanyMutation() {
  const queryClient = useQueryClient();
  const router = useRouter();

  // Expects { name: string, creatorAuthId: string, creatorDbId: string }
  // Returns the newly created Company object
  return useMutation<Company, Error, { name: string; creatorAuthId: string; creatorDbId: string }>({
    mutationFn: async ({ name, creatorAuthId, creatorDbId }) => {
      console.log(`[RQ Mutation] Creating company "${name}" for user ${creatorAuthId}`);
      // 1. Create the company row
      const newCompany = await createCompany(name, creatorAuthId, {}); // Pass creator's Auth ID

      // 2. Link the user profile (using their DB ID)
      // This step is critical and was the likely failure point before.
      await linkUserToCompany(creatorDbId, newCompany.id);

      return newCompany; // Return the created company object
    },
    onSuccess: (newCompany, variables) => {
      console.log(`[RQ Mutation] Company ${newCompany.id} created successfully.`);

      // Invalidate queries to refetch data
      // Invalidate the user profile query to get the updated companyId and role
      queryClient.invalidateQueries({ queryKey: companyQueryKeys.profile(variables.creatorAuthId) });

      // We could potentially set the company query data immediately if needed,
      // but invalidating the profile will trigger dependent queries anyway.
      // queryClient.setQueryData(companyQueryKeys.detail(newCompany.id), newCompany);

      // Invalidate users and spaces for the new company (though likely empty initially)
      queryClient.invalidateQueries({ queryKey: companyQueryKeys.users(newCompany.id) });
      queryClient.invalidateQueries({ queryKey: companyQueryKeys.spaces(newCompany.id) });

      // Navigate to dashboard after successful creation and linking
      // Use router.push for client-side navigation
      router.push('/dashboard');
    },
    onError: (error) => {
      console.error('[RQ Mutation] Error creating company:', error);
      // TODO: Add user-facing error handling (e.g., toast notification)
    },
  });
}

/**
 * Mutation hook for updating company details.
 */
export function useUpdateCompanyMutation() {
  const queryClient = useQueryClient();

  // Expects { companyId: string, data: Partial<Company> }
  return useMutation<void, Error, { companyId: string; data: Partial<Company> }>({
    mutationFn: async ({ companyId, data }) => {
      console.log(`[RQ Mutation] Updating company ${companyId}`);
      await updateCompany(companyId, data);
    },
    onSuccess: (_, variables) => {
      console.log(`[RQ Mutation] Company ${variables.companyId} updated.`);
      // Invalidate the specific company detail query
      queryClient.invalidateQueries({ queryKey: companyQueryKeys.detail(variables.companyId) });
      // If adminIds changed, might need to invalidate users query too, but let's keep it simple for now.
    },
    onError: (error, variables) => {
      console.error(`[RQ Mutation] Error updating company ${variables.companyId}:`, error);
      // TODO: Add user-facing error handling
    },
  });
}
