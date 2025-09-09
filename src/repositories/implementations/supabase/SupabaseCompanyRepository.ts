// src/repositories/implementations/supabase/SupabaseCompanyRepository.ts
import { ICompanyRepository } from '@/repositories/interfaces/ICompanyRepository';
import { Company, TimeStampType } from '@/types/database'; // Import TimeStampType if needed
import type { SupabaseClient } from '@supabase/supabase-js';

// Helper function to map DB snake_case to TS camelCase
function mapToCamelCase(data: any): Company {
  if (!data) return data;
  return {
    id: data.id,
    name: data.name,
    adminIds: data.admin_ids || [], // Ensure array exists
    createdAt: data.created_at, // Assuming TimeStampType compatibility
    settings: data.settings || {} // Ensure object exists
  };
}

// Helper function to map an array
function mapArrayToCamelCase(dataArray: any[]): Company[] {
  if (!dataArray) return [];
  return dataArray.map(item => mapToCamelCase(item));
}


export class SupabaseCompanyRepository implements ICompanyRepository {
  private TABLE_NAME = 'companies'; // Ensure this matches your Supabase table name
  private supabase: SupabaseClient;

  constructor(supabaseClient: SupabaseClient) {
    this.supabase = supabaseClient;
  }

  async findById(id: string): Promise<Company | null> {
    const { data, error } = await this.supabase
      .from(this.TABLE_NAME)
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116: Row not found
      console.error('Error fetching company by ID:', error);
      throw error;
    }
    // Map DB response (snake_case) to Company type (camelCase)
    return data ? mapToCamelCase(data) : null;
  }

  async create(companyData: Omit<Company, 'id' | 'createdAt'>): Promise<Company> {
    // Map Company type (camelCase) to DB schema (snake_case)
    const dbData = {
        name: companyData.name,
        admin_ids: companyData.adminIds || [], // Ensure array exists
        settings: companyData.settings || {}, // Ensure object exists
        // created_at is handled by Supabase default value
    };

    const { data, error } = await this.supabase
      .from(this.TABLE_NAME)
      .insert(dbData)
      .select()
      .single();

    if (error || !data) {
      console.error('Error creating company:', error);
      throw error || new Error('Failed to create company or retrieve created data.');
    }
    // Map DB response (snake_case) back to Company type (camelCase)
    return mapToCamelCase(data);
  }

  async update(id: string, updates: Partial<Omit<Company, 'id' | 'createdAt'>>): Promise<Company | null> {
    // Map Company type (camelCase) to DB schema (snake_case)
    const { adminIds, settings, ...restUpdates } = updates; // name
    const dbUpdates: Record<string, any> = { ...restUpdates };
    if (adminIds !== undefined) dbUpdates.admin_ids = adminIds;
    if (settings !== undefined) dbUpdates.settings = settings;

    const { data, error } = await this.supabase
      .from(this.TABLE_NAME)
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating company:', error);
      if (error.code === 'PGRST116') return null; // Row not found is not an error for update
      throw error;
    }
    // Map DB response (snake_case) back to Company type (camelCase)
    return data ? mapToCamelCase(data) : null;
  }

  async deleteById(id: string): Promise<boolean> {
    const { error, count } = await this.supabase
      .from(this.TABLE_NAME)
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting company:', error);
      return false;
    }
    return (count ?? 0) > 0;
  }

  async findByUserId(userId: string): Promise<Company | null> {
    const { data, error } = await this.supabase
      .from(this.TABLE_NAME)
      .select('*')
      .contains('admin_ids', [userId]) // Check if admin_ids array contains the userId
      .maybeSingle(); // Use maybeSingle() as a user might not be an admin of any company

    if (error) {
      console.error('Error fetching company by user ID:', error);
      // Don't throw an error if simply not found, but do for other errors
      if (error.code !== 'PGRST116') { // PGRST116: Row not found (though maybeSingle handles this)
          throw error;
      }
    }
    // Map DB response (snake_case) to Company type (camelCase)
    return data ? mapToCamelCase(data) : null;
  }

  async findAllByUserId(userId: string): Promise<Company[]> {
    const { data, error } = await this.supabase
      .from(this.TABLE_NAME)
      .select('*')
      .contains('admin_ids', [userId]); // Find all companies where admin_ids array contains the userId

    if (error) {
      console.error('Error fetching companies by user ID:', error);
      throw error;
    }
    // Map DB response (snake_case) to Company type (camelCase)
    return mapArrayToCamelCase(data || []);
  }


  // Implement other methods defined in ICompanyRepository if any...
}
