// src/repositories/implementations/supabase/SupabaseCompanyRepository.ts
import { supabase } from '@/lib/supabase/client';
import { ICompanyRepository } from '@/repositories/interfaces/ICompanyRepository';
import { Company } from '@/types/database';

export class SupabaseCompanyRepository implements ICompanyRepository {
  private TABLE_NAME = 'companies'; // Ensure this matches your Supabase table name

  async findById(id: string): Promise<Company | null> {
    const { data, error } = await supabase
      .from(this.TABLE_NAME)
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116: Row not found
      console.error('Error fetching company by ID:', error);
      throw error;
    }
    // TODO: Map DB response (snake_case) to Company type (camelCase) if needed
    return data as Company | null;
  }

  async create(companyData: Omit<Company, 'id' | 'createdAt'>): Promise<Company> {
    // TODO: Map Company type (camelCase) to DB schema (snake_case) if needed
    const dbData = {
        name: companyData.name,
        admin_ids: companyData.adminIds, // Assuming snake_case in DB
        settings: companyData.settings,
        // created_at is handled by Supabase default value
    };

    const { data, error } = await supabase
      .from(this.TABLE_NAME)
      .insert(dbData)
      .select()
      .single();

    if (error || !data) {
      console.error('Error creating company:', error);
      throw error || new Error('Failed to create company or retrieve created data.');
    }
    // TODO: Map DB response (snake_case) back to Company type (camelCase) if needed
    return data as Company;
  }

  async update(id: string, updates: Partial<Omit<Company, 'id' | 'createdAt'>>): Promise<Company | null> {
    // TODO: Map Company type (camelCase) to DB schema (snake_case) if needed
    const { adminIds, ...restUpdates } = updates;
    const dbUpdates: Record<string, any> = { ...restUpdates };
    if (adminIds !== undefined) dbUpdates.admin_ids = adminIds;

    const { data, error } = await supabase
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
    // TODO: Map DB response (snake_case) back to Company type (camelCase) if needed
    return data as Company | null;
  }

  async deleteById(id: string): Promise<boolean> {
    const { error, count } = await supabase
      .from(this.TABLE_NAME)
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting company:', error);
      return false;
    }
    return (count ?? 0) > 0;
  }

  // Implement other methods defined in ICompanyRepository if any...
}