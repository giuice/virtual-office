// src/lib/api.ts
// Client-side API functions for interacting with server-side endpoints

import { Company, User } from '@/types/database';

/**
 * Create a new user in the database via the server-side API
 */
export async function createUser(userData: {
  id: string;
  email: string;
  displayName?: string;
  companyId?: string;
  status?: 'online' | 'offline' | 'away' | 'busy';
}): Promise<string> {
  try {
    console.log('Creating user via API:', userData);
    const response = await fetch('/api/users/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...userData,
        status: userData.status || 'offline'
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Error response from API:', errorData);
      throw new Error(errorData.message || errorData.error || 'Failed to create user');
    }

    const data = await response.json();
    return data.userId;
  } catch (error) {
    console.error('API error creating user:', error);
    throw error;
  }
}

/**
 * Get user by Firebase ID via the server-side API
 */
export async function getUserByFirebaseId(firebaseUserId: string): Promise<User | null> {
  try {
    const response = await fetch(`/api/users/get-by-firebase-id?firebaseId=${firebaseUserId}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to get user');
    }

    const data = await response.json();
    return data.user;
  } catch (error) {
    console.error('API error getting user:', error);
    throw error;
  }
}

/**
 * Update user status via the server-side API
 */
export async function updateUserStatus(
  userId: string, 
  status: 'online' | 'offline' | 'away' | 'busy', 
  statusMessage?: string
): Promise<void> {
  try {
    const response = await fetch(`/api/users/update?id=${userId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        status, 
        statusMessage,
        lastActive: new Date().toISOString()
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to update user status');
    }
  } catch (error) {
    console.error('API error updating user status:', error);
    throw error;
  }
}

/**
 * Create a new company via the server-side API
 */
export async function createCompany(companyData: Omit<Company, 'id' | 'createdAt'>): Promise<string> {
  try {
    const response = await fetch('/api/companies/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(companyData),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || errorData.error || 'Failed to create company');
    }

    const data = await response.json();
    return data.companyId;
  } catch (error) {
    console.error('API error creating company:', error);
    throw error;
  }
}

/**
 * Get company by ID via the server-side API
 */
export async function getCompany(companyId: string): Promise<Company | null> {
  try {
    const response = await fetch(`/api/companies/get?id=${companyId}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to get company');
    }

    const data = await response.json();
    return data.company;
  } catch (error) {
    console.error('API error getting company:', error);
    throw error;
  }
}

/**
 * Update company details via the server-side API
 */
export async function updateCompany(companyId: string, data: Partial<Company>): Promise<void> {
  try {
    const response = await fetch(`/api/companies/update?id=${companyId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to update company');
    }
  } catch (error) {
    console.error('API error updating company:', error);
    throw error;
  }
}

/**
 * Get users by company ID via the server-side API
 */
export async function getUsersByCompany(companyId: string): Promise<User[]> {
  try {
    const response = await fetch(`/api/users/by-company?companyId=${companyId}`);
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to get users');
    }

    const data = await response.json();
    return data.users;
  } catch (error) {
    console.error('API error getting users by company:', error);
    throw error;
  }
}
