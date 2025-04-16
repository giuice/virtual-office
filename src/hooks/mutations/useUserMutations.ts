// src/hooks/mutations/useUserMutations.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  updateUserStatus,
  updateUserRole as apiUpdateUserRole,
  removeUserFromCompany as apiRemoveUserFromCompany,
  updateCompany, // Needed for updating adminIds when role changes/user removed
} from '@/lib/api';
import { User, UserRole, Company } from '@/types/database';
import { companyQueryKeys } from '@/contexts/CompanyContext'; // Assuming query keys are exported

type UpdateUserProfilePayload = { status?: User['status']; statusMessage?: User['statusMessage'] };
type UpdateUserRolePayload = { userId: string; newRole: UserRole; companyId: string; // Need companyId to potentially update adminIds
};
type RemoveUserPayload = { userDbIdToRemove: string; companyId: string };

/**
 * Mutation hook for updating user profile details (like status or status message).
 * Requires both the Supabase Auth ID (for cache keys) and Database User ID (for API call).
 */
export function useUpdateUserProfileMutation() {
  const queryClient = useQueryClient();

  // Expects { authUserId: string, data: UpdateUserProfilePayload }
  // Note: The underlying `updateUserStatus` API requires the `status` field.
  // Define a more specific type for the mutation variables where 'status' is required.
  // We need BOTH authUserId (for cache keys) and userDbId (for API call).
  type UpdateProfileMutationVariables = {
    authUserId: string; // Needed for profile query key
    userDbId: string;   // Needed for the API call
    data: UpdateUserProfilePayload & { status: User['status'] }; // Make status required
  };

  return useMutation<void, Error, UpdateProfileMutationVariables>({
    // Use userDbId for the API call, keep authUserId for cache operations
    mutationFn: async ({ userDbId, data }) => { // Destructure userDbId here
      console.log(`[RQ Mutation] Updating profile for DB user ${userDbId} with status ${data.status}`);

      // Type safety: data.status is now guaranteed by UpdateProfileMutationVariables type.
      // Pass the database ID to the API function
      await updateUserStatus(userDbId, data.status, data.statusMessage); // Use userDbId
    },
    // onMutate uses the same UpdateProfileMutationVariables type
    onMutate: async ({ authUserId, data }) => {
        // Optimistic update
        await queryClient.cancelQueries({ queryKey: companyQueryKeys.profile(authUserId) });
        const previousProfile = queryClient.getQueryData<User>(companyQueryKeys.profile(authUserId));
        if (previousProfile) {
            queryClient.setQueryData<User>(companyQueryKeys.profile(authUserId), {
                ...previousProfile,
                ...data,
            });
        }
        // Also update the user within the company users list if applicable
        const companyId = previousProfile?.companyId;
        if (companyId) {
            await queryClient.cancelQueries({ queryKey: companyQueryKeys.users(companyId) });
            const previousUsers = queryClient.getQueryData<User[]>(companyQueryKeys.users(companyId));
            if (previousUsers) {
                queryClient.setQueryData<User[]>(companyQueryKeys.users(companyId),
                    previousUsers.map(u => u.supabase_uid === authUserId ? { ...u, ...data } : u)
                );
            }
            return { previousProfile, previousUsers, companyId }; // Return context for rollback
        }

        return { previousProfile }; // Return context for rollback
    },
    onError: (err, variables, context: any) => {
        console.error(`[RQ Mutation] Error updating profile for ${variables.authUserId}:`, err);
        // Rollback optimistic update
        if (context?.previousProfile) {
            queryClient.setQueryData(companyQueryKeys.profile(variables.authUserId), context.previousProfile);
        }
        if (context?.previousUsers && context?.companyId) {
            queryClient.setQueryData(companyQueryKeys.users(context.companyId), context.previousUsers);
        }
        // TODO: Add user-facing error handling
    },
    onSettled: (data, error, variables) => {
        // Invalidate profile and potentially company users list to ensure freshness
        queryClient.invalidateQueries({ queryKey: companyQueryKeys.profile(variables.authUserId) });
        const profile = queryClient.getQueryData<User>(companyQueryKeys.profile(variables.authUserId));
        if (profile?.companyId) {
            queryClient.invalidateQueries({ queryKey: companyQueryKeys.users(profile.companyId) });
        }
    },
  });
}

/**
 * Mutation hook for updating a user's role within a company.
 * Uses the target user's Database ID for identification.
 */
export function useUpdateUserRoleMutation() {
  const queryClient = useQueryClient();

  // Expects UpdateUserRolePayload: { userId: string; newRole: UserRole; companyId: string }
  return useMutation<void, Error, UpdateUserRolePayload>({
    mutationFn: async ({ userId, newRole, companyId }) => {
      console.log(`[RQ Mutation] Updating role for user ${userId} to ${newRole}`);
      // 1. Update the user's role in the users table
      await apiUpdateUserRole(userId, newRole); // Uses DB ID

      // 2. Update the company's adminIds if necessary
      // Need the user's Supabase UID for this - fetch it or get from cache
      const companyUsers = queryClient.getQueryData<User[]>(companyQueryKeys.users(companyId));
      const targetUser = companyUsers?.find(u => u.id === userId);
      const targetUserSupabaseUid = targetUser?.supabase_uid;

      if (targetUserSupabaseUid) {
          const companyData = queryClient.getQueryData<Company>(companyQueryKeys.detail(companyId));
          if (companyData) {
              let updatedAdminIds = [...companyData.adminIds];
              const isAdmin = companyData.adminIds.includes(targetUserSupabaseUid);
              let needsCompanyUpdate = false;

              if (newRole === 'admin' && !isAdmin) {
                  updatedAdminIds.push(targetUserSupabaseUid);
                  needsCompanyUpdate = true;
              } else if (newRole !== 'admin' && isAdmin) {
                  updatedAdminIds = updatedAdminIds.filter(id => id !== targetUserSupabaseUid);
                  needsCompanyUpdate = true;
              }

              if (needsCompanyUpdate) {
                  console.log(`[RQ Mutation] Updating company ${companyId} adminIds.`);
                  await updateCompany(companyId, { adminIds: updatedAdminIds });
              }
          }
      } else {
          console.warn(`[RQ Mutation] Could not find Supabase UID for user ${userId} to update adminIds.`);
      }
    },
    onSuccess: (_, variables) => {
      console.log(`[RQ Mutation] Role updated for user ${variables.userId}.`);
      // Invalidate company users list and company details (for adminIds)
      queryClient.invalidateQueries({ queryKey: companyQueryKeys.users(variables.companyId) });
      queryClient.invalidateQueries({ queryKey: companyQueryKeys.detail(variables.companyId) });
      // Also invalidate the specific user's profile if we have their auth ID? Maybe not necessary here.
    },
    onError: (error, variables) => {
      console.error(`[RQ Mutation] Error updating role for user ${variables.userId}:`, error);
      // TODO: Add user-facing error handling
    },
  });
}

/**
 * Mutation hook for removing a user from a company.
 * Uses the target user's Database ID for identification.
 */
export function useRemoveUserFromCompanyMutation() {
  const queryClient = useQueryClient();

  // Expects RemoveUserPayload: { userDbIdToRemove: string; companyId: string }
  return useMutation<void, Error, RemoveUserPayload>({
    mutationFn: async ({ userDbIdToRemove, companyId }) => {
      console.log(`[RQ Mutation] Removing user ${userDbIdToRemove} from company ${companyId}`);
      // 1. Call the API to update the user's companyId to null (or delete relation)
      await apiRemoveUserFromCompany(userDbIdToRemove, companyId); // Uses DB ID

      // 2. Update the company's adminIds if the removed user was an admin
      const companyUsers = queryClient.getQueryData<User[]>(companyQueryKeys.users(companyId));
      const targetUser = companyUsers?.find(u => u.id === userDbIdToRemove);
      const targetUserSupabaseUid = targetUser?.supabase_uid;

      if (targetUserSupabaseUid) {
          const companyData = queryClient.getQueryData<Company>(companyQueryKeys.detail(companyId));
          if (companyData && companyData.adminIds.includes(targetUserSupabaseUid)) {
              const updatedAdminIds = companyData.adminIds.filter(id => id !== targetUserSupabaseUid);
              console.log(`[RQ Mutation] Updating company ${companyId} adminIds after removing admin.`);
              await updateCompany(companyId, { adminIds: updatedAdminIds });
          }
      }
    },
    onSuccess: (_, variables) => {
      console.log(`[RQ Mutation] User ${variables.userDbIdToRemove} removed.`);
      // Invalidate company users list and company details (for adminIds)
      queryClient.invalidateQueries({ queryKey: companyQueryKeys.users(variables.companyId) });
      queryClient.invalidateQueries({ queryKey: companyQueryKeys.detail(variables.companyId) });
      // If we knew the removed user's auth ID, we could invalidate their profile too
    },
    onError: (error, variables) => {
      console.error(`[RQ Mutation] Error removing user ${variables.userDbIdToRemove}:`, error);
      // TODO: Add user-facing error handling
    },
  });
}
