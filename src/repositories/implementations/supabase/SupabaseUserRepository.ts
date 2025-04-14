// src/repositories/implementations/supabase/SupabaseUserRepository.ts
import { supabase } from '@/lib/supabase/client';
import { IUserRepository } from '@/repositories/interfaces/IUserRepository';
import { User, UserRole, UserStatus } from '@/types/database'; // Import necessary types

// Helper function to map DB snake_case to TS camelCase
function mapToCamelCase(data: any): User {
  if (!data) return data;
  return {
    id: data.id,
    companyId: data.company_id,
    supabase_uid: data.supabase_uid, // Keep snake_case if type uses it, or map if needed
    email: data.email,
    displayName: data.display_name,
    avatarUrl: data.avatar_url,
    status: data.status as UserStatus,
    statusMessage: data.status_message,
    preferences: data.preferences || {}, // Ensure object exists
    role: data.role as UserRole,
    lastActive: data.last_active, // Assuming TimeStampType compatibility
    createdAt: data.created_at,   // Assuming TimeStampType compatibility
    current_space_id: data.current_space_id // Added for user location tracking
  };
}

// Helper function to map an array
function mapArrayToCamelCase(dataArray: any[]): User[] {
  if (!dataArray) return [];
  return dataArray.map(item => mapToCamelCase(item));
}


export class SupabaseUserRepository implements IUserRepository {
  private TABLE_NAME = 'users'; // Ensure this matches your Supabase table name

  async findById(id: string): Promise<User | null> {
    const { data, error } = await supabase
      .from(this.TABLE_NAME)
      .select('*')
      .eq('id', id)
      .single(); // .single() returns one object or null

    if (error && error.code !== 'PGRST116') { // PGRST116: Row not found
      console.error('Error fetching user by ID:', error);
      throw error; // Or handle more gracefully
    }
    // Map DB response
    return data ? mapToCamelCase(data) : null;
  }

  async findBySupabaseUid(supabaseUid: string): Promise<User | null> {
    const { data, error } = await supabase
      .from(this.TABLE_NAME)
      .select('*')
      .eq('supabase_uid', supabaseUid) 
      .single(); // .single() returns one object or null

    if (error && error.code !== 'PGRST116') { // PGRST116: Row not found
      console.error('Error fetching user by ID:', error);
      throw error; // Or handle more gracefully
    }
    // Map DB response
    return data ? mapToCamelCase(data) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const { data, error } = await supabase
      .from(this.TABLE_NAME)
      .select('*')
      .eq('email', email)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching user by email:', error);
      throw error;
    }
    // Map DB response
    return data ? mapToCamelCase(data) : null;
  }

  async findByCompany(companyId: string): Promise<User[]> {
    // Ensure your 'users' table has a 'company_id' column
    const { data, error } = await supabase
      .from(this.TABLE_NAME)
      .select('*')
      .eq('company_id', companyId);

    if (error) {
      console.error('Error fetching users by company:', error);
      throw error;
    }
    // Map DB response array
    return mapArrayToCamelCase(data || []);
  }

  // Note: Input type uses camelCase, map to snake_case for DB.
  async create(userData: Omit<User, 'id' | 'createdAt' | 'lastActive'>): Promise<User> {
     // Map camelCase fields from User type to snake_case for DB
     const dbData = {
        company_id: userData.companyId,
        email: userData.email,
        display_name: userData.displayName,
        avatar_url: userData.avatarUrl,
        status: userData.status,
        status_message: userData.statusMessage,
        preferences: userData.preferences || {}, // Ensure object exists
        role: userData.role,
        supabase_uid: userData.supabase_uid, // Assuming type has supabase_uid
        // last_active and created_at handled by Supabase defaults
     };

    const { data, error } = await supabase
      .from(this.TABLE_NAME)
      .insert(dbData)
      .select()
      .single(); // Assuming insert returns the created row

    if (error || !data) {
      console.error('Error creating user:', error);
      throw error || new Error('Failed to create user or retrieve created data.');
    }
    // Map snake_case from DB back to camelCase for User type
    return mapToCamelCase(data);
  }

  async update(id: string, updates: Partial<Omit<User, 'id' | 'createdAt' | 'lastActive'>>): Promise<User | null> {
     // Map camelCase fields from User type to snake_case for DB
     // Exclude fields that shouldn't be updated directly (id, createdAt, lastActive)
     const { companyId, displayName, avatarUrl, statusMessage, supabase_uid, ...restUpdates } = updates; // email, status, preferences, role
     const dbUpdates: Record<string, any> = { ...restUpdates };

     if (companyId !== undefined) dbUpdates.company_id = companyId;
     if (displayName !== undefined) dbUpdates.display_name = displayName;
     if (avatarUrl !== undefined) dbUpdates.avatar_url = avatarUrl;
     if (statusMessage !== undefined) dbUpdates.status_message = statusMessage;
     if (supabase_uid !== undefined) dbUpdates.supabase_uid = supabase_uid; // Allow updating supabase_uid if needed
     // Update last_active automatically on any update
     dbUpdates.last_active = new Date().toISOString();


     const { data, error } = await supabase
      .from(this.TABLE_NAME)
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating user:', error);
      // Don't throw if error is just "row not found" for an update
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    // Map snake_case from DB back to camelCase for User type
    return data ? mapToCamelCase(data) : null; // Returns null if row wasn't found to update
  }

  async deleteById(id: string): Promise<boolean> {
    const { error, count } = await supabase
      .from(this.TABLE_NAME)
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting user:', error);
      return false;
    }
    // Check if any row was actually deleted
    return (count ?? 0) > 0;
  }

  async updateCompanyAssociation(userId: string, companyId: string | null): Promise<User | null> {
      // Handle null case: pass undefined if companyId is null
      return this.update(userId, { companyId: companyId === null ? undefined : companyId });
  }

  async updateLocation(userId: string, spaceId: string | null): Promise<User | null> {
    console.log(`[updateLocation] Start for user ${userId} to space ${spaceId}`);

    // 1. Call RPC 'remove_user_from_all_spaces'
    try {
        const { error: removeError } = await supabase
          .rpc('remove_user_from_all_spaces', { user_id_param: userId });
        if (removeError) {
          console.error('[updateLocation] Error from RPC remove_user_from_all_spaces:', removeError);
          // Throw a new error with a more specific message for better debugging in the API route
          throw new Error(`RPC remove_user_from_all_spaces failed: ${removeError.message}`); 
        } else {
          console.log(`[updateLocation] Successfully called RPC remove_user_from_all_spaces for user ${userId}`);
        }
    } catch (rpcCatchError) {
        console.error('[updateLocation] Exception during RPC call:', rpcCatchError);
        throw rpcCatchError; // Re-throw exception to be caught by the API route
    }
    // Steps 2 & 3 (fetching space and updating its userIds) are removed as they are redundant
    // after migrating to users.current_space_id for presence tracking.

    // 4. Update user's current_space_id
    try {
        console.log(`[updateLocation] Updating user ${userId} current_space_id to ${spaceId}`);
        const { data, error } = await supabase
          .from(this.TABLE_NAME)
          .update({
            current_space_id: spaceId,
            last_active: new Date().toISOString(),
          })
          .eq('id', userId)
          .select()
          .single();

        if (error) {
          // Handle user not found specifically
          if (error.code === 'PGRST116') {
              console.warn(`[updateLocation] User ${userId} not found when updating current_space_id. Returning null.`);
              return null; // User not found, valid case for returning null
          } else {
              // For other user update errors, log and throw
              console.error('[updateLocation] Error updating user current_space_id:', error);
              throw new Error(`Updating user current_space_id failed: ${error.message}`); 
          }
        }

        console.log(`[updateLocation] Successfully updated user ${userId} current_space_id to ${spaceId}`);
        return data ? mapToCamelCase(data) : null; // Should have data if no error
    } catch (userUpdateCatchError) {
         console.error('[updateLocation] Exception during user current_space_id update:', userUpdateCatchError);
         throw userUpdateCatchError; // Re-throw exception
    }
  }

  async updateCurrentSpace(userId: string, spaceId: string | null): Promise<User | null> {
    const { data, error } = await supabase
      .from(this.TABLE_NAME)
      .update({ current_space_id: spaceId })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      console.error('Error updating user current_space_id:', error);
      throw error;
    }
    return data ? mapToCamelCase(data) : null;
  }

  async findAll(): Promise<User[]> {
    console.log('[UserRepository] Fetching all users with avatar data');
    const { data, error } = await supabase
      .from(this.TABLE_NAME)
      .select('*');

    if (error) {
      console.error('[UserRepository] Error fetching all users:', error);
      throw error;
    }

    // Validate each user has required fields
    const validatedUsers = (data || []).map(user => {
      // Log missing critical fields
      if (!user.id || !user.email || !user.display_name) {
        console.warn('[UserRepository] User with incomplete data:', user.id || 'unknown');
      }
      
      // Ensure avatar_url exists with fallback
      if (!user.avatar_url) {
        console.log(`[UserRepository] User ${user.id} missing avatar_url, using fallback`);
      }
      
      // Return original data to be processed by mapToCamelCase
      return user;
    });
    
    // Map and return user data with avatars
    const mappedUsers = mapArrayToCamelCase(validatedUsers);
    console.log(`[UserRepository] Found ${mappedUsers.length} users with avatar data`);
    return mappedUsers;
  }
}
