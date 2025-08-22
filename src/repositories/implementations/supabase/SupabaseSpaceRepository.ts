// src/repositories/implementations/supabase/SupabaseSpaceRepository.ts
import { supabase } from '@/lib/supabase/client';
import { ISpaceRepository } from '@/repositories/interfaces/ISpaceRepository';
import { Space } from '@/types/database';
import { PaginationOptions, PaginatedResult } from '@/types/common';

function mapToCamelCase(data: any): Space {
  if (!data) return data;
  
 
  
  return {
    id: data.id,
    companyId: data.company_id,
    name: data.name,
    type: data.type,
    status: data.status,
    capacity: data.capacity,
    features: data.features ? [...data.features] : [], // Also copy features array
    position: data.position,

    description: data.description,
    accessControl: data.access_control,
    createdBy: data.created_by,
    isTemplate: data.is_template,
    templateName: data.template_name,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  } as Space;
}

function mapArrayToCamelCase(dataArray: any[]): Space[] {
  if (!dataArray) return [];
  return dataArray.map(item => mapToCamelCase(item));
}

export class SupabaseSpaceRepository implements ISpaceRepository {
  private TABLE_NAME = 'spaces';

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
    
    return data ? mapToCamelCase(data) : null;
  }

  async findByCompany(companyId: string, options?: PaginationOptions): Promise<Space[]> {
    console.log(`Fetching spaces for company ID: ${companyId}`);
    
    const { data, error } = await supabase
      .from(this.TABLE_NAME)
      .select('*')
      .eq('company_id', companyId);

    if (error) {
      console.error('Error fetching spaces by company:', error);
      throw error;
    }
    
    // Log raw data from Supabase to see what we're actually getting
    console.log('Raw Supabase spaces data:', JSON.stringify(data, null, 2));
    
    if (!data || data.length === 0) {
      console.log('No spaces found for this company');
      return [];
    }

    // Process each space individually to ensure proper data mapping
    const spaces = data.map(spaceData => {
      const mappedSpace = mapToCamelCase(
        spaceData
      );
      return mappedSpace;
    });
    
    return spaces;
  }

  async create(spaceData: Omit<Space, 'id' | 'createdAt' | 'updatedAt'>): Promise<Space> {
    // Map Space type (camelCase) to DB schema (snake_case)
    const dbData = {
        company_id: spaceData.companyId,
        name: spaceData.name,
        type: spaceData.type,
        status: spaceData.status,
        capacity: spaceData.capacity,
        features: spaceData.features,
        position: spaceData.position,
        description: spaceData.description,
        access_control: spaceData.accessControl,
        created_by: spaceData.createdBy,
        is_template: spaceData.isTemplate,
        template_name: spaceData.templateName
        // NOTE: removed reservations as it's handled by space_reservations table
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
    
    return mapToCamelCase(data);
  }

  async update(id: string, updates: Partial<Omit<Space, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Space | null> {
    // Map Space type (camelCase) to DB schema (snake_case)
    const { companyId, accessControl, createdBy, isTemplate, templateName, ...restUpdates } = updates;
    const dbUpdates: Record<string, any> = { ...restUpdates };
    if (companyId !== undefined) dbUpdates.company_id = companyId;
    if (accessControl !== undefined) dbUpdates.access_control = accessControl;
    if (createdBy !== undefined) dbUpdates.created_by = createdBy;
    if (isTemplate !== undefined) dbUpdates.is_template = isTemplate;
    if (templateName !== undefined) dbUpdates.template_name = templateName;

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
    
    return data ? mapToCamelCase(data) : null;
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
}