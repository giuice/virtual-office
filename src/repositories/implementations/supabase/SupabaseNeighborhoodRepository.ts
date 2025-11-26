// src/repositories/implementations/supabase/SupabaseNeighborhoodRepository.ts
import { INeighborhoodRepository } from '@/repositories/interfaces/INeighborhoodRepository';
import { Neighborhood, CreateNeighborhoodData, UpdateNeighborhoodData } from '@/types/database';
import type { SupabaseClient } from '@supabase/supabase-js';

type NeighborhoodRow = {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  color: string;
  created_at: string;
  updated_at: string;
};

function mapToCamelCase(data: NeighborhoodRow): Neighborhood {
  return {
    id: data.id,
    company_id: data.company_id,
    name: data.name,
    description: data.description ?? undefined,
    color: data.color,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

export class SupabaseNeighborhoodRepository implements INeighborhoodRepository {
  private TABLE_NAME = 'neighborhoods';
  private supabase: SupabaseClient;

  constructor(supabaseClient: SupabaseClient) {
    this.supabase = supabaseClient;
  }

  async getByCompanyId(companyId: string): Promise<Neighborhood[]> {
    const { data, error } = await this.supabase
      .from(this.TABLE_NAME)
      .select('*')
      .eq('company_id', companyId)
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching neighborhoods by company:', error);
      throw error;
    }

    return (data || []).map(mapToCamelCase);
  }

  async getById(id: string): Promise<Neighborhood | null> {
    const { data, error } = await this.supabase
      .from(this.TABLE_NAME)
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching neighborhood by ID:', error);
      throw error;
    }

    return data ? mapToCamelCase(data) : null;
  }

  async create(companyId: string, data: CreateNeighborhoodData): Promise<Neighborhood> {
    const dbData = {
      company_id: companyId,
      name: data.name,
      description: data.description ?? null,
      color: data.color ?? '--vo-neighborhood-1',
    };

    const { data: created, error } = await this.supabase
      .from(this.TABLE_NAME)
      .insert(dbData)
      .select()
      .single();

    if (error || !created) {
      console.error('Error creating neighborhood:', error);
      throw error || new Error('Failed to create neighborhood or retrieve created data.');
    }

    return mapToCamelCase(created);
  }

  async update(id: string, data: UpdateNeighborhoodData): Promise<Neighborhood | null> {
    const dbUpdates: Partial<{
      name: string;
      description: string | null;
      color: string;
    }> = {};

    if (data.name !== undefined) dbUpdates.name = data.name;
    if (data.description !== undefined) dbUpdates.description = data.description ?? null;
    if (data.color !== undefined) dbUpdates.color = data.color;

    const { data: updated, error } = await this.supabase
      .from(this.TABLE_NAME)
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating neighborhood:', error);
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return updated ? mapToCamelCase(updated) : null;
  }

  async delete(id: string): Promise<boolean> {
    const { error, count } = await this.supabase
      .from(this.TABLE_NAME)
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting neighborhood:', error);
      return false;
    }

    return (count ?? 0) > 0 || !error;
  }

  async getSpaceCount(neighborhoodId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('spaces')
      .select('*', { count: 'exact', head: true })
      .eq('neighborhood_id', neighborhoodId);

    if (error) {
      console.error('Error getting space count for neighborhood:', error);
      throw error;
    }

    return count ?? 0;
  }
}
