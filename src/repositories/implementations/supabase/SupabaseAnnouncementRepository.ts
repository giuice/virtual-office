// src/repositories/implementations/supabase/SupabaseAnnouncementRepository.ts
import { supabase } from '@/lib/supabase/client';
import { IAnnouncementRepository } from '@/repositories/interfaces/IAnnouncementRepository';
import { Announcement, TimeStampType } from '@/types/database'; // Import TimeStampType if needed
import { PaginationOptions, PaginatedResult } from '@/types/common';

// Helper function to map DB snake_case to TS camelCase
function mapToCamelCase(data: any): Announcement {
  if (!data) return data;
  return {
    id: data.id,
    companyId: data.company_id,
    title: data.title,
    content: data.content,
    postedBy: data.posted_by,
    timestamp: data.timestamp, // Assuming TimeStampType compatibility
    expiration: data.expiration,
    priority: data.priority
  };
}

// Helper function to map an array
function mapArrayToCamelCase(dataArray: any[]): Announcement[] {
  if (!dataArray) return [];
  return dataArray.map(item => mapToCamelCase(item));
}


export class SupabaseAnnouncementRepository implements IAnnouncementRepository {
  private TABLE_NAME = 'announcements'; // Ensure this matches your Supabase table name

  async findById(id: string): Promise<Announcement | null> {
    const { data, error } = await supabase
      .from(this.TABLE_NAME)
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching announcement by ID:', error);
      throw error;
    }
    // Map DB response (snake_case) to Announcement type (camelCase)
    return data ? mapToCamelCase(data) : null;
  }

  async findByCompany(companyId: string, options?: PaginationOptions): Promise<PaginatedResult<Announcement>> {
    const limit = options?.limit ?? 10; // Default limit
    const from = typeof options?.cursor === 'number' ? options.cursor : 0;
    const to = from + limit - 1;

    // Query announcements for the company, ordered by timestamp descending
    const { data, error, count } = await supabase
      .from(this.TABLE_NAME)
      .select('*', { count: 'exact' })
      .eq('company_id', companyId) // Assuming snake_case
      .order('timestamp', { ascending: false })
      .range(from, to);

    if (error) {
      console.error('Error fetching announcements by company:', error);
      throw error;
    }

    // Map DB response array
    const items = mapArrayToCamelCase(data || []);
    const nextCursor = items.length === limit ? to + 1 : null;

    return {
      items: items,
      nextCursor: nextCursor,
      hasMore: nextCursor !== null,
      totalCount: count ?? undefined,
    };
  }

  async create(announcementData: Omit<Announcement, 'id' | 'timestamp'>): Promise<Announcement> {
    // Map Announcement type (camelCase) to DB schema (snake_case)
    const dbData = {
        company_id: announcementData.companyId,
        title: announcementData.title,
        content: announcementData.content,
        posted_by: announcementData.postedBy,
        expiration: announcementData.expiration,
        priority: announcementData.priority,
        // timestamp handled by Supabase default value
    };

    const { data, error } = await supabase
      .from(this.TABLE_NAME)
      .insert(dbData)
      .select()
      .single();

    if (error || !data) {
      console.error('Error creating announcement:', error);
      throw error || new Error('Failed to create announcement or retrieve created data.');
    }
    // Map DB response back to Announcement type
    return mapToCamelCase(data);
  }

  // Note: companyId cannot be updated. postedBy is the correct field to map.
  async update(id: string, updates: Partial<Omit<Announcement, 'id' | 'timestamp' | 'companyId'>>): Promise<Announcement | null> {
     // Map updates from camelCase to snake_case
     const { postedBy, ...restUpdates } = updates; // title, content, expiration, priority
     const dbUpdates: Record<string, any> = { ...restUpdates };
     if (postedBy !== undefined) dbUpdates.posted_by = postedBy;

    const { data, error } = await supabase
      .from(this.TABLE_NAME)
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating announcement:', error);
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    // Map DB response back to Announcement type
    return data ? mapToCamelCase(data) : null;
  }

  async deleteById(id: string): Promise<boolean> {
    const { error, count } = await supabase
      .from(this.TABLE_NAME)
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting announcement:', error);
      return false;
    }
    return (count ?? 0) > 0;
  }

}
