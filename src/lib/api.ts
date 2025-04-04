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

    // Handle both success and conflict (user already exists) responses
    if (response.ok || response.status === 409) {
      const result = await response.json();
      
      // If the API returned a user object, use it
      if (result.user) {
        return result.user;
      }
      
      // If there was a conflict (user already exists), try to get the user by Firebase ID
      if (response.status === 409) {
        console.log('User already exists, fetching by Firebase ID');
        const existingUser = await getUserByFirebaseId(userData.firebase_uid);
        if (existingUser) {
          return existingUser;
        }
        // If we couldn't get the user by Firebase ID, try by email
        // This is a fallback and might not be needed in most cases
        throw new Error('User exists but could not be retrieved');
      }
      
      throw new Error(result.message || 'API reported failure in creating user');
    }

    // Handle other error responses
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to create user');
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
    const response = await fetch(`/api/spaces?companyId=${companyId}`);

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

  // Check if firebaseUserId is valid
  if (!firebaseUserId) {
    console.error('Invalid Firebase UID: empty or undefined');
    return null;
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Add timeout to fetch request using AbortController
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout (increased)

      console.log(`Attempting to fetch user (attempt ${attempt + 1}/${retries + 1})`);

      // Use a more reliable URL construction
      const url = new URL('/api/users/get-by-firebase-id', window.location.origin);
      url.searchParams.append('firebaseId', firebaseUserId);

      const response = await fetch(url.toString(), {
        signal: controller.signal,
        // Add cache control to prevent caching issues
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      }).finally(() => clearTimeout(timeoutId));

      // Log complete response status and headers for debugging
      console.log(`API Response Status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        if (response.status === 404) {
          console.log(`User not found for Firebase UID: ${firebaseUserId}`);
          return null;
        }
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to get user: ${response.status} ${response.statusText}`);
      }

      // Clone and parse the response for debugging
      const clonedResponse = response.clone();
      const rawData = await clonedResponse.text();
      console.log(`Raw API response for ${firebaseUserId}:`, rawData);

      // Check if response is empty
      if (!rawData || rawData.trim() === '') {
        console.error('Empty response received from API');
        throw new Error('Empty response received from API');
      }

      // Try to parse the response as JSON
      let data;
      try {
        data = await response.json();
      } catch (parseError: any) { // Type assertion for error handling
        console.error('Failed to parse API response as JSON:', parseError);
        throw new Error(`Failed to parse API response: ${parseError?.message || 'Invalid JSON'}`);
      }

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

      // Cache the user data for future fallback
      try {
        localStorage.setItem(`user_${firebaseUserId}`, JSON.stringify(data.user));
      } catch (cacheError) {
        console.warn('Failed to cache user data:', cacheError);
        // Non-critical error, continue without caching
      }

      return data.user;
    } catch (error: any) { // Type assertion to any for error handling
      // Check if the error is due to timeout or network issues
      const isNetworkError = error instanceof TypeError &&
        typeof error.message === 'string' && (
          error.message.includes('Failed to fetch') ||
          error.message.includes('NetworkError') ||
          error.message.includes('Network request failed')
        );

      const isTimeoutError = error && typeof error.name === 'string' && error.name === 'AbortError';

      if (isNetworkError || isTimeoutError) {
        console.warn(`Network or timeout error (attempt ${attempt + 1}/${retries + 1}): ${error?.message || 'Unknown error'}`);
        // Check if we're in development mode and suggest checking environment variables
        if (process.env.NODE_ENV === 'development') {
          console.warn('This might be due to missing environment variables for Supabase. Check your .env.local file.');
        }
      } else {
        console.error(`API error getting user (attempt ${attempt + 1}/${retries + 1}):`, error);
      }

      if (attempt === retries) {
        // On final attempt, try to return a cached user if available
        const cachedUser = tryGetCachedUser(firebaseUserId);
        if (cachedUser) {
          console.log('Returning cached user data as fallback');
          return cachedUser;
        }
        throw error;
      }

      // Wait before retrying (exponential backoff with jitter)
      const jitter = Math.random() * 300;
      const backoffTime = Math.pow(2, attempt) * 500 + jitter; // Increased backoff time with jitter
      console.log(`Retrying in ${Math.round(backoffTime)}ms...`);
      await new Promise(resolve => setTimeout(resolve, backoffTime));
    }
  }
  return null;
}

// Helper function to try to get cached user data
function tryGetCachedUser(firebaseUserId: string): User | null {
  try {
    const cachedData = localStorage.getItem(`user_${firebaseUserId}`);
    if (cachedData) {
      const userData = JSON.parse(cachedData);
      // Validate the cached data has minimum required fields
      if (userData && userData.id && userData.firebase_uid) {
        return userData;
      }
    }
  } catch (e) {
    console.warn('Failed to retrieve cached user data:', e);
  }
  return null;
}

/**
 * Get user by database ID via the server-side API
 */
export async function getUserById(userId: string, retries = 3): Promise<User | null> {
  console.log(`Fetching user profile for Database ID: ${userId}`);

  // Check if userId is valid
  if (!userId) {
    console.error('Invalid User ID: empty or undefined');
    return null;
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Add timeout to fetch request using AbortController
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

      console.log(`Attempting to fetch user by ID (attempt ${attempt + 1}/${retries + 1})`);

      // Use a more reliable URL construction
      const url = new URL('/api/users/get', window.location.origin);
      url.searchParams.append('id', userId);

      const response = await fetch(url.toString(), {
        signal: controller.signal,
        // Add cache control to prevent caching issues
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      }).finally(() => clearTimeout(timeoutId));

      // Log complete response status and headers for debugging
      console.log(`API Response Status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        if (response.status === 404) {
          console.log(`User not found for ID: ${userId}`);
          return null;
        }
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      if (!data.success || !data.user) {
        console.log(`API returned success=false or missing user data for ID: ${userId}`);
        return null;
      }

      console.log(`Successfully fetched user for ID: ${userId}`);
      return data.user;
    } catch (error) {
      console.error(`Error fetching user by ID (attempt ${attempt + 1}/${retries + 1}):`, error);
      
      // If this is the last retry, return null
      if (attempt === retries) {
        console.error(`All ${retries + 1} attempts to fetch user failed.`);
        return null;
      }
      
      // Wait before retrying (exponential backoff)
      const waitTime = Math.min(1000 * Math.pow(2, attempt), 10000);
      console.log(`Waiting ${waitTime}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  return null; // This should never be reached due to the return in the last retry
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
