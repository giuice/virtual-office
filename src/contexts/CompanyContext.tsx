// src/contexts/CompanyContext.tsx
'use client';

import { useReducerState } from '@/hooks/useReducerState';
import { createContext, use, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { Company, User, UserRole, Space } from '@/types/database';
import { extractGoogleAvatarUrl } from '@/lib/avatar-utils';
// Using API client instead of direct DynamoDB access
import {
  getUserById,
  updateUserStatus,
  updateUserRole as apiUpdateUserRole,
  removeUserFromCompany as apiRemoveUserFromCompany,
  createCompany,
  getCompany,
  updateCompany,
  getUsersByCompany,
  getSpacesByCompany,
} from '@/lib/api';
import { invalidateInFlightProfileSyncs, syncUserProfileOnce } from '@/lib/bootstrap/profile-sync';

interface CompanyContextType { company: Company | null;
  companyUsers: User[];
  spaces: Space[];
  currentUserProfile: User | null;
  isLoading: boolean;
  error: string | null;
  createNewCompany: (name: string) => Promise<string>;
  updateCompanyDetails: (data: Partial<Company>) => Promise<void>;
  updateUserProfile: (data: Partial<User>) => Promise<void>;
  updateUserRole: (userId: string, newRole: UserRole) => Promise<void>;
  removeUserFromCompany: (userId: string) => Promise<void>;
  loadCompanyData: (userId: string) => Promise<void>;
  refreshCompanyData: () => Promise<void>; }

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

function useCompanyProviderValue(): CompanyContextType { const { user, isAuthReady } = useAuth();
  const [company, updateCompanyState] = useReducerState<Company | null>(null);
  const [companyUsers, updateCompanyUsers] = useReducerState<User[]>([]);
  const [spaces, updateSpaces] = useReducerState<Space[]>([]);
  const [currentUserProfile, updateCurrentUserProfile] = useReducerState<User | null>(null);
  const [dataOwnerUid, updateDataOwnerUid] = useReducerState<string | null>(null);
  const [isLoading, updateIsLoading] = useReducerState<boolean>(true);
  const [error, updateError] = useReducerState<string | null>(null);
  const userRef = useRef(user);
  userRef.current = user;
  const authUserIdRef = useRef<string | null>(null);
  const authGenerationRef = useRef(0);
  const inFlightLoadsRef = useRef(
    new Map<string, { generation: number; promise: Promise<void> }>()
  );

  // Load user profile, company, users, and spaces
  const loadCompanyData = useCallback((authUserId: string): Promise<void> => {
    const authGeneration = authGenerationRef.current;
    const authUser = userRef.current;
    // Only reuse an in-flight load from the CURRENT auth generation. A load
    // started before a logout/re-login carries a stale generation: every one
    // of its state commits is skipped by isCurrentLoad(), so handing it back
    // to the new session would leave the bootstrap permanently stuck.
    const existingLoad = inFlightLoadsRef.current.get(authUserId);
    if (existingLoad && existingLoad.generation === authGeneration) {
      return existingLoad.promise;
    }

    const isCurrentLoad = () => (
      authGenerationRef.current === authGeneration &&
      authUserIdRef.current === authUserId &&
      userRef.current?.id === authUserId
    );

    let load: Promise<void>;
    load = Promise.resolve().then(async () => { try {
      updateIsLoading(true);
      updateError(null);

      console.log(`[CompanyContext] Starting data load for Supabase UID: ${authUserId}`);

      // Ensure the user profile exists using syncUserProfileOnce
      if (!authUser) { console.error("[CompanyContext] loadCompanyData called but Supabase auth user object is null.");
        throw new Error("Authenticated user data is unexpectedly null during data load."); }

      let userProfile: User | null = null;
      try { // Try to extract Google avatar (if applicable) to persist in DB for cross-user visibility
        const googleAvatarUrl = (() => {
          try {
            return extractGoogleAvatarUrl(authUser.user_metadata) || undefined; } catch {
            return undefined;
          }
        })();

        // Call syncUserProfileOnce to get or create the profile
        userProfile = await syncUserProfileOnce({ supabase_uid: authUserId, // Use correct parameter name
          email: authUser.email || '', displayName: authUser.user_metadata?.name || authUser.email || 'New User', googleAvatarUrl });
        if (!isCurrentLoad()) {
          return;
        }
        console.log(`[CompanyContext] User profile synced/retrieved for ${authUserId}, DB ID: ${ userProfile.id }`);
        updateCurrentUserProfile(userProfile);
        updateDataOwnerUid(authUserId);
      } catch (syncError) { console.error('[CompanyContext] Error syncing user profile:', syncError);
         // Attempt to fetch one last time in case sync failed but user exists
         userProfile = await getUserById(authUserId);
         if (!isCurrentLoad()) {
           return;
         }
         if (!userProfile) {
            updateError(syncError instanceof Error ? syncError.message : 'Failed to load user profile');
            throw new Error(`Failed to sync or retrieve user profile for Supabase UID ${authUserId }`);
         }
         console.warn(`[CompanyContext] Synced failed, but retrieved existing profile ${ userProfile.id } for ${authUserId}.`);
         updateCurrentUserProfile(userProfile);
         updateDataOwnerUid(authUserId);
      }

      // Load company data if the user is associated with one
      if (userProfile?.companyId) { console.log(`[CompanyContext] User ${userProfile.id } belongs to company ${ userProfile.companyId }, loading company data...`);
        const companyData = await getCompany(userProfile.companyId);
        if (!isCurrentLoad()) {
          return;
        }
        updateCompanyState(companyData);
        if (companyData) { const users = await getUsersByCompany(userProfile.companyId);
            if (!isCurrentLoad()) {
              return;
            }
            updateCompanyUsers(users);
            const fetchedSpaces = await getSpacesByCompany(userProfile.companyId);
            if (!isCurrentLoad()) {
              return;
            }
            updateSpaces(fetchedSpaces);
            console.log(`[CompanyContext] Loaded ${users.length } users and ${fetchedSpaces.length} spaces for company ${ userProfile.companyId }`);
        } else { console.warn(`[CompanyContext] User ${userProfile.id } has companyId ${ userProfile.companyId }, but company data could not be fetched.`);
            // Reset company specific data if company fetch fails
            updateCompanyState(null);
            updateCompanyUsers([]);
            updateSpaces([]);
        }
      } else { console.log(`[CompanyContext] User ${userProfile.id } (Supabase UID: ${authUserId}) has no company association.`);
        updateCompanyState(null);
        updateCompanyUsers([]);
        updateSpaces([]);
        updateDataOwnerUid(authUserId);
      }
    } catch (err) {
      console.error('[CompanyContext] Error loading company data:', err);
      if (!isCurrentLoad()) {
        return;
      }
      updateError(err instanceof Error ? err.message : 'Error loading data');
      // Reset all state on error
      updateCompanyState(null);
      updateCurrentUserProfile(null);
      updateCompanyUsers([]);
      updateSpaces([]);
    } finally {
      if (isCurrentLoad()) {
        updateIsLoading(false);
      }
      console.log("[CompanyContext] Data loading finished.");
      if (inFlightLoadsRef.current.get(authUserId)?.promise === load) {
        inFlightLoadsRef.current.delete(authUserId);
      }
    } });
    inFlightLoadsRef.current.set(authUserId, { generation: authGeneration, promise: load });
    return load;
  }, [updateIsLoading, updateError, updateCurrentUserProfile, updateDataOwnerUid, updateCompanyState, updateCompanyUsers, updateSpaces]);
  // Refresh company data for the current user
  const refreshCompanyData = useCallback(async () => { const authUserId = userRef.current?.id;
    if (authUserId) {
      await loadCompanyData(authUserId); }
  }, [loadCompanyData]);

  // Effect to trigger loading when auth user changes
  useEffect(() => { const authUserId = user?.id;

    if (authUserIdRef.current !== (authUserId || null)) {
      authUserIdRef.current = authUserId || null;
      authGenerationRef.current += 1;
      // A new auth identity must never await a sync request started under the
      // previous one (a stalled request would block the fresh bootstrap).
      invalidateInFlightProfileSyncs();
      updateCompanyState(null);
      updateCurrentUserProfile(null);
      updateCompanyUsers([]);
      updateSpaces([]);
      updateDataOwnerUid(null);
      updateIsLoading(true);
      updateError(null);
    }

    if (!isAuthReady) {
      updateIsLoading(true);
      return; }

    if (authUserId) {
      void loadCompanyData(authUserId);
      return;
    }

    console.log("[CompanyContext] User logged out or not available, resetting state.");
    updateCompanyState(null);
    updateCurrentUserProfile(null);
    updateCompanyUsers([]);
    updateSpaces([]);
    updateDataOwnerUid(null);
    updateIsLoading(false);
    updateError(null);
  }, [isAuthReady, loadCompanyData, user?.id, updateIsLoading, updateCompanyState, updateCurrentUserProfile, updateCompanyUsers, updateSpaces, updateDataOwnerUid, updateError]); // Depend on auth readiness and the memoized load function

  // Create a new company
  const createNewCompany = async (name: string): Promise<string> => { const mutationGeneration = authGenerationRef.current;
    const authUser = userRef.current;
    if (!authUser?.id || !authUser.email) { // Ensure user, id, and email are available
      throw new Error('User must be authenticated with valid details to create a company'); }
    const authUserId = authUser.id; // Supabase Auth UID
    const isCurrentMutation = () => (
      authGenerationRef.current === mutationGeneration &&
      authUserIdRef.current === authUserId &&
      userRef.current?.id === authUserId
    );
    const assertCurrentMutation = () => {
      if (!isCurrentMutation()) {
        throw new Error('Authentication changed during company creation');
      }
    };

    try { updateIsLoading(true);
      updateError(null);

      // 1. Ensure user profile exists (get or create)
      const googleAvatarUrl = (() => {
        try {
          return extractGoogleAvatarUrl(authUser.user_metadata) || undefined; } catch {
          return undefined;
        }
      })();

      let userProfile = await syncUserProfileOnce({ supabase_uid: authUserId, email: authUser.email, displayName: authUser.user_metadata?.name || authUser.email || 'Admin User', googleAvatarUrl });
      assertCurrentMutation();
      updateCurrentUserProfile(userProfile); // Set profile state immediately
      updateDataOwnerUid(authUserId);

      // 2. Check if user already belongs to a company
      if (userProfile.companyId) { console.log(`[CompanyContext] User ${userProfile.id } already belongs to company ${ userProfile.companyId }. Reloading data.`);
        // Reload data to ensure consistency, though ideally state is already correct
        await loadCompanyData(authUserId);
        assertCurrentMutation();
        return userProfile.companyId;
      }

      // 3. Create the new company
      const settings = { /* Define settings if needed */ };
      console.log(`[CompanyContext] Creating new company "${name}" for Supabase user ${authUserId}`);
      // Pass Supabase Auth UID as creator
      const newCompany = await createCompany(name, authUserId, settings);
      assertCurrentMutation();
      const companyId = newCompany.id;
      console.log(`[CompanyContext] New company created with ID: ${companyId}`);

      // 4. Update the user profile to link company and set role to admin
      console.log(`[CompanyContext] Updating user profile ${ userProfile.id } with company ${companyId} and admin role.`);
      try { // Use the user's DB ID (userProfile.id) for the update API call
        // Assuming /api/users/update identifies user by DB ID in query param 'id'
        const response = await fetch(`/api/users/update?id=${userProfile.id }`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId: companyId,
            role: 'admin',
            // Optionally update status if needed, e.g., ensure 'online'
            // status: 'online'
          }),
        });
        assertCurrentMutation();
        if (!response.ok) { const errorData = await response.json();
          assertCurrentMutation();
          throw new Error(`Failed to update user profile: ${errorData.message || response.statusText }`);
        }
        const updatedProfileData = await response.json(); // Assuming API returns updated user
        assertCurrentMutation();

        // Update local state immediately with the fully updated profile
        userProfile = { ...userProfile, ...updatedProfileData };
        updateCurrentUserProfile(userProfile);
        updateDataOwnerUid(authUserId);
        console.log(`[CompanyContext] User profile ${ userProfile.id } updated successfully.`);

      } catch (updateError) { console.error('[CompanyContext] Error updating user profile after company creation:', updateError);
        assertCurrentMutation();
        // Consider rollback or cleanup logic for the created company if user update fails critically
        throw new Error('Failed to link user profile to the new company'); }

      // 5. Reload all company data after successful creation and linking
      console.log('[CompanyContext] Reloading company data after creation/user linking');
      await loadCompanyData(authUserId); // Use Supabase Auth UID
      assertCurrentMutation();

      // 6. Navigate to dashboard
      // Consider using Next.js router for better integration:
      // import { useRouter } from 'next/navigation';
      // const router = useRouter(); router.push('/dashboard');
      window.location.href = '/dashboard'; // Keep existing navigation for now

      return companyId;
    } catch (err) {
      console.error('[CompanyContext] Error in createNewCompany process:', err);
      if (!isCurrentMutation()) {
        throw new Error('Authentication changed during company creation');
      }
      updateError(err instanceof Error ? err.message : 'Error creating company');
      throw err; // Re-throw error for calling component
    } finally {
      if (isCurrentMutation()) {
        updateIsLoading(false);
      }
    }
  };
  // Update company details
  const updateCompanyDetails = async (data: Partial<Company>): Promise<void> => { if (!company || !currentUserProfile?.id) {
      throw new Error('Company and authenticated user required'); }

    // Check if user is admin (company.adminIds stores database user IDs, not Supabase Auth UIDs)
    if (!company.adminIds.includes(currentUserProfile.id)) {
      throw new Error('Only admins can update company details');
    }

    try {
      updateIsLoading(true);
      updateError(null);
      const mergedData: Partial<Company> = {
        ...data,
        settings: data.settings !== undefined
          ? { ...company.settings, ...data.settings }
          : undefined,
      };

      await updateCompany(company.id, mergedData);
      // Optimistically update local state
      updateCompanyState(prev => {
        if (!prev) {
          return null;
        }

        return {
          ...prev,
          ...mergedData,
          settings: mergedData.settings !== undefined
            ? { ...prev.settings, ...mergedData.settings }
            : prev.settings,
        };
      });
      console.log(`[CompanyContext] Company details updated for ${company.id}`);
    } catch (err) {
      console.error('[CompanyContext] Error updating company:', err);
      updateError(err instanceof Error ? err.message : 'Error updating company');
      throw err;
    } finally {
      updateIsLoading(false);
    }
  };


  // Update user profile (status, status message etc.)
  const updateUserProfile = async (data: Partial<User>): Promise<void> => { // user.id is Supabase Auth UID
    // currentUserProfile.id is the DB User ID
    if (!user?.id || !currentUserProfile?.id) { // Check both IDs
      throw new Error('User must be authenticated with a profile'); }

    try { updateIsLoading(true);
      updateError(null);

      // Call API to update user status/statusMessage using Supabase Auth UID
      // Assuming updateUserStatus expects Supabase Auth UID
      await updateUserStatus(
        currentUserProfile.id,
        data.status || currentUserProfile.status, data.statusMessage
      );

      // Optimistically update local state
      const updatedProfile = { ...currentUserProfile, ...data };
      updateCurrentUserProfile(updatedProfile);

      // Update user in the company users list using the DB User ID
      updateCompanyUsers(prevUsers =>
        prevUsers.map(u =>
          u.id === currentUserProfile.id ? updatedProfile : u // Match by DB ID
        )
      );
      console.log(`[CompanyContext] User profile updated for ${currentUserProfile.id}`);

    } catch (err) { console.error('[CompanyContext] Error updating user profile:', err);
      updateError(err instanceof Error ? err.message : 'Error updating user profile');
      // Optionally revert optimistic updates here
      throw err; } finally {
      updateIsLoading(false);
    }
  };

  // Update user role
  const updateUserRole = async (userDbIdToUpdate: string, newRole: UserRole): Promise<void> => { // userDbIdToUpdate is the DB ID of the user whose role is being changed
    // currentUserProfile.id is the DB ID of the *current* admin performing the action
    if (!user?.id || !company || !currentUserProfile?.id) {
      throw new Error('Admin user must be authenticated with a company profile'); }

    // Check if the *current* user is admin (company.adminIds stores database user IDs)
    if (!company.adminIds.includes(currentUserProfile.id)) { throw new Error('Only admins can update user roles'); }

    // Optional: Prevent admin from changing their own role via this function
    // if (userDbIdToUpdate === currentUserProfile.id && newRole !== 'admin') {
    //   throw new Error("Admins cannot demote themselves using this function.");
    // }

    try { updateIsLoading(true);
      updateError(null);

      // Use API client to update user role, passing the DB User ID
      await apiUpdateUserRole(userDbIdToUpdate, newRole); // api.ts expects DB ID

      // Find the target user in local state to get their DB ID for adminIds update
      const targetUser = companyUsers.find(u => u.id === userDbIdToUpdate);
      if (!targetUser) {
        console.warn(`[CompanyContext] Could not find user ${userDbIdToUpdate } in local state to update adminIds.`);
        // Consider reloading users or handling this case more robustly
      } else {
        const targetUserDbId = targetUser.id;
        let updatedAdminIds = [...company.adminIds];
        const isAdmin = company.adminIds.includes(targetUserDbId);

        let needsCompanyUpdate = false;
        if (newRole === 'admin' && !isAdmin) {
            updatedAdminIds.push(targetUserDbId);
            needsCompanyUpdate = true;
        } else if (newRole !== 'admin' && isAdmin) {
            updatedAdminIds = updatedAdminIds.filter(id => id !== targetUserDbId);
            needsCompanyUpdate = true;
        }

        if (needsCompanyUpdate) {
            await updateCompany(company.id, { adminIds: updatedAdminIds });
            // Update local company state optimistically
            updateCompanyState(prev => prev ? { ...prev, adminIds: updatedAdminIds } : null);
            console.log(`[CompanyContext] Company adminIds updated for user ${targetUserDbId}.`);
        }
      }

      // Update user role in local state (companyUsers) using DB User ID
      updateCompanyUsers(prevUsers =>
        prevUsers.map(u =>
          u.id === userDbIdToUpdate ? { ...u, role: newRole } : u
        )
      );
      console.log(`[CompanyContext] User role updated for ${ userDbIdToUpdate } to ${newRole}.`);

    } catch (err) { console.error('[CompanyContext] Error updating user role:', err);
      updateError(err instanceof Error ? err.message : 'Error updating user role');
      throw err; } finally {
      updateIsLoading(false);
    }
  };

  // Remove user from company
  const removeUserFromCompany = async (userDbIdToRemove: string): Promise<void> => { // userDbIdToRemove is the DB ID of the user being removed
    // currentUserProfile.id is the DB ID of the *current* admin performing the action
    if (!user?.id || !company || !currentUserProfile?.id) {
      throw new Error('Admin user must be authenticated with a company profile'); }

    // Check if the *current* user is admin (company.adminIds stores database user IDs)
    if (!company.adminIds.includes(currentUserProfile.id)) { throw new Error('Only admins can remove users'); }

    // Find the user being removed to check if they are the current user
    const userToRemoveProfile = companyUsers.find(u => u.id === userDbIdToRemove);

    // Prevent removing yourself (check against DB ID)
    if (userDbIdToRemove === currentUserProfile.id) {
      throw new Error('You cannot remove yourself from the company using this function.');
    }

    try { updateIsLoading(true);
      updateError(null);

      // Use API client to remove user from company, passing the DB User ID
      await apiRemoveUserFromCompany(userDbIdToRemove, company.id); // api.ts expects DB ID

      // If removed user was an admin, update company adminIds (using their DB ID)
      const removedUserDbId = userToRemoveProfile?.id;
      if (removedUserDbId && company.adminIds.includes(removedUserDbId)) {
        const updatedAdminIds = company.adminIds.filter(id => id !== removedUserDbId);
        await updateCompany(company.id, { adminIds: updatedAdminIds });
        // Update local company state optimistically
        updateCompanyState(prev => prev ? { ...prev, adminIds: updatedAdminIds } : null);
        console.log(`[CompanyContext] Company adminIds updated after removing admin ${removedUserDbId}.`);
      }

      // Remove user from local state using DB User ID
      updateCompanyUsers(prevUsers => prevUsers.filter(u => u.id !== userDbIdToRemove));
      console.log(`[CompanyContext] User ${ userDbIdToRemove } removed from company ${company.id}.`);

    } catch (err) { console.error('[CompanyContext] Error removing user from company:', err);
      updateError(err instanceof Error ? err.message : 'Error removing user from company');
      throw err; } finally {
      updateIsLoading(false);
    }
  };

  const currentAuthUserId = user?.id ?? null;
  const isIdentityTransitionPending = authUserIdRef.current !== currentAuthUserId;
  const ownedByCurrentUser = currentAuthUserId !== null && dataOwnerUid === currentAuthUserId;
  const shouldMaskOwnedData =
    isIdentityTransitionPending || (dataOwnerUid !== null && !ownedByCurrentUser);

  const value = {
    company: shouldMaskOwnedData ? null : company,
    companyUsers: shouldMaskOwnedData ? [] : companyUsers,
    spaces: shouldMaskOwnedData ? [] : spaces,
    currentUserProfile: shouldMaskOwnedData ? null : currentUserProfile,
    isLoading: isLoading || (currentAuthUserId !== null && shouldMaskOwnedData),
    error: shouldMaskOwnedData ? null : error,
    createNewCompany,
    updateCompanyDetails,
    updateUserProfile,
    updateUserRole,
    removeUserFromCompany,
    loadCompanyData,
    refreshCompanyData,
  };

  return value;
}

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const value = useCompanyProviderValue();

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export const useCompany = () => { const context = use(CompanyContext);
  if (context === undefined) {
    throw new Error('useCompany must be used within a CompanyProvider'); }
  return context;
};
