// src/contexts/CompanyContext.tsx
'use client';

import { useReducerState } from '@/hooks/useReducerState';
import { createContext, use, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { Company, User, UserRole, Space } from '@/types/database';
// Using API client instead of direct DynamoDB access
import {
  getUserById,
  updateOwnProfile,
  updateUserRole as apiUpdateUserRole,
  removeUserFromCompany as apiRemoveUserFromCompany,
  createCompany,
  getCompany,
  updateCompany,
  getUsersByCompany,
  getSpacesByCompany,
} from '@/lib/api';
import { invalidateInFlightProfileSyncs, syncUserProfileOnce } from '@/lib/bootstrap/profile-sync';
import { ApiError } from '@/lib/api/client-error';
import { subscribeToPresenceClientInvalidation } from '@/lib/presence/client-lifecycle';

export interface CompanyBootstrapError {
  kind: 'unauthenticated' | 'rate-limited' | 'server';
  message: string;
  correlationId?: string;
}

function classifyBootstrapError(error: unknown): CompanyBootstrapError {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.code === 'UNAUTHORIZED') {
      return {
        kind: 'unauthenticated',
        message: error.message,
        correlationId: error.correlationId,
      };
    }

    if (error.status === 429 || error.code === 'RATE_LIMITED') {
      return {
        kind: 'rate-limited',
        message: error.message,
        correlationId: error.correlationId,
      };
    }

    return {
      kind: 'server',
      message: error.message,
      correlationId: error.correlationId,
    };
  }

  return {
    kind: 'server',
    message: error instanceof Error ? error.message : 'Unable to load company data',
  };
}

function isTransientBootstrapFailure(error: unknown): boolean {
  if (!(error instanceof ApiError)) {
    // fetch() network failures surface as TypeError rather than an HTTP error.
    // Other untyped application errors are not proven transient and must not
    // retain authenticated state.
    return error instanceof TypeError;
  }

  if (error.status === 401 || error.code === 'UNAUTHORIZED') {
    return false;
  }

  return error.status === 429 || error.code === 'RATE_LIMITED' || error.status >= 500;
}

interface CompanyContextType { company: Company | null;
  companyUsers: User[];
  spaces: Space[];
  currentUserProfile: User | null;
  isLoading: boolean;
  error: string | null;
  bootstrapError: CompanyBootstrapError | null;
  createNewCompany: (name: string) => Promise<string>;
  updateCompanyDetails: (data: Partial<Company>) => Promise<void>;
  updateUserProfile: (data: Partial<User>) => Promise<void>;
  updateUserRole: (userId: string, newRole: UserRole) => Promise<void>;
  removeUserFromCompany: (userId: string) => Promise<void>;
  loadCompanyData: (userId: string) => Promise<void>;
  refreshCompanyData: () => Promise<void>; }

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

interface CompanyMutationScope {
  readonly authGeneration: number;
  readonly authUserId: string | null;
  readonly profileId: string | null;
  readonly companyId: string | null;
  isCurrent: () => boolean;
  assertCurrent: () => void;
  commit: (commitState: () => void) => boolean;
}

function useCompanyProviderValue(): CompanyContextType { const { user, isAuthReady } = useAuth();
  const [company, updateCompanyState] = useReducerState<Company | null>(null);
  const [companyUsers, updateCompanyUsers] = useReducerState<User[]>([]);
  const [spaces, updateSpaces] = useReducerState<Space[]>([]);
  const [currentUserProfile, updateCurrentUserProfile] = useReducerState<User | null>(null);
  const [dataOwnerUid, updateDataOwnerUid] = useReducerState<string | null>(null);
  const [isLoading, updateIsLoading] = useReducerState<boolean>(true);
  const [error, updateError] = useReducerState<string | null>(null);
  const [bootstrapError, updateBootstrapError] = useReducerState<CompanyBootstrapError | null>(null);
  const userRef = useRef(user);
  userRef.current = user;
  const currentUserProfileRef = useRef(currentUserProfile);
  currentUserProfileRef.current = currentUserProfile;
  const companyRef = useRef(company);
  companyRef.current = company;
  const companyUsersRef = useRef(companyUsers);
  companyUsersRef.current = companyUsers;
  const authUserIdRef = useRef<string | null>(null);
  const authGenerationRef = useRef(0);
  const inFlightLoadsRef = useRef(
    new Map<string, { generation: number; promise: Promise<void> }>()
  );

  const captureMutationScope = useCallback((operation: string): CompanyMutationScope => {
    const authGeneration = authGenerationRef.current;
    const authUserId = userRef.current?.id ?? null;
    const profileId = currentUserProfileRef.current?.id ?? null;
    const companyId = companyRef.current?.id ?? null;
    const isCurrent = (): boolean => (
      authGenerationRef.current === authGeneration &&
      authUserIdRef.current === authUserId &&
      (userRef.current?.id ?? null) === authUserId
    );
    const assertCurrent = (): void => {
      if (!isCurrent()) {
        throw new Error(`Authentication changed during ${operation}`);
      }
    };

    return {
      authGeneration,
      authUserId,
      profileId,
      companyId,
      isCurrent,
      assertCurrent,
      commit: (commitState): boolean => {
        if (!isCurrent()) return false;
        commitState();
        return true;
      },
    };
  }, []);

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
      if (!isCurrentLoad()) {
        return;
      }
      updateIsLoading(true);
      updateError(null);
      updateBootstrapError(null);

      console.log(`[CompanyContext] Starting data load for Supabase UID: ${authUserId}`);

      // Ensure the user profile exists using syncUserProfileOnce
      if (!authUser) { console.error("[CompanyContext] loadCompanyData called but Supabase auth user object is null.");
        throw new Error("Authenticated user data is unexpectedly null during data load."); }

      let userProfile: User | null = null;
      try {
        // Call syncUserProfileOnce to get or create the profile
        userProfile = await syncUserProfileOnce({ supabase_uid: authUserId, // Use correct parameter name
          email: authUser.email || '', displayName: authUser.user_metadata?.name || authUser.email || 'New User' });
        if (!isCurrentLoad()) {
          return;
        }
        console.log(`[CompanyContext] User profile synced/retrieved for ${authUserId}, DB ID: ${ userProfile.id }`);
        updateCurrentUserProfile(userProfile);
        updateDataOwnerUid(authUserId);
      } catch (syncError) { console.error('[CompanyContext] Error syncing user profile:', syncError);
         if (!isCurrentLoad()) {
           return;
         }
         // Attempt to fetch one last time in case sync failed but user exists
         userProfile = await getUserById(authUserId);
         if (!isCurrentLoad()) {
           return;
         }
         if (!userProfile) {
            updateError(syncError instanceof Error ? syncError.message : 'Failed to load user profile');
            if (syncError instanceof ApiError || syncError instanceof TypeError) {
              throw syncError;
            }
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
      const nextBootstrapError = classifyBootstrapError(err);
      updateError(nextBootstrapError.message);
      updateBootstrapError(nextBootstrapError);

      // Non-transient HTTP failures are never safe to retain. Only network,
      // rate-limit, and server failures keep the last confirmed data for this
      // auth generation so Presence does not become falsely unsubscribed.
      if (!isTransientBootstrapFailure(err)) {
        updateCompanyState(null);
        updateCurrentUserProfile(null);
        updateCompanyUsers([]);
        updateSpaces([]);
        updateDataOwnerUid(null);
      }
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
  }, [updateIsLoading, updateError, updateBootstrapError, updateCurrentUserProfile, updateDataOwnerUid, updateCompanyState, updateCompanyUsers, updateSpaces]);
  // Refresh company data for the current user
  const refreshCompanyData = useCallback(async () => { const authUserId = userRef.current?.id;
    if (authUserId && authUserIdRef.current === authUserId) {
      updateBootstrapError(null);
      await loadCompanyData(authUserId); }
  }, [loadCompanyData, updateBootstrapError]);

  useEffect(
    () =>
      subscribeToPresenceClientInvalidation((invalidation) => {
        if (invalidation.reason !== 'membership-scope-invalidated') return;

        const authUserId = userRef.current?.id;
        const profile = currentUserProfileRef.current;
        if (
          !authUserId ||
          !profile ||
          (invalidation.userId && invalidation.userId !== profile.id) ||
          (invalidation.companyId && invalidation.companyId !== profile.companyId)
        ) {
          return;
        }

        // The Auth identity remains valid after remote membership removal, but
        // every company-scoped client value must be loaded again from server truth.
        authGenerationRef.current += 1;
        inFlightLoadsRef.current.delete(authUserId);
        invalidateInFlightProfileSyncs();
        updateCompanyState(null);
        updateCurrentUserProfile(null);
        updateCompanyUsers([]);
        updateSpaces([]);
        updateDataOwnerUid(null);
        updateIsLoading(true);
        void loadCompanyData(authUserId);
      }),
    [
      loadCompanyData,
      updateCompanyState,
      updateCompanyUsers,
      updateCurrentUserProfile,
      updateDataOwnerUid,
      updateIsLoading,
      updateSpaces,
    ],
  );

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
      updateBootstrapError(null);
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
    updateBootstrapError(null);
  }, [isAuthReady, loadCompanyData, user?.id, updateIsLoading, updateCompanyState, updateCurrentUserProfile, updateCompanyUsers, updateSpaces, updateDataOwnerUid, updateError, updateBootstrapError]); // Depend on auth readiness and the memoized load function

  // Create a new company
  const createNewCompany = async (name: string): Promise<string> => { const mutation = captureMutationScope('company creation');
    const authUser = userRef.current;
    if (!authUser?.id || authUser.id !== mutation.authUserId || !authUser.email) { // Ensure user, id, and email are available
      throw new Error('User must be authenticated with valid details to create a company'); }
    const authUserId = mutation.authUserId;
    mutation.assertCurrent();

    try { mutation.commit(() => {
        updateIsLoading(true);
        updateError(null);
      });

      // 1. Ensure user profile exists (get or create)
      let userProfile = await syncUserProfileOnce({ supabase_uid: authUserId, email: authUser.email, displayName: authUser.user_metadata?.name || authUser.email || 'Admin User' });
      mutation.assertCurrent();
      mutation.commit(() => {
        updateCurrentUserProfile(userProfile); // Set profile state immediately
        updateDataOwnerUid(authUserId);
      });

      // 2. Check if user already belongs to a company
      if (userProfile.companyId) { console.log(`[CompanyContext] User ${userProfile.id } already belongs to company ${ userProfile.companyId }. Reloading data.`);
        // Reload data to ensure consistency, though ideally state is already correct
        await loadCompanyData(authUserId);
        mutation.assertCurrent();
        return userProfile.companyId;
      }

      // 3. Create the new company
      const settings = { /* Define settings if needed */ };
      console.log(`[CompanyContext] Creating new company "${name}" for Supabase user ${authUserId}`);
      const newCompany = await createCompany(name, settings);
      mutation.assertCurrent();
      const companyId = newCompany.id;
      console.log(`[CompanyContext] New company created with ID: ${companyId}`);

      // Membership and role were committed atomically by create_company_for_user.
      console.log('[CompanyContext] Reloading company data after atomic creation');
      await loadCompanyData(authUserId); // Use Supabase Auth UID
      mutation.assertCurrent();

      // 6. Navigate to dashboard
      // Consider using Next.js router for better integration:
      // import { useRouter } from 'next/navigation';
      // const router = useRouter(); router.push('/dashboard');
      window.location.href = '/dashboard'; // Keep existing navigation for now

      return companyId;
    } catch (err) {
      console.error('[CompanyContext] Error in createNewCompany process:', err);
      mutation.assertCurrent();
      mutation.commit(() => {
        updateError(err instanceof Error ? err.message : 'Error creating company');
      });
      throw err; // Re-throw error for calling component
    } finally {
      mutation.commit(() => updateIsLoading(false));
    }
  };
  // Update company details
  const updateCompanyDetails = async (data: Partial<Company>): Promise<void> => { const mutation = captureMutationScope('company update');
    const companyAtStart = companyRef.current;
    const profileAtStart = currentUserProfileRef.current;
    if (!mutation.authUserId || !companyAtStart || companyAtStart.id !== mutation.companyId || !profileAtStart?.id || profileAtStart.id !== mutation.profileId) {
      throw new Error('Company and authenticated user required'); }

    // Check if user is admin (company.adminIds stores database user IDs, not Supabase Auth UIDs)
    if (!companyAtStart.adminIds.includes(profileAtStart.id)) {
      throw new Error('Only admins can update company details');
    }
    mutation.assertCurrent();

    try {
      mutation.commit(() => {
        updateIsLoading(true);
        updateError(null);
      });
      const mergedData: Partial<Company> = {
        ...data,
        settings: data.settings !== undefined
          ? { ...companyAtStart.settings, ...data.settings }
          : undefined,
      };

      await updateCompany(companyAtStart.id, mergedData);
      mutation.assertCurrent();
      // Optimistically update local state
      mutation.commit(() => {
        updateCompanyState(prev => {
          if (!prev || prev.id !== mutation.companyId) {
            return prev;
          }

          return {
            ...prev,
            ...mergedData,
            settings: mergedData.settings !== undefined
              ? { ...prev.settings, ...mergedData.settings }
              : prev.settings,
          };
        });
      });
      console.log(`[CompanyContext] Company details updated for ${companyAtStart.id}`);
    } catch (err) {
      console.error('[CompanyContext] Error updating company:', err);
      mutation.assertCurrent();
      mutation.commit(() => updateError(err instanceof Error ? err.message : 'Error updating company'));
      throw err;
    } finally {
      mutation.commit(() => updateIsLoading(false));
    }
  };


  // Update user profile (status, status message etc.)
  const updateUserProfile = async (data: Partial<User>): Promise<void> => { const mutation = captureMutationScope('profile update'); // user.id is Supabase Auth UID
    // currentUserProfile.id is the DB User ID
    const profileAtStart = currentUserProfileRef.current;
    if (!mutation.authUserId || !profileAtStart?.id || profileAtStart.id !== mutation.profileId) { // Check both IDs
      throw new Error('User must be authenticated with a profile'); }
    mutation.assertCurrent();

    try { mutation.commit(() => {
        updateIsLoading(true);
        updateError(null);
      });

      // Call API to update user status/statusMessage using Supabase Auth UID
      // Assuming updateUserStatus expects Supabase Auth UID
      if (data.status === 'offline') {
        throw new Error('Offline is derived from connectivity and cannot be selected');
      }
      await updateOwnProfile(profileAtStart.id, {
        displayName: data.displayName,
        status: data.status,
        statusMessage: data.statusMessage,
        preferences: data.preferences,
      });
      mutation.assertCurrent();

      // Optimistically update local state
      const updatedProfile = { ...profileAtStart, ...data };
      mutation.commit(() => {
        updateCurrentUserProfile(updatedProfile);

        // Update user in the company users list using the DB User ID
        updateCompanyUsers(prevUsers =>
          prevUsers.map(u =>
            u.id === profileAtStart.id ? updatedProfile : u // Match by DB ID
          )
        );
      });
      console.log(`[CompanyContext] User profile updated for ${profileAtStart.id}`);

    } catch (err) { console.error('[CompanyContext] Error updating user profile:', err);
      mutation.assertCurrent();
      mutation.commit(() => updateError(err instanceof Error ? err.message : 'Error updating user profile'));
      // Optionally revert optimistic updates here
      throw err; } finally {
      mutation.commit(() => updateIsLoading(false));
    }
  };

  // Update user role
  const updateUserRole = async (userDbIdToUpdate: string, newRole: UserRole): Promise<void> => { const mutation = captureMutationScope('user role update'); // userDbIdToUpdate is the DB ID of the user whose role is being changed
    // currentUserProfile.id is the DB ID of the *current* admin performing the action
    const companyAtStart = companyRef.current;
    const profileAtStart = currentUserProfileRef.current;
    const targetUserAtStart = companyUsersRef.current.find(u => u.id === userDbIdToUpdate);
    if (!mutation.authUserId || !companyAtStart || companyAtStart.id !== mutation.companyId || !profileAtStart?.id || profileAtStart.id !== mutation.profileId) {
      throw new Error('Admin user must be authenticated with a company profile'); }

    // Check if the *current* user is admin (company.adminIds stores database user IDs)
    if (!companyAtStart.adminIds.includes(profileAtStart.id)) { throw new Error('Only admins can update user roles'); }
    mutation.assertCurrent();

    // Optional: Prevent admin from changing their own role via this function
    // if (userDbIdToUpdate === currentUserProfile.id && newRole !== 'admin') {
    //   throw new Error("Admins cannot demote themselves using this function.");
    // }

    try { mutation.commit(() => {
        updateIsLoading(true);
        updateError(null);
      });

      // Use API client to update user role, passing the DB User ID
      await apiUpdateUserRole(userDbIdToUpdate, newRole); // api.ts expects DB ID
      mutation.assertCurrent();

      // Find the target user in local state to get their DB ID for adminIds update
      if (!targetUserAtStart) {
        console.warn(`[CompanyContext] Could not find user ${userDbIdToUpdate } in local state to update adminIds.`);
        // Consider reloading users or handling this case more robustly
      } else {
        const targetUserDbId = targetUserAtStart.id;
        let updatedAdminIds = [...companyAtStart.adminIds];
        const isAdmin = companyAtStart.adminIds.includes(targetUserDbId);

        let needsCompanyUpdate = false;
        if (newRole === 'admin' && !isAdmin) {
            updatedAdminIds.push(targetUserDbId);
            needsCompanyUpdate = true;
        } else if (newRole !== 'admin' && isAdmin) {
            updatedAdminIds = updatedAdminIds.filter(id => id !== targetUserDbId);
            needsCompanyUpdate = true;
        }

        if (needsCompanyUpdate) {
            // The role endpoint updates users.role and companies.admin_ids in
            // one locked database transaction. Mirror the confirmed response.
            mutation.commit(() => updateCompanyState(prev => (
              prev?.id === mutation.companyId ? { ...prev, adminIds: updatedAdminIds } : prev
            )));
            console.log(`[CompanyContext] Company adminIds mirrored for user ${targetUserDbId}.`);
        }
      }

      // Update user role in local state (companyUsers) using DB User ID
      mutation.commit(() => updateCompanyUsers(prevUsers =>
          prevUsers.map(u =>
            u.id === userDbIdToUpdate ? { ...u, role: newRole } : u
          )
        ));
      console.log(`[CompanyContext] User role updated for ${ userDbIdToUpdate } to ${newRole}.`);

    } catch (err) { console.error('[CompanyContext] Error updating user role:', err);
      mutation.assertCurrent();
      mutation.commit(() => updateError(err instanceof Error ? err.message : 'Error updating user role'));
      throw err; } finally {
      mutation.commit(() => updateIsLoading(false));
    }
  };

  // Remove user from company
  const removeUserFromCompany = async (userDbIdToRemove: string): Promise<void> => { const mutation = captureMutationScope('company member removal'); // userDbIdToRemove is the DB ID of the user being removed
    // currentUserProfile.id is the DB ID of the *current* admin performing the action
    const companyAtStart = companyRef.current;
    const profileAtStart = currentUserProfileRef.current;
    const userToRemoveProfile = companyUsersRef.current.find(u => u.id === userDbIdToRemove);
    if (!mutation.authUserId || !companyAtStart || companyAtStart.id !== mutation.companyId || !profileAtStart?.id || profileAtStart.id !== mutation.profileId) {
      throw new Error('Admin user must be authenticated with a company profile'); }

    // Check if the *current* user is admin (company.adminIds stores database user IDs)
    if (!companyAtStart.adminIds.includes(profileAtStart.id)) { throw new Error('Only admins can remove users'); }

    // Prevent removing yourself (check against DB ID)
    if (userDbIdToRemove === profileAtStart.id) {
      throw new Error('You cannot remove yourself from the company using this function.');
    }
    mutation.assertCurrent();

    try { mutation.commit(() => {
        updateIsLoading(true);
        updateError(null);
      });

      // Use API client to remove user from company, passing the DB User ID
      await apiRemoveUserFromCompany(userDbIdToRemove); // api.ts expects DB ID
      mutation.assertCurrent();

      // Membership, adminIds, placement, sessions, and logs committed in one
      // database transaction. Mirror only the confirmed result locally.
      if (userToRemoveProfile && companyAtStart.adminIds.includes(userToRemoveProfile.id)) {
        mutation.commit(() => updateCompanyState(prev => prev?.id === mutation.companyId ? {
            ...prev,
            adminIds: prev.adminIds.filter(id => id !== userToRemoveProfile.id),
          } : prev));
      }

      // Remove user from local state using DB User ID
      mutation.commit(() => updateCompanyUsers(prevUsers => prevUsers.filter(u => u.id !== userDbIdToRemove)));
      console.log(`[CompanyContext] User ${ userDbIdToRemove } removed from company ${companyAtStart.id}.`);

    } catch (err) { console.error('[CompanyContext] Error removing user from company:', err);
      mutation.assertCurrent();
      mutation.commit(() => updateError(err instanceof Error ? err.message : 'Error removing user from company'));
      throw err; } finally {
      mutation.commit(() => updateIsLoading(false));
    }
  };

  const currentAuthUserId = user?.id ?? null;
  const isIdentityTransitionPending = authUserIdRef.current !== currentAuthUserId;
  const ownedByCurrentUser = currentAuthUserId !== null && dataOwnerUid === currentAuthUserId;
  const shouldMaskOwnedData =
    isIdentityTransitionPending || (currentAuthUserId !== null && !ownedByCurrentUser);
  const shouldMaskErrors =
    isIdentityTransitionPending || (dataOwnerUid !== null && !ownedByCurrentUser);

  const value = {
    company: shouldMaskOwnedData ? null : company,
    companyUsers: shouldMaskOwnedData ? [] : companyUsers,
    spaces: shouldMaskOwnedData ? [] : spaces,
    currentUserProfile: shouldMaskOwnedData ? null : currentUserProfile,
    isLoading: isLoading || isIdentityTransitionPending,
    error: shouldMaskErrors ? null : error,
    bootstrapError: shouldMaskErrors ? null : bootstrapError,
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
