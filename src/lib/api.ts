// src/lib/api.ts
// Client-side API functions for interacting with server-side endpoints

import { Company, User, UserRole, Space } from '@/types/database'; // Added Space

/**
 * Create a new user in the database via the server-side API
 */
export async function createUser(userData: {
  firebase_uid: string; // Changed from id to firebase_uid
  email: string;
  displayName?: string;
  // Removed companyId - not needed for initial user creation
  companyId?: string; // Optional, can be set later
  status?: 'online' | 'offline' | 'away' | 'busy';
}): Promise<User> { // Changed return type to User based on API response
  try {
    console.log('Creating user via API:', userData);
    const response = await fetch('/api/users/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      // Explicitly map fields to match API expectations
      body: JSON.stringify({
        firebase_uid: userData.firebase_uid,
        email: userData.email,
        displayName: userData.displayName,
        status: userData.status || 'offline',
        companyId: userData?.companyId, // Optional, can be set later
        // companyId is intentionally omitted
      }),
    });

    if (!response.ok) {
      const errorData = await response.json(); // Keep this line
      throw new Error(errorData.error || 'Failed to create user'); // Throw error
    }

    const result = await response.json();
    if (!result.success || !result.user) {
      throw new Error(result.message || 'API reported failure in creating user');
    }
    return result.user; // Return the created user object
    // Erroneous lines removed here
  } catch (error) {
    console.error('API error creating user:', error);
    throw error;
  }
}

/**
 * Get spaces by company ID via the server-side API
 */
export async function getSpacesByCompany(companyId: string): Promise<Space[]> {
  try {
    const response = await fetch(`/api/spaces/get?companyId=${companyId}`);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to get spaces');
    }

    const data = await response.json();
    // Ensure users array exists, even if empty
    return data.spaces.map((space: any) => ({
      ...space,
      users: space.users || [] 
    }));
  } catch (error) {
    console.error('API error getting spaces by company:', error);
    throw error;
  }
}

/**
 * Get user by Firebase ID via the server-side API
 */
export async function getUserByFirebaseId(firebaseUserId: string, retries = 3): Promise<User | null> {
  console.log(`Fetching user profile for Firebase UID: ${firebaseUserId}`);
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`/api/users/get-by-firebase-id?firebaseId=${firebaseUserId}`);
      
      // Log complete response status and headers for debugging
      console.log(`API Response Status: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          console.log(`User not found for Firebase UID: ${firebaseUserId}`);
          return null;
        }
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to get user');
      }

      // Clone and parse the response for debugging
      const clonedResponse = response.clone();
      const rawData = await clonedResponse.text();
      console.log(`Raw API response for ${firebaseUserId}:`, rawData);
      
      const data = await response.json();
      console.log(`Parsed API response for ${firebaseUserId}:`, data);
      
      // Extra validation to ensure we have a proper user object
      if (!data.user) {
        console.error("No user data in API response:", data);
        throw new Error("Missing user data in API response");
      }
      
      if (!data.user.id) {
        console.error("Invalid user data returned from API - missing ID:", data.user);
        throw new Error("Invalid user data structure returned from API - missing ID");
      }
      
      // Additional validation for company association
      if (data.user.companyId) {
        console.log(`User ${firebaseUserId} has company association: ${data.user.companyId}`);
      } else {
        console.log(`User ${firebaseUserId} has NO company association in returned data`);
        
        // Check for mapping issues between snake_case and camelCase
        if (data.user.company_id) {
          console.log(`Found company_id (${data.user.company_id}) instead of companyId - fixing mapping issue`);
          data.user.companyId = data.user.company_id;
        }
      }
      
      console.log("User data successfully retrieved and validated:", data.user);
      return data.user;
    } catch (error) {
      console.error(`API error getting user (attempt ${attempt + 1}/${retries + 1}):`, error);
      if (attempt === retries) {
        throw error;
      }
      // Wait before retrying (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 300));
    }
  }
  return null;
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
// Updated signature to accept specific fields needed by the API route
export async function createCompany(
  name: string,
  creatorFirebaseUid: string,
  settings?: Partial<Company['settings']> // Optional settings
): Promise<Company> { // Return the full Company object
  try {
    const response = await fetch('/api/companies/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      // Send the body structure expected by the API route
      body: JSON.stringify({ name, creatorFirebaseUid, settings }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || errorData.error || 'Failed to create company');
    }

    const result = await response.json();
    if (!result.success || !result.company) {
      throw new Error(result.message || 'API reported failure in creating company');
    }
    return result.company; // Return the full company object from the API response
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

/**
 * Clean up duplicate companies for a user
 */
export async function cleanupDuplicateCompanies(userId: string): Promise<{
  keptCompanyId?: string;
  totalRemoved: number;
}> {
  try {
    const response = await fetch('/api/companies/cleanup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to clean up companies');
    }

    const data = await response.json();
    return {
      keptCompanyId: data.keptCompanyId,
      totalRemoved: data.totalRemoved || 0,
    };
  } catch (error) {
    console.error('API error cleaning up companies:', error);
    // Don't throw error here, just return 0 removed
    return { totalRemoved: 0 };
  }
}

/**
 * Update a user's role
 */
export async function updateUserRole(userId: string, role: UserRole): Promise<void> {
  try {
    const response = await fetch(`/api/users/update?id=${userId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to update user role');
    }
  } catch (error) {
    console.error('API error updating user role:', error);
    throw error;
  }
}

/**
 * Remove a user from a company
 */
export async function removeUserFromCompany(userId: string, companyId: string): Promise<void> {
  try {
    const response = await fetch(`/api/users/remove-from-company`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId, companyId }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to remove user from company');
    }
  } catch (error) {
    console.error('API error removing user from company:', error);
    throw error;
  }
}
