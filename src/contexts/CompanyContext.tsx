// src/contexts/CompanyContext.tsx
'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { Company, User, UserRole, Space } from '@/types/database';
import { extractGoogleAvatarUrl } from '@/lib/avatar-utils';
// Using API client instead of direct DynamoDB access
import {
  getUserById,
  syncUserProfile, // Use syncUserProfile
  updateUserStatus,
  updateUserRole as apiUpdateUserRole,
  removeUserFromCompany as apiRemoveUserFromCompany,
  createCompany,
  getCompany,
  updateCompany,
  getUsersByCompany,
  getSpacesByCompany,
} from '@/lib/api';

interface CompanyContextType {
  company: Company | null;
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
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [company, setCompany] = useState<Company | null>(null);
  const [companyUsers, setCompanyUsers] = useState<User[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [currentUserProfile, setCurrentUserProfile] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Load user profile, company, users, and spaces
  const loadCompanyData = useCallback(async (authUserId: string) => {
    // authUserId here is the Supabase Auth UID
    try {
      setIsLoading(true);
      setError(null);

      console.log(`[CompanyContext] Starting data load for Supabase UID: ${authUserId}`);

      // Ensure the user profile exists using syncUserProfile
      if (!user) {
        console.error("[CompanyContext] loadCompanyData called but Supabase auth user object is null.");
        throw new Error("Authenticated user data is unexpectedly null during data load.");
      }

      let userProfile: User | null = null;
      try {
        // Try to extract Google avatar (if applicable) to persist in DB for cross-user visibility
        const googleAvatarUrl = (() => {
          try {
            return extractGoogleAvatarUrl(user.user_metadata) || undefined;
          } catch {
            return undefined;
          }
        })();

        // Call syncUserProfile to get or create the profile
        userProfile = await syncUserProfile({
          supabase_uid: authUserId, // Use correct parameter name
          email: user.email || '',
          displayName: user.user_metadata?.name || user.email || 'New User',
          googleAvatarUrl,
        });
        console.log(`[CompanyContext] User profile synced/retrieved for ${authUserId}, DB ID: ${userProfile.id}`);
        setCurrentUserProfile(userProfile);
      } catch (syncError) {
         console.error('[CompanyContext] Error syncing user profile:', syncError);
         // Attempt to fetch one last time in case sync failed but user exists
         userProfile = await getUserById(authUserId);
         if (!userProfile) {
            setError(syncError instanceof Error ? syncError.message : 'Failed to load user profile');
            throw new Error(`Failed to sync or retrieve user profile for Supabase UID ${authUserId}`);
         }
         console.warn(`[CompanyContext] Synced failed, but retrieved existing profile ${userProfile.id} for ${authUserId}.`);
         setCurrentUserProfile(userProfile);
      }


      // Load company data if the user is associated with one
      if (userProfile?.companyId) {
        console.log(`[CompanyContext] User ${userProfile.id} belongs to company ${userProfile.companyId}, loading company data...`);
        const companyData = await getCompany(userProfile.companyId);
        setCompany(companyData);
        if (companyData) {
            const users = await getUsersByCompany(userProfile.companyId);
            setCompanyUsers(users);
            const fetchedSpaces = await getSpacesByCompany(userProfile.companyId);
            setSpaces(fetchedSpaces);
            console.log(`[CompanyContext] Loaded ${users.length} users and ${fetchedSpaces.length} spaces for company ${userProfile.companyId}`);
        } else {
            console.warn(`[CompanyContext] User ${userProfile.id} has companyId ${userProfile.companyId}, but company data could not be fetched.`);
            // Reset company specific data if company fetch fails
            setCompany(null);
            setCompanyUsers([]);
            setSpaces([]);
        }
      } else {
        console.log(`[CompanyContext] User ${userProfile.id} (Supabase UID: ${authUserId}) has no company association.`);
        setCompany(null);
        setCompanyUsers([]);
        setSpaces([]);
      }
    } catch (err) {
      console.error('[CompanyContext] Error loading company data:', err);
      setError(err instanceof Error ? err.message : 'Error loading data');
      // Reset all state on error
      setCompany(null);
      setCurrentUserProfile(null);
      setCompanyUsers([]);
      setSpaces([]);
    } finally {
      setIsLoading(false);
      console.log("[CompanyContext] Data loading finished.");
    }
  }, [user]); // Depend on the Supabase auth user object

  // Effect to trigger loading when auth user changes
  useEffect(() => {
    if (user?.id) { // Ensure user and user.id exist
      loadCompanyData(user.id);
    } else {
      // Reset all state if user logs out or is not available
      console.log("[CompanyContext] User logged out or not available, resetting state.");
      setCompany(null);
      setCurrentUserProfile(null);
      setCompanyUsers([]);
      setSpaces([]);
      setIsLoading(false);
      setError(null);
    }
  }, [user, loadCompanyData]); // Depend on user and the memoized load function

  // Create a new company
  const createNewCompany = async (name: string): Promise<string> => {
    if (!user?.id || !user.email) { // Ensure user, id, and email are available
      throw new Error('User must be authenticated with valid details to create a company');
    }
    const authUserId = user.id; // Supabase Auth UID

    try {
      setIsLoading(true);
      setError(null);

      // 1. Ensure user profile exists (get or create)
      const googleAvatarUrl = (() => {
        try {
          return extractGoogleAvatarUrl(user.user_metadata) || undefined;
        } catch {
          return undefined;
        }
      })();

      let userProfile = await syncUserProfile({
        supabase_uid: authUserId,
        email: user.email,
        displayName: user.user_metadata?.name || user.email || 'Admin User',
        googleAvatarUrl,
      });
      setCurrentUserProfile(userProfile); // Set profile state immediately

      // 2. Check if user already belongs to a company
      if (userProfile.companyId) {
        console.log(`[CompanyContext] User ${userProfile.id} already belongs to company ${userProfile.companyId}. Reloading data.`);
        // Reload data to ensure consistency, though ideally state is already correct
        await loadCompanyData(authUserId);
        return userProfile.companyId;
      }

      // 3. Create the new company
      const settings = { /* Define settings if needed */ };
      console.log(`[CompanyContext] Creating new company "${name}" for Supabase user ${authUserId}`);
      // Pass Supabase Auth UID as creator
      const newCompany = await createCompany(name, authUserId, settings);
      const companyId = newCompany.id;
      console.log(`[CompanyContext] New company created with ID: ${companyId}`);

      // 4. Update the user profile to link company and set role to admin
      console.log(`[CompanyContext] Updating user profile ${userProfile.id} with company ${companyId} and admin role.`);
      try {
        // Use the user's DB ID (userProfile.id) for the update API call
        // Assuming /api/users/update identifies user by DB ID in query param 'id'
        const response = await fetch(`/api/users/update?id=${userProfile.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId: companyId,
            role: 'admin',
            // Optionally update status if needed, e.g., ensure 'online'
            // status: 'online'
          }),
        });
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(`Failed to update user profile: ${errorData.message || response.statusText}`);
        }
        const updatedProfileData = await response.json(); // Assuming API returns updated user

        // Update local state immediately with the fully updated profile
        userProfile = { ...userProfile, ...updatedProfileData };
        setCurrentUserProfile(userProfile);
        console.log(`[CompanyContext] User profile ${userProfile.id} updated successfully.`);

      } catch (updateError) {
        console.error('[CompanyContext] Error updating user profile after company creation:', updateError);
        // Consider rollback or cleanup logic for the created company if user update fails critically
        throw new Error('Failed to link user profile to the new company');
      }

      // 5. Reload all company data after successful creation and linking
      console.log('[CompanyContext] Reloading company data after creation/user linking');
      await loadCompanyData(authUserId); // Use Supabase Auth UID

      // 6. Navigate to dashboard
      // Consider using Next.js router for better integration:
      // import { useRouter } from 'next/navigation';
      // const router = useRouter(); router.push('/dashboard');
      window.location.href = '/dashboard'; // Keep existing navigation for now

      return companyId;
    } catch (err) {
      console.error('[CompanyContext] Error in createNewCompany process:', err);
      setError(err instanceof Error ? err.message : 'Error creating company');
      setIsLoading(false); // Ensure loading state is reset on error
      throw err; // Re-throw error for calling component
    }
    // No finally block needed here as it's handled within the try/catch
  };

  // Update company details
  const updateCompanyDetails = async (data: Partial<Company>): Promise<void> => {
    if (!company || !user?.id) { // Check user.id
      throw new Error('Company and authenticated user required');
    }

    // Check if user is admin (assuming company.adminIds stores Supabase UIDs)
    if (!company.adminIds.includes(user.id)) {
      throw new Error('Only admins can update company details');
    }

    try {
      setIsLoading(true);
      setError(null);
      await updateCompany(company.id, data);
      // Optimistically update local state
      setCompany(prev => prev ? { ...prev, ...data } : null);
      console.log(`[CompanyContext] Company details updated for ${company.id}`);
    } catch (err) {
      console.error('[CompanyContext] Error updating company:', err);
      setError(err instanceof Error ? err.message : 'Error updating company');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };


  // Update user profile (status, status message etc.)
  const updateUserProfile = async (data: Partial<User>): Promise<void> => {
    // user.id is Supabase Auth UID
    // currentUserProfile.id is the DB User ID
    if (!user?.id || !currentUserProfile?.id) { // Check both IDs
      throw new Error('User must be authenticated with a profile');
    }

    try {
      setIsLoading(true);
      setError(null);

      // Call API to update user status/statusMessage using Supabase Auth UID
      // Assuming updateUserStatus expects Supabase Auth UID
      await updateUserStatus(
        user.id, // Pass Supabase Auth UID
        data.status || currentUserProfile.status,
        data.statusMessage
      );

      // Optimistically update local state
      const updatedProfile = { ...currentUserProfile, ...data };
      setCurrentUserProfile(updatedProfile);

      // Update user in the company users list using the DB User ID
      setCompanyUsers(prevUsers =>
        prevUsers.map(u =>
          u.id === currentUserProfile.id ? updatedProfile : u // Match by DB ID
        )
      );
      console.log(`[CompanyContext] User profile updated for ${currentUserProfile.id}`);

    } catch (err) {
      console.error('[CompanyContext] Error updating user profile:', err);
      setError(err instanceof Error ? err.message : 'Error updating user profile');
      // Optionally revert optimistic updates here
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Update user role
  const updateUserRole = async (userDbIdToUpdate: string, newRole: UserRole): Promise<void> => {
    // userDbIdToUpdate is the DB ID of the user whose role is being changed
    // user.id is the Supabase Auth UID of the *current* admin performing the action
    if (!user?.id || !company || !currentUserProfile) {
      throw new Error('Admin user must be authenticated with a company profile');
    }

    // Check if the *current* user is admin (assuming company.adminIds stores Supabase UIDs)
    if (!company.adminIds.includes(user.id)) {
      throw new Error('Only admins can update user roles');
    }

    // Optional: Prevent admin from changing their own role via this function
    // if (userDbIdToUpdate === currentUserProfile.id && newRole !== 'admin') {
    //   throw new Error("Admins cannot demote themselves using this function.");
    // }

    try {
      setIsLoading(true);
      setError(null);

      // Use API client to update user role, passing the DB User ID
      await apiUpdateUserRole(userDbIdToUpdate, newRole); // api.ts expects DB ID

      // Find the target user in local state to get their Supabase UID for adminIds update
      const targetUser = companyUsers.find(u => u.id === userDbIdToUpdate);
      if (!targetUser?.supabase_uid) {
        console.warn(`[CompanyContext] Could not find Supabase UID for user ${userDbIdToUpdate} in local state to update adminIds.`);
        // Consider reloading users or handling this case more robustly
      } else {
        const targetUserSupabaseUid = targetUser.supabase_uid;
        let updatedAdminIds = [...company.adminIds];
        const isAdmin = company.adminIds.includes(targetUserSupabaseUid);

        let needsCompanyUpdate = false;
        if (newRole === 'admin' && !isAdmin) {
            updatedAdminIds.push(targetUserSupabaseUid);
            needsCompanyUpdate = true;
        } else if (newRole !== 'admin' && isAdmin) {
            updatedAdminIds = updatedAdminIds.filter(id => id !== targetUserSupabaseUid);
            needsCompanyUpdate = true;
        }

        if (needsCompanyUpdate) {
            await updateCompany(company.id, { adminIds: updatedAdminIds });
            // Update local company state optimistically
            setCompany(prev => prev ? { ...prev, adminIds: updatedAdminIds } : null);
            console.log(`[CompanyContext] Company adminIds updated for user ${targetUserSupabaseUid}.`);
        }
      }

      // Update user role in local state (companyUsers) using DB User ID
      setCompanyUsers(prevUsers =>
        prevUsers.map(u =>
          u.id === userDbIdToUpdate ? { ...u, role: newRole } : u
        )
      );
      console.log(`[CompanyContext] User role updated for ${userDbIdToUpdate} to ${newRole}.`);

    } catch (err) {
      console.error('[CompanyContext] Error updating user role:', err);
      setError(err instanceof Error ? err.message : 'Error updating user role');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Remove user from company
  const removeUserFromCompany = async (userDbIdToRemove: string): Promise<void> => {
    // userDbIdToRemove is the DB ID of the user being removed
    // user.id is the Supabase Auth UID of the *current* admin performing the action
    if (!user?.id || !company || !currentUserProfile) {
      throw new Error('Admin user must be authenticated with a company profile');
    }

    // Check if the *current* user is admin (assuming company.adminIds stores Supabase UIDs)
    if (!company.adminIds.includes(user.id)) {
      throw new Error('Only admins can remove users');
    }

    // Find the user being removed to check if they are the current user
    const userToRemoveProfile = companyUsers.find(u => u.id === userDbIdToRemove);

    // Prevent removing yourself (check against Supabase Auth UID)
    if (userToRemoveProfile?.supabase_uid === user.id) {
      throw new Error('You cannot remove yourself from the company using this function.');
    }

    try {
      setIsLoading(true);
      setError(null);

      // Use API client to remove user from company, passing the DB User ID
      await apiRemoveUserFromCompany(userDbIdToRemove, company.id); // api.ts expects DB ID

      // If removed user was an admin, update company adminIds (using their Supabase UID)
      const removedUserSupabaseUid = userToRemoveProfile?.supabase_uid;
      if (removedUserSupabaseUid && company.adminIds.includes(removedUserSupabaseUid)) {
        const updatedAdminIds = company.adminIds.filter(id => id !== removedUserSupabaseUid);
        await updateCompany(company.id, { adminIds: updatedAdminIds });
        // Update local company state optimistically
        setCompany(prev => prev ? { ...prev, adminIds: updatedAdminIds } : null);
        console.log(`[CompanyContext] Company adminIds updated after removing admin ${removedUserSupabaseUid}.`);
      }

      // Remove user from local state using DB User ID
      setCompanyUsers(prevUsers => prevUsers.filter(u => u.id !== userDbIdToRemove));
      console.log(`[CompanyContext] User ${userDbIdToRemove} removed from company ${company.id}.`);

    } catch (err) {
      console.error('[CompanyContext] Error removing user from company:', err);
      setError(err instanceof Error ? err.message : 'Error removing user from company');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const value = {
    company,
    companyUsers,
    spaces,
    currentUserProfile,
    isLoading,
    error,
    createNewCompany,
    updateCompanyDetails,
    updateUserProfile,
    updateUserRole,
    removeUserFromCompany,
    loadCompanyData,
  };

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export const useCompany = () => {
  const context = useContext(CompanyContext);
  if (context === undefined) {
    throw new Error('useCompany must be used within a CompanyProvider');
  }
  return context;
};
