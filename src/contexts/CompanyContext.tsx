// src/contexts/CompanyContext.tsx
'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import * as crypto from 'crypto';
import { User as FirebaseUser } from 'firebase/auth';
import { Timestamp } from 'firebase/firestore';
import { useAuth } from './AuthContext';
import { Company, User } from '@/types/database';
// Using API client instead of direct DynamoDB access
import { 
  getUserByFirebaseId, 
  createUser, 
  updateUserStatus,
  updateUserRole as apiUpdateUserRole,
  removeUserFromCompany as apiRemoveUserFromCompany,
  createCompany,
  getCompany,
  updateCompany,
  getUsersByCompany
} from '@/lib/api';

interface CompanyContextType {
  company: Company | null;
  companyUsers: User[];
  currentUserProfile: User | null;
  isLoading: boolean;
  error: string | null;
  // Company CRUD
  createNewCompany: (name: string) => Promise<string>;
  updateCompanyDetails: (data: Partial<Company>) => Promise<void>;
  // User management
  createUserProfile: (userData: Partial<User>) => Promise<string>;
  updateUserProfile: (data: Partial<User>) => Promise<void>;
  updateUserRole: (userId: string, newRole: UserRole) => Promise<void>;
  removeUserFromCompany: (userId: string) => Promise<void>;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [company, setCompany] = useState<Company | null>(null);
  const [companyUsers, setCompanyUsers] = useState<User[]>([]);
  const [currentUserProfile, setCurrentUserProfile] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Load user profile and company when auth user changes
  useEffect(() => {
    const loadUserAndCompany = async () => {
      if (!user) {
        setCompany(null);
        setCurrentUserProfile(null);
        setCompanyUsers([]);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        // Get user profile - using the API client
        const userProfile = await getUserByFirebaseId(user.uid);
        setCurrentUserProfile(userProfile);

        if (userProfile && userProfile.companyId) {
          // Get company details - using the API client
          const companyData = await getCompany(userProfile.companyId);
          setCompany(companyData);

          // Get company users - using the API client
          const users = await getUsersByCompany(userProfile.companyId);
          setCompanyUsers(users);
        }
      } catch (err) {
        console.error('Error loading user and company data:', err);
        setError(err instanceof Error ? err.message : 'Error loading data');
      } finally {
        setIsLoading(false);
      }
    };

    loadUserAndCompany();
  }, [user]);

  // Create a new company
  const createNewCompany = async (name: string): Promise<string> => {
    if (!user) {
      throw new Error('User must be authenticated to create a company');
    }

    try {
      setIsLoading(true);
      setError(null);

      // Create company
      const companyData: Omit<Company, 'id' | 'createdAt'> = {
        name,
        adminIds: [user.uid],
        settings: {
          allowGuestAccess: false,
          maxRooms: 10,
          theme: 'light',
        },
      };

      // Use the API client to create the company
      const companyId = await createCompany(companyData);

      // Create or update user profile to link with company
      let userProfile = await getUserByFirebaseId(user.uid);
      
      if (!userProfile) {
        // Create new user profile
        const userData = {
          id: user.uid,
          companyId,
          email: user.email || '',
          displayName: user.displayName || 'User',
          avatarUrl: user.photoURL || undefined,
          status: 'online' as const,
          role: 'admin',
          preferences: {
            theme: 'light',
            notifications: true,
          },
        };
        
        await createUser(userData);
        userProfile = await getUserByFirebaseId(user.uid);
      } else {
        // Update existing user profile with new company
        await updateUserStatus(user.uid, 'online', 'Just created a company');
        userProfile = { ...userProfile, companyId, role: 'admin', status: 'online' };
      }

      // Get company data
      const companyData2 = await getCompany(companyId);
      
      // Update states
      setCompany(companyData2);
      setCurrentUserProfile(userProfile);
      setCompanyUsers([userProfile!]);

      return companyId;
    } catch (err) {
      console.error('Error creating company:', err);
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

  // Create user profile
  const createUserProfile = async (userData: Partial<User>): Promise<string> => {
    if (!user) {
      throw new Error('User must be authenticated');
    }

    if (!company) {
      throw new Error('Company is required');
    }

    try {
      setIsLoading(true);
      setError(null);

      const newUserData = {
        email: userData.email || user.email || '',
        displayName: userData.displayName || user.displayName || 'User',
        avatarUrl: userData.avatarUrl || user.photoURL || undefined,
        status: 'offline' as const,
        role: userData.role || 'member',
        companyId: company.id,
        preferences: userData.preferences || {
          theme: 'light',
          notifications: true,
        },
      };

      // Use API client to create user
      const userId = await createUser({ ...newUserData, id: crypto.randomUUID() });
      
      // Get updated user list
      const users = await getUsersByCompany(company.id);
      setCompanyUsers(users);

      return userId;
    } catch (err) {
      console.error('Error creating user profile:', err);
      setError(err instanceof Error ? err.message : 'Error creating user profile');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

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
    currentUserProfile,
    isLoading,
    error,
    createNewCompany,
    updateCompanyDetails,
    createUserProfile,
    updateUserProfile,
    updateUserRole,
    removeUserFromCompany,
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