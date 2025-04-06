// src/repositories/implementations/supabase/SupabaseUserRepository.ts
import { supabase } from '@/lib/supabase/client';
import { IUserRepository } from '@/repositories/interfaces/IUserRepository';
import { User, UserRole, UserStatus, TimeStampType } from '@/types/database'; // Import necessary types

// Helper function to map DB snake_case to TS camelCase
function mapToCamelCase(data: any): User {
  if (!data) return data;
  return {
    id: data.id,
    companyId: data.company_id,
    firebase_uid: data.firebase_uid, // Keep snake_case if type uses it, or map if needed
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

  async findByFirebaseUid(firebaseUid: string): Promise<User | null> {
     // Ensure your 'users' table has a 'firebase_uid' column
     const { data, error } = await supabase
      .from(this.TABLE_NAME)
      .select('*')
      .eq('firebase_uid', firebaseUid)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching user by Firebase UID:', error);
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
        firebase_uid: userData.firebase_uid, // Assuming type has firebase_uid
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
     const { companyId, displayName, avatarUrl, statusMessage, firebase_uid, ...restUpdates } = updates; // email, status, preferences, role
     const dbUpdates: Record<string, any> = { ...restUpdates };

     if (companyId !== undefined) dbUpdates.company_id = companyId;
     if (displayName !== undefined) dbUpdates.display_name = displayName;
     if (avatarUrl !== undefined) dbUpdates.avatar_url = avatarUrl;
     if (statusMessage !== undefined) dbUpdates.status_message = statusMessage;
     if (firebase_uid !== undefined) dbUpdates.firebase_uid = firebase_uid; // Allow updating firebase_uid if needed
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
    const { data, error } = await supabase
      .from(this.TABLE_NAME)
      .update({
        current_space_id: spaceId,
        last_active: new Date().toISOString() // Update last_active when location changes
      })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      console.error('Error updating user location:', error);
      if (error.code === 'PGRST116') return null; // Row not found
      throw error;
    }

    return data ? mapToCamelCase(data) : null;
  }

  async findAll(): Promise<User[]> {
    const { data, error } = await supabase
      .from(this.TABLE_NAME)
      .select('*');

    if (error) {
      console.error('Error fetching all users:', error);
      throw error;
    }

    return mapArrayToCamelCase(data || []);
  }
}
