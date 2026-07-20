// src/lib/api.ts
// Client-side API functions for interacting with server-side endpoints

import { Company, User, UserRole, Space } from '@/types/database'; // Added Space
import type { PresenceAvailabilityStatus } from '@/lib/presence/contracts';
import { throwApiError } from '@/lib/api/client-error';

/**
 * Ensures a user profile exists in the database for the authenticated user,
 * creating or retrieving it as necessary.
 */
export async function syncUserProfile(userData: {
  supabase_uid: string; // Renamed from supabase_uid for consistency
  email: string;
  displayName?: string;
}): Promise<User> {
  try {
    console.log('Syncing user profile via API:', userData);
    const response = await fetch('/api/users/sync-profile', { // Changed endpoint
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      // Body matches the sync-profile endpoint expectations
      body: JSON.stringify({
        supabaseUid: userData.supabase_uid, // Use consistent naming
        email: userData.email,
        displayName: userData.displayName,
      }),
    });

    // Preserve the legacy conflict-as-success path when the route returns the
    // existing user, but parse actual conflict envelopes as ApiError.
    if (response.status === 409) {
      const result = await response.clone().json().catch(() => ({}));
      if (result.user) {
        return result.user;
      }
      await throwApiError(response);
    }

    if (!response.ok) {
      await throwApiError(response);
    }

    const result = await response.json();
    if (result.user) {
      return result.user;
    }

    throw new Error(result.message || 'Failed to sync user profile');
  } catch (error) {
    console.error('Error creating user:', error);
        throw error;
  }
}

// --- Supabase Auth migration additions ---

/**
 * Get a user by Supabase UID
 */
export async function getUserById(supabase_uid: string): Promise<User | null> {
  try {
    const response = await fetch(`/api/users/get-by-id?supabase_uid=${encodeURIComponent(supabase_uid)}`);
    if (response.ok) {
      const result = await response.json();
      return result.user || null;
    }
    return null;
  } catch (error) {
    console.error('Error fetching user by id:', error);
    return null;
  }
}

/**
 * Update a user's status by database user ID
 */
/**
 * Update user status via the server-side API
  */
export async function updateOwnProfile(
  userDbId: string,
  data: {
    displayName?: string;
    status?: PresenceAvailabilityStatus;
    statusMessage?: string;
    preferences?: User['preferences'];
  },
): Promise<void> {
  try {
    const response = await fetch(`/api/users/update?id=${userDbId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      await throwApiError(response);
    }
  } catch (error) {
    console.error('API error updating user profile:', error);
    throw error;
  }
}

/**
 * Create a new company via the server-side API
 */
// Updated signature to accept specific fields needed by the API route
export async function createCompany(
  name: string,
  settings?: Partial<Company['settings']> // Optional settings
): Promise<Company> { // Return the full Company object
  try {
    const response = await fetch('/api/companies/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, settings }),
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
      await throwApiError(response);
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
      await throwApiError(response);
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
 * Note: This function's parameter `userId` should be the Database User ID (UUID)
 * if the API endpoint `/api/users/update?id=` expects the database UUID.
 * Let's assume it expects the Database User ID based on previous context.
 */
export async function updateUserRole(userDbId: string, role: UserRole): Promise<void> { // Changed parameter name
  try {
    // Assuming the API endpoint uses the database ID (UUID)
    const response = await fetch(`/api/users/update?id=${userDbId}`, { // Use database ID
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
 * Note: This function's parameter `userId` should be the Database User ID (UUID)
 * based on typical REST patterns for specific resource modification.
 */
export async function removeUserFromCompany(userDbId: string): Promise<void> { // Changed parameter name
  try {
    const response = await fetch(`/api/users/remove-from-company`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId: userDbId }), // Company is derived from the authenticated server profile.
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

/**
 * Get spaces by company ID via the server-side API
 */
export async function getSpacesByCompany(companyId: string): Promise<Space[]> {
  try {
    const response = await fetch(`/api/spaces?companyId=${companyId}`);

    if (!response.ok) {
      await throwApiError(response);
    }

    const data = (await response.json()) as { spaces: Array<Space & { users?: User[] }> };
    // Ensure users array exists, even if empty
    return data.spaces.map((space) => ({
      ...space,
      users: space.users || []
    }));
  } catch (error) {
    console.error('API error getting spaces by company:', error);
    throw error;
  }
}
