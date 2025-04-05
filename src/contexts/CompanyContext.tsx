// src/contexts/CompanyContext.tsx
'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react'; // Added useCallback
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { User as FirebaseUser } from 'firebase/auth';
import { Timestamp } from 'firebase/firestore';
import { useAuth } from './AuthContext';
import { Company, User, UserRole, Space } from '@/types/database'; // Added Space
// Using API client instead of direct DynamoDB access
import {
  getUserByFirebaseId,
  getUserById,
  createUser,
  updateUserStatus,
  updateUserRole as apiUpdateUserRole,
  removeUserFromCompany as apiRemoveUserFromCompany,
  createCompany,
  getCompany,
  updateCompany,
  getUsersByCompany,
  getSpacesByCompany, // Added getSpacesByCompany
  cleanupDuplicateCompanies
} from '@/lib/api';

interface CompanyContextType {
  company: Company | null;
  companyUsers: User[];
  spaces: Space[]; // Added spaces state
  currentUserProfile: User | null;
  isLoading: boolean;
  error: string | null;
  // Company CRUD
  createNewCompany: (name: string) => Promise<string>;
  updateCompanyDetails: (data: Partial<Company>) => Promise<void>;
  // User management
  // createUserProfile: (userData: Partial<User>) => Promise<string>; // Removed - Handled by accept invite flow
  updateUserProfile: (data: Partial<User>) => Promise<void>;
  updateUserRole: (userId: string, newRole: UserRole) => Promise<void>;
  removeUserFromCompany: (userId: string) => Promise<void>;
  // Add loadCompanyData to the interface
  loadCompanyData: (userId: string) => Promise<void>;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [company, setCompany] = useState<Company | null>(null);
  const [companyUsers, setCompanyUsers] = useState<User[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]); // Added spaces state
  const [currentUserProfile, setCurrentUserProfile] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Load user profile, company, users, and spaces
  const loadCompanyData = useCallback(async (userId: string) => {
    try {
      setIsLoading(true);
      setError(null);

      // Removed the call to cleanupDuplicateCompanies as it was causing errors
      // and its logic during login is questionable.

      // Check if userId is a valid Firebase UID or a UUID
      // Firebase UIDs typically don't have hyphens, while UUIDs do
      const isUUID = userId.includes('-') && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
      
      // If it's a UUID, we need to find the user by database ID instead of Firebase UID
      let userProfile;
      if (isUUID) {
        console.log(`User ID ${userId} appears to be a UUID, not a Firebase UID. Trying to find user by ID...`);
        // This would require a new API endpoint to get user by ID
        // For now, we'll try to get the user by Firebase UID and handle the error
        userProfile = await getUserById(userId);
      } else {
        // Get user profile by Firebase UID
        userProfile = await getUserByFirebaseId(userId);
      }

      // If user doesn't exist in Supabase yet, create them now
      if (!userProfile) {
        console.log(`User ${userId} not found in Supabase, creating...`);
        // We need the authenticated user object here to get email/displayName
        // Assuming 'user' from useAuth() is accessible or passed differently.
        // For now, let's assume 'user' from useAuth() is available in this scope
        // Add explicit null check for user to satisfy TypeScript,
        // although useEffect should prevent this block from running if user is null.
        if (!user) {
           console.error("loadCompanyData called for user creation, but user object is null. This indicates a logic error.");
           throw new Error("Authenticated user data is unexpectedly null during profile creation.");
        }
        
        try {
          // Now TypeScript knows 'user' is not null here.
          // because 'user' is included in the useCallback dependency array below.
          // The useEffect ensures this code only runs when 'user' is truthy.
          const createdProfile = await createUser({
            firebase_uid: userId, // Always use the userId as firebase_uid
            email: user.email || '',
            displayName: user.displayName || 'User',
            status: 'online' as const
          });
          // Fetch the newly created profile to ensure we have the Supabase ID etc.
          userProfile = createdProfile;
        } catch (err) {
          console.error("Error creating user profile:", err);
          // If creation failed, try to get the user one more time
          // This handles the case where the user already exists but we got an error
          if (isUUID) {
            userProfile = await getUserById(userId);
          } else {
            userProfile = await getUserByFirebaseId(userId);
          }
          if (!userProfile) {
            throw new Error("Failed to create or retrieve user profile");
          }
        }
      }
      
      // Set the profile state (either existing or newly created)
      setCurrentUserProfile(userProfile);

      // Now check for company association and load company data if applicable
      if (userProfile?.companyId) {
        console.log(`User ${userId} belongs to company ${userProfile.companyId}, loading company data...`);
        const companyData = await getCompany(userProfile.companyId);
        setCompany(companyData);
        const users = await getUsersByCompany(userProfile.companyId);
        setCompanyUsers(users);
        const fetchedSpaces = await getSpacesByCompany(userProfile.companyId);
        setSpaces(fetchedSpaces);
      } else {
        console.log(`User ${userId} exists but has no company association.`);
        // Reset company-related state if user has no company
        setCompany(null);
        setCompanyUsers([]);
        setSpaces([]);
      }
    } catch (err) {
      console.error('Error loading company data:', err);
      setError(err instanceof Error ? err.message : 'Error loading data');
      // Reset state on error
      setCompany(null);
      setCurrentUserProfile(null);
      setCompanyUsers([]);
      setSpaces([]);
    } finally {
      setIsLoading(false);
    }
  }, [user]); // Add `user` to dependency array

  // Effect to trigger loading when auth user changes
  useEffect(() => {
    if (user) {
      loadCompanyData(user.uid);
    } else {
      // Reset all state if user logs out
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
    if (!user) {
      throw new Error('User must be authenticated to create a company');
    }

    try {
      setIsLoading(true);
      setError(null);

      // Check if user already has a company association
      const existingProfile = await getUserByFirebaseId(user.uid);
      if (existingProfile?.companyId) {
        console.log('User already has a company, returning existing company ID');
        
        // If the user already has a company, reload all data
        await loadCompanyData(user.uid);
        return existingProfile.companyId;
      }

      // Define settings if needed (optional)
      const settings = {
        allowGuestAccess: false,
        maxRooms: 10,
        theme: 'light',
      };

      console.log('Creating new company:', name);
      // Call the updated createCompany helper with specific arguments
      const newCompany = await createCompany(name, user.uid, settings); // Pass name, firebaseUid, settings
      const companyId = newCompany.id; // Get ID from the returned company object
      console.log('New company created successfully with ID:', companyId);

      // Create or update user profile to link with company
      let userProfile = await getUserByFirebaseId(user.uid);
      
      if (!userProfile) {
        // Create new user profile
        console.log('Creating new user profile with company ID:', companyId);
        // Call createUser directly with the correct arguments
        await createUser({
          firebase_uid: user.uid, // Use user.uid from Firebase Auth
          email: user.email || '',
          displayName: user.displayName || 'User',
          status: 'online' as const, // Set initial status
          companyId // Add companyId directly to the creation payload
        });
        userProfile = await getUserByFirebaseId(user.uid);
      } else {
        // Update existing user profile with new company ID, role, and status
        console.log('Updating existing user profile with company ID:', companyId);
        
        // Update the user's company ID using the API directly rather than fetch
        try {
          await fetch(`/api/users/update?id=${userProfile.id}`, { // Use Supabase UUID here
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
              companyId,
              role: 'admin',
              status: 'online'
            }),
          });
          
          // Update the local state immediately without waiting for reload
          userProfile = { 
            ...userProfile, 
            companyId, 
            role: 'admin', 
            status: 'online' 
          };
          
          // Update the current user profile state immediately
          setCurrentUserProfile(userProfile);
        } catch (updateError) {
          console.error('Error updating user profile:', updateError);
          throw new Error('Failed to update user profile with company ID');
        }
      }

      // Get company data
      const companyData2 = await getCompany(companyId);
      setCompany(companyData2);
      
      // Reload all company data after creation
      console.log('Reloading company data after creation');
      await loadCompanyData(user.uid);

      // Forcing navigation to dashboard after successful company creation
      window.location.href = '/dashboard';
      
      return companyId;
    } catch (err) {
      console.error('Error creating/updating company:', err);
      setError(err instanceof Error ? err.message : 'Error creating company');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Update company details
  const updateCompanyDetails = async (data: Partial<Company>): Promise<void> => {
    if (!company || !user) {
      throw new Error('Company and user required');
    }

    // Check if user is admin
    if (!company.adminIds.includes(user.uid)) {
      throw new Error('Only admins can update company details');
    }

    try {
      setIsLoading(true);
      setError(null);

      // Use API client to update company
      await updateCompany(company.id, data);
      
      // Update company state
      setCompany({ ...company, ...data });
    } catch (err) {
      console.error('Error updating company:', err);
      setError(err instanceof Error ? err.message : 'Error updating company');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Removed createUserProfile function - Handled by accept invite flow
  // const createUserProfile = async (...) => { ... };

  // Update user profile
  const updateUserProfile = async (data: Partial<User>): Promise<void> => {
    if (!user || !currentUserProfile) {
      throw new Error('User must be authenticated with a profile');
    }

    try {
      setIsLoading(true);
      setError(null);

      // Use API client to update user
      await updateUserStatus(
        user.uid, 
        data.status || currentUserProfile.status,
        data.statusMessage
      );
      
      // Update user profile state
      setCurrentUserProfile({ ...currentUserProfile, ...data });
      
      // Update user in company users list
      const updatedUsers = companyUsers.map(u => 
        u.id === user.uid ? { ...u, ...data } : u
      );
      setCompanyUsers(updatedUsers);
    } catch (err) {
      console.error('Error updating user profile:', err);
      setError(err instanceof Error ? err.message : 'Error updating user profile');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Update user role
  const updateUserRole = async (userId: string, newRole: UserRole): Promise<void> => {
    if (!user || !company) {
      throw new Error('User must be authenticated with a company');
    }

    // Check if current user is admin
    if (!company.adminIds.includes(user.uid)) {
      throw new Error('Only admins can update user roles');
    }

    try {
      setIsLoading(true);
      setError(null);

      // Use API client to update user role
      await apiUpdateUserRole(userId, newRole);
      
      // If user is being promoted to admin, add to company adminIds
      if (newRole === 'admin' && !company.adminIds.includes(userId)) {
        const updatedAdminIds = [...company.adminIds, userId];
        await updateCompany(company.id, { adminIds: updatedAdminIds });
        setCompany({ ...company, adminIds: updatedAdminIds });
      }
      
      // If user is being demoted from admin, remove from company adminIds
      if (newRole === 'member' && company.adminIds.includes(userId)) {
        const updatedAdminIds = company.adminIds.filter(id => id !== userId);
        await updateCompany(company.id, { adminIds: updatedAdminIds });
        setCompany({ ...company, adminIds: updatedAdminIds });
      }
      
      // Update user in state
      const updatedUsers = companyUsers.map(u => 
        u.id === userId ? { ...u, role: newRole } : u
      );
      setCompanyUsers(updatedUsers);
    } catch (err) {
      console.error('Error updating user role:', err);
      setError(err instanceof Error ? err.message : 'Error updating user role');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Remove user from company
  const removeUserFromCompany = async (userId: string): Promise<void> => {
    if (!user || !company) {
      throw new Error('User must be authenticated with a company');
    }

    // Check if current user is admin
    if (!company.adminIds.includes(user.uid)) {
      throw new Error('Only admins can remove users');
    }

    // Prevent removing yourself
    if (userId === user.uid) {
      throw new Error('You cannot remove yourself from the company');
    }

    try {
      setIsLoading(true);
      setError(null);

      // Use API client to remove user from company
      await apiRemoveUserFromCompany(userId, company.id);
      
      // If user is admin, remove from company adminIds
      if (company.adminIds.includes(userId)) {
        const updatedAdminIds = company.adminIds.filter(id => id !== userId);
        await updateCompany(company.id, { adminIds: updatedAdminIds });
        setCompany({ ...company, adminIds: updatedAdminIds });
      }
      
      // Remove user from state
      const updatedUsers = companyUsers.filter(u => u.id !== userId);
      setCompanyUsers(updatedUsers);
    } catch (err) {
      console.error('Error removing user from company:', err);
      setError(err instanceof Error ? err.message : 'Error removing user from company');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const value = {
    company,
    companyUsers,
    spaces, // Expose spaces
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
