// src/repositories/implementations/supabase/SupabaseSpaceRepository.ts
import { supabase } from '@/lib/supabase/client';
import { ISpaceRepository } from '@/repositories/interfaces/ISpaceRepository';
import { Space } from '@/types/database';
import { PaginationOptions, PaginatedResult } from '@/types/common'; // Assuming common types exist

export class SupabaseSpaceRepository implements ISpaceRepository {
  private TABLE_NAME = 'spaces'; // Ensure this matches your Supabase table name

  async findById(id: string): Promise<Space | null> {
    const { data, error } = await supabase
      .from(this.TABLE_NAME)
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching space by ID:', error);
      throw error;
    }
    // TODO: Map DB response (snake_case) to Space type (camelCase) if needed
    return data as Space | null;
  }

  async findByCompany(companyId: string, options?: PaginationOptions): Promise<Space[]> {
     // Basic implementation without pagination for now
     // TODO: Implement proper pagination using options.limit and options.cursor with .range()
    const { data, error } = await supabase
      .from(this.TABLE_NAME)
      .select('*')
      .eq('company_id', companyId); // Assuming snake_case

    if (error) {
      console.error('Error fetching spaces by company:', error);
      throw error;
    }
    // TODO: Map DB response array if needed
    return (data as Space[]) || [];
  }

  async create(spaceData: Omit<Space, 'id' | 'createdAt' | 'updatedAt'>): Promise<Space> {
    // TODO: Map Space type (camelCase) to DB schema (snake_case) if needed
    const dbData = {
        company_id: spaceData.companyId,
        name: spaceData.name,
        type: spaceData.type,
        status: spaceData.status,
        capacity: spaceData.capacity,
        features: spaceData.features,
        position: spaceData.position,
        user_ids: spaceData.userIds, // Assuming snake_case
        description: spaceData.description,
        access_control: spaceData.accessControl, // Assuming snake_case
        reservations: spaceData.reservations,
        created_by: spaceData.createdBy, // Assuming snake_case
        is_template: spaceData.isTemplate, // Assuming snake_case
        template_name: spaceData.templateName, // Assuming snake_case
        // created_at and updated_at handled by Supabase default value/triggers
    };
    const { data, error } = await supabase
      .from(this.TABLE_NAME)
      .insert(dbData)
      .select()
      .single();

    if (error || !data) {
      console.error('Error creating space:', error);
      throw error || new Error('Failed to create space or retrieve created data.');
    }
    // TODO: Map DB response back to Space type if needed
    return data as Space;
  }

  async update(id: string, updates: Partial<Omit<Space, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Space | null> {
    // TODO: Map Space type (camelCase) to DB schema (snake_case) if needed
    const { companyId, userIds, accessControl, createdBy, isTemplate, templateName, ...restUpdates } = updates;
    const dbUpdates: Record<string, any> = { ...restUpdates };
    if (companyId !== undefined) dbUpdates.company_id = companyId;
    if (userIds !== undefined) dbUpdates.user_ids = userIds;
    if (accessControl !== undefined) dbUpdates.access_control = accessControl;
    if (createdBy !== undefined) dbUpdates.created_by = createdBy;
    if (isTemplate !== undefined) dbUpdates.is_template = isTemplate;
    if (templateName !== undefined) dbUpdates.template_name = templateName;
    // updated_at should be handled by Supabase trigger ideally

    const { data, error } = await supabase
      .from(this.TABLE_NAME)
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating space:', error);
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    // TODO: Map DB response back to Space type if needed
    return data as Space | null;
  }

  async updateUsers(id: string, userIds: string[]): Promise<Space | null> {
    // Directly call update with the specific field mapped to snake_case
    return this.update(id, { userIds: userIds });
  }

  async deleteById(id: string): Promise<boolean> {
    const { error, count } = await supabase
      .from(this.TABLE_NAME)
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting space:', error);
      return false;
    }
    return (count ?? 0) > 0;
  }

  // Implement other methods defined in ISpaceRepository if any...
}