// src/repositories/implementations/supabase/SupabaseAnnouncementRepository.ts
import { supabase } from '@/lib/supabase/client';
import { IAnnouncementRepository } from '@/repositories/interfaces/IAnnouncementRepository';
import { Announcement } from '@/types/database';
import { PaginationOptions, PaginatedResult } from '@/types/common';

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
    // TODO: Map DB response (snake_case) to Announcement type (camelCase) if needed
    return data as Announcement | null;
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

    const items = (data as Announcement[]) || [];
    const nextCursor = items.length === limit ? to + 1 : null;

    // TODO: Map DB response array if needed

    return {
      items: items,
      nextCursor: nextCursor,
      hasMore: nextCursor !== null,
      totalCount: count ?? undefined,
    };
  }

  async create(announcementData: Omit<Announcement, 'id' | 'timestamp'>): Promise<Announcement> {
    // TODO: Map Announcement type (camelCase) to DB schema (snake_case) if needed
    const dbData = {
        company_id: announcementData.companyId, // Assuming snake_case
        title: announcementData.title,
        content: announcementData.content,
        posted_by: announcementData.postedBy, // Assuming snake_case
        expiration: announcementData.expiration, // Assuming timestamp type
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
    // TODO: Map DB response back to Announcement type if needed
    return data as Announcement;
  }

  async update(id: string, updates: Partial<Omit<Announcement, 'id' | 'timestamp' | 'companyId' | 'userId'>>): Promise<Announcement | null> {
     // TODO: Map updates if needed (e.g., postedBy to posted_by)
     const { postedBy, ...restUpdates } = updates;
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
    // TODO: Map DB response back to Announcement type if needed
    return data as Announcement | null;
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