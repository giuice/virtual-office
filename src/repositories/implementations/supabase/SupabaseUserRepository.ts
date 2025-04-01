// src/repositories/implementations/supabase/SupabaseUserRepository.ts
import { supabase } from '@/lib/supabase/client';
import { IUserRepository } from '@/repositories/interfaces/IUserRepository';
import { User } from '@/types/database';

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
    return data as User | null;
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
    return data as User | null;
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
    return data as User | null;
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
    return (data as User[]) || [];
  }

  // Note: The input type matches the interface.
  // Supabase handles default values (like created_at) if defined in the schema.
  // Ensure the input `userData` aligns with the table columns (snake_case).
  async create(userData: Omit<User, 'id' | 'createdAt' | 'lastActive'>): Promise<User> {
     // Map camelCase fields from User type to snake_case for DB if necessary
     const dbData = {
        company_id: userData.companyId,
        email: userData.email,
        display_name: userData.displayName,
        avatar_url: userData.avatarUrl,
        status: userData.status,
        status_message: userData.statusMessage,
        preferences: userData.preferences,
        role: userData.role,
        // firebase_uid might be set separately or during auth linking
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
    // Map snake_case from DB back to camelCase for User type if necessary
    // For simplicity, assuming direct mapping works or types/schema match casing
    return data as User;
  }

  async update(id: string, updates: Partial<User>): Promise<User | null> {
     // Map camelCase fields from User type to snake_case for DB if necessary
     // Exclude fields that shouldn't be updated directly (id, createdAt)
     const { id: _, createdAt: __, companyId, displayName, avatarUrl, statusMessage, lastActive, ...restUpdates } = updates;
     const dbUpdates: Record<string, any> = { ...restUpdates }; // Start with fields that match casing

     if (companyId !== undefined) dbUpdates.company_id = companyId;
     if (displayName !== undefined) dbUpdates.display_name = displayName;
     if (avatarUrl !== undefined) dbUpdates.avatar_url = avatarUrl;
     if (statusMessage !== undefined) dbUpdates.status_message = statusMessage;
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
    // Map snake_case from DB back to camelCase for User type if necessary
    return data as User | null; // Returns null if row wasn't found to update
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

}